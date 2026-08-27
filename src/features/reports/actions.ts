'use server'

import { createHash, randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireActiveBillingAccess } from '@/features/billing'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { normalizeEvidenceCategory } from '@/features/capture/evidence-category'
import { DEFAULT_REPORT_TYPE, SESSION_METADATA_FIELDS, normalizeReportType, normalizeSessionMetadata, sessionMetadataToJson } from '@/features/sessions/report-types'
import { appendDiagnosticReportApprovedAuditEvent } from '@/features/diagnostic-procedures/actions'
import { recordUsageEvent, requireUsageAllowance } from '@/features/usage'
import { ReportEmailError, sendReportEmail, validateReportEmailRecipients } from '@/lib/email/reports'
import { FINAL_NOTES_MODEL, FINAL_NOTES_PROMPT_VERSION, generateFinalNotes } from '@/lib/openai/final-notes-generator'
import { AI_REPORT_DRAFT_MODEL, AI_REPORT_DRAFT_PROMPT_VERSION, generateReportDraft } from '@/lib/openai/report-draft-generator'
import { improveReportSummaryWriting, regenerateReportSummaryFromEvidence, type SummaryStyle } from '@/lib/openai/report-summary-assistant'
import { generateObservationWriting, type ObservationWritingAction } from '@/lib/openai/observation-writing-assistant'
import {
  generateObservationTitles,
  OBSERVATION_TITLE_MODEL,
  OBSERVATION_TITLE_PROMPT_VERSION,
} from '@/lib/openai/observation-title-generator'
import {
  getObservationReportTitleState,
  getStoredObservationTitle,
  mergeSuggestedObservationTitle,
} from '@/features/reports/observation-titles'
import type { OrganizationPlan } from '@/lib/stripe'
import { buildEvidenceGroups, buildEvidencePackages,
  sanitizeReportStructureForSession, buildNormalizedReportFields, deriveFormSectionsFromCaptures, extractFormBlueprint, mapEvidenceToFormBlueprint, scoreFormReferenceCapture, selectPrimaryFormCaptures, stripConfidenceText, GENERIC_REPORT_SECTION_TITLES, getReportStructureSourceMetadata, sanitizeCapturesForImageAiAssist, getFormStructureReliability } from '@/features/reports/report-structure'
import { buildSafeReportTitle, isPlaceholderReportTitle } from '@/features/reports/report-title'
import { isCaptureIncludedInOutput } from '@/features/reports/capture-inclusion'
import type { Json } from '@/lib/supabase/database.types'

const REPORT_SHARE_EXPIRATION_DAYS = 30

function isReferenceDocumentCapture(capture: { technician_note?: string | null; transcript?: string | null; media_kind?: string | null; type?: string | null; extracted_data?: Json | null }) {
  const technicianEnteredText = capture.technician_note?.trim() || capture.transcript?.trim()
  if (technicianEnteredText) return false
  return capture.media_kind === 'document' || capture.type === 'document'
}

function isTechnicianOwnedDiagnosticSection(title: string) {
  return title === 'Diagnostic Summary' || title === 'Recommended Next Step / Escalation'
}

function diagnosticPlaceholderForTitle(title: string) {
  if (title === 'Diagnostic Summary') return 'No technician diagnostic summary entered.'
  if (title === 'Recommended Next Step / Escalation') return 'No technician next step or escalation note entered.'
  return null
}

function genericFallbackDraftSections(draftOutput: Awaited<ReturnType<typeof generateReportDraft>>, captures: Array<{ id: string; technician_note?: string | null; transcript?: string | null; media_kind?: string | null; type?: string | null; extracted_data?: Json | null }> = []) {
  const allCaptureIds = captures.map((capture) => capture.id)
  const vehicleEvidenceCaptureIds = captures.filter((capture) => !isReferenceDocumentCapture(capture)).map((capture) => capture.id)
  const referenceDocumentCaptureIds = captures.filter(isReferenceDocumentCapture).map((capture) => capture.id)
  const noteCaptureIds = captures.filter((capture) => capture.technician_note?.trim() || capture.transcript?.trim() || capture.type === 'text_note' || capture.media_kind === 'note' || capture.media_kind === 'audio').map((capture) => capture.id)
  return GENERIC_REPORT_SECTION_TITLES.map((title, index) => {
    const matchingSection = isTechnicianOwnedDiagnosticSection(title) ? null : draftOutput.sections.find((section) => {
      const normalizedTitle = section.title.toLowerCase()
      if (title === 'Customer Concern') return /customer|concern|complaint/.test(normalizedTitle)
      if (title === 'Vehicle / Asset Information') return /vehicle|asset|unit|vin|serial|odometer|hour/.test(normalizedTitle)
      if (title === 'DTCs / Fault Codes') return /dtc|fault|code|retrieved/.test(normalizedTitle)
      if (title === 'Freeze Frame Data') return /freeze frame|snapshot/.test(normalizedTitle)
      if (title === 'Live Data / Measurements') return /live data|pid|measurement|reading/.test(normalizedTitle)
      if (title === 'Functional Tests') return /functional|output state|actuation|test/.test(normalizedTitle)
      if (title === 'Repairs Performed') return /repair|replaced|adaptation/.test(normalizedTitle)
      if (title === 'Verification / Retest Results') return /verification|retest|post repair|verify/.test(normalizedTitle)
      if (title === 'Road Test Results') return /road test|drive cycle/.test(normalizedTitle)
      if (title === 'Technician Observations') return /technician|observation|note/.test(normalizedTitle)
      if (title === 'Reference Documents Reviewed') return /workshop|manual|reference|recall|tsb|pinpoint/.test(normalizedTitle)
      if (title === 'Evidence Appendix') return /evidence|appendix|capture|photo/.test(normalizedTitle)
      if (title === 'Inspector / Facility Details') return /inspector|facility/.test(normalizedTitle)
      if (title === 'Signoff') return /sign|approval/.test(normalizedTitle)
      return false
    })

    return {
      section_key: title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      title,
      body: diagnosticPlaceholderForTitle(title) ?? matchingSection?.body ?? null,
      status: matchingSection?.status ?? 'informational' as const,
      confidence: matchingSection?.confidence ?? draftOutput.confidence,
      source_capture_ids: getSectionSourceCaptureIds(title, matchingSection?.source_capture_ids, allCaptureIds, noteCaptureIds, vehicleEvidenceCaptureIds, referenceDocumentCaptureIds),
      sort_order: index,
      metadata: {
        source_field_group: title,
        related_capture_ids: [],
        fields: [],
        generic_fallback_section: true,
      } as Json,
    }
  })
}

function getSectionSourceCaptureIds(title: string, existingIds: string[] | null | undefined, allCaptureIds: string[], noteCaptureIds: string[], vehicleEvidenceCaptureIds = allCaptureIds, referenceDocumentCaptureIds: string[] = []) {
  if (existingIds?.length) return existingIds.filter((id) => allCaptureIds.includes(id))
  if (title === 'Technician Observations') return noteCaptureIds
  if (isTechnicianOwnedDiagnosticSection(title)) return noteCaptureIds
  if (title === 'Reference Documents Reviewed') return referenceDocumentCaptureIds
  if (title === 'Evidence Appendix') return allCaptureIds
  if (['Customer Concern', 'Vehicle / Asset Information', 'DTCs / Fault Codes', 'Freeze Frame Data', 'Live Data / Measurements', 'Functional Tests', 'Repairs Performed', 'Verification / Retest Results', 'Road Test Results'].includes(title)) return vehicleEvidenceCaptureIds
  return []
}

function ensureDraftSectionsReferenceCaptures<T extends { title: string; source_capture_ids: string[] }>(sections: T[], captures: Array<{ id: string; technician_note?: string | null; transcript?: string | null; media_kind?: string | null; type?: string | null }>) {
  const allCaptureIds = captures.map((capture) => capture.id)
  const noteCaptureIds = captures.filter((capture) => capture.technician_note?.trim() || capture.transcript?.trim() || capture.type === 'text_note' || capture.media_kind === 'note' || capture.media_kind === 'audio').map((capture) => capture.id)
  return sections.map((section) => ({
    ...section,
    source_capture_ids: getSectionSourceCaptureIds(section.title, section.source_capture_ids, allCaptureIds, noteCaptureIds),
  }))
}


function isPlaceholderSessionTitle(title: string | null | undefined) {
  return isPlaceholderReportTitle(title)
}

function getString(formData: FormData, field: string) {
  const value = formData.get(field)
  return typeof value === 'string' ? value.trim() : ''
}

function getSummaryAssistantCaptureText(value: unknown, keys: string[] = ['caption', 'note', 'notes', 'observation', 'observed_condition', 'finding', 'description', 'summary']) {
  if (!value || typeof value !== 'object') return null
  const stack = [value]
  while (stack.length) {
    const current = stack.shift()
    if (!current || typeof current !== 'object' || Array.isArray(current)) continue
    for (const [key, nested] of Object.entries(current)) {
      if (typeof nested === 'string' && keys.includes(key.toLowerCase()) && nested.trim()) return nested.trim()
      if (nested && typeof nested === 'object') stack.push(nested)
    }
  }
  return null
}

function getReportLocationHint(session: { suggested_details?: Json | null; session_metadata?: Json | null }) {
  const candidates = [session.suggested_details, session.session_metadata]
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const record = candidate as Record<string, unknown>
    const direct = ['location', 'property_address', 'address', 'site_address']
      .map((key) => record[key])
      .find((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    if (direct) return direct.trim()
    const reportInfo = record.report_information
    if (reportInfo && typeof reportInfo === 'object' && !Array.isArray(reportInfo)) {
      const nested = ['location', 'property_address', 'address', 'site_address']
        .map((key) => (reportInfo as Record<string, unknown>)[key])
        .find((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      if (nested) return nested.trim()
    }
  }
  return null
}

function getRecipients(formData: FormData) {
  return getString(formData, 'recipients')
}

function getReportRedirectPath(sessionId: string, params: Record<string, string | number> = {}) {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => searchParams.set(key, String(value)))
  const query = searchParams.toString()

  return `/dashboard/sessions/${sessionId}/report${query ? `?${query}` : ''}`
}

function getSessionStepRedirectPath(
  sessionId: string,
  step: 'approve' | 'export',
  params: Record<string, string | number> = {},
) {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => searchParams.set(key, String(value)))
  const query = searchParams.toString()

  return `/dashboard/sessions/${sessionId}/${step}${query ? `?${query}` : ''}`
}

function getPublicAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()

  if (!appUrl) {
    console.error('Report email delivery requires NEXT_PUBLIC_APP_URL to generate public share links.')
    throw new ReportEmailError('Email delivery is not configured.')
  }

  try {
    return new URL(appUrl).origin
  } catch {
    console.error('Report email delivery has an invalid NEXT_PUBLIC_APP_URL value.')
    throw new ReportEmailError('Email delivery is not configured.')
  }
}

async function requireOwnedSession(sessionId: string) {
  const workspace = await requireSessionWorkspace()
  const { data: session, error } = await workspace.supabase
    .from('documentation_sessions')
    .select('id, title, organization_id, review_status, status')
    .eq('id', sessionId)
    .eq('organization_id', workspace.profile.organization_id)
    .single()
  if (error || !session) redirect(getReportRedirectPath(sessionId, { error: 'Documentation session not found.' }))
  return { ...workspace, session }
}

function reportIsReadyForDelivery(session: { review_status?: string | null; status?: string | null }) {
  return session.review_status === 'ready_for_delivery' || session.status === 'finalized'
}

function requireReportReadyForDelivery(
  sessionId: string,
  session: { review_status?: string | null; status?: string | null },
) {
  if (!reportIsReadyForDelivery(session)) {
    redirect(
      getSessionStepRedirectPath(sessionId, 'approve', {
        error: 'Approve this report before exporting.',
      }),
    )
  }
}





export type ObservationWritingActionState = { ok: boolean; error?: string; text?: string }

function getObservationAssistantErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === 'OPENAI_API_KEY_MISSING') return 'AI observation writing tools are not configured for this workspace.'
  return error instanceof Error && error.message ? error.message : 'AI observation writing tool failed. Please try again.'
}

function getObservationWritingAction(value: string): ObservationWritingAction | null {
  const allowed: ObservationWritingAction[] = ['improve_writing', 'rewrite_for_customer', 'make_more_technical', 'make_more_concise', 'expand_description', 'generate_observation', 'generate_recommendation', 'explain_clearly']
  return allowed.includes(value as ObservationWritingAction) ? value as ObservationWritingAction : null
}

function getObservationAssistantText(value: unknown, keys: string[] = ['caption', 'description', 'summary', 'generated_note', 'generated_observation', 'detected_objects', 'objects', 'metadata', 'ocr_text', 'extracted_text']) {
  if (!value || typeof value !== 'object') return null
  const found: string[] = []
  const stack = [value]
  while (stack.length && found.join(' ').length < 2000) {
    const current = stack.shift()
    if (!current || typeof current !== 'object' || Array.isArray(current)) continue
    for (const [key, nested] of Object.entries(current)) {
      if (typeof nested === 'string' && keys.includes(key.toLowerCase()) && nested.trim()) found.push(nested.trim())
      if (nested && typeof nested === 'object') stack.push(nested)
    }
  }
  return found.length ? found.join(' | ').slice(0, 2000) : null
}

export async function runObservationWritingAction(_state: ObservationWritingActionState, formData: FormData): Promise<ObservationWritingActionState> {
  const workspace = await requireSessionWorkspace()
  const sessionId = getString(formData, 'session_id')
  const captureId = getString(formData, 'capture_id')
  const action = getObservationWritingAction(getString(formData, 'action'))
  if (!sessionId || !captureId || !action) return { ok: false, error: 'Select one item before using the writing assistant.' }

  const allowance = await requireSummaryAssistantAllowance(workspace)
  if (!allowance.ok) return { ok: false, error: allowance.error }

  try {
    const { data: draft } = await workspace.supabase
      .from('ai_report_drafts')
      .select('id, title, header_fields, report_structure')
      .eq('documentation_session_id', sessionId)
      .eq('organization_id', workspace.profile.organization_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: session } = await workspace.supabase
      .from('documentation_sessions')
      .select('title, session_type, customer_name, asset_label, suggested_details, session_metadata')
      .eq('id', sessionId)
      .eq('organization_id', workspace.profile.organization_id)
      .single()

    const { data: captures, error: capturesError } = await workspace.supabase
      .from('capture_items')
      .select('id, type, media_kind, captured_at, technician_note, customer_facing_observation, original_technician_note, last_ai_observation, transcript, ai_summary, ocr_text, extracted_data, capture_ai_analysis, evidence_category, observation_group_id, group_order, include_in_report, deleted_at')
      .eq('documentation_session_id', sessionId)
      .eq('organization_id', workspace.profile.organization_id)
      .is('deleted_at', null)
      .order('report_order', { ascending: true, nullsFirst: false })
      .order('captured_at', { ascending: true })
    if (capturesError) return { ok: false, error: capturesError.message }

    const includedCaptures = (captures ?? []).filter(isCaptureIncludedInOutput)
    const primary = includedCaptures.find((capture) => capture.id === captureId)
    if (!primary) return { ok: false, error: 'Item not found.' }
    const supportsCapture = primary.observation_group_id
      ? includedCaptures.find((capture) => capture.id === primary.observation_group_id)
      : null
    const nearbyObservations = includedCaptures
      .filter((capture) => capture.id !== primary.id)
      .slice(Math.max(0, includedCaptures.findIndex((capture) => capture.id === primary.id) - 2), includedCaptures.findIndex((capture) => capture.id === primary.id) + 3)
      .filter((capture) => capture.id !== primary.id)
      .slice(0, 4)
      .map((capture) => ({
        title: getStoredObservationTitle(capture.extracted_data),
        classification: normalizeEvidenceCategory(capture.evidence_category),
        text: capture.customer_facing_observation?.trim() || capture.technician_note?.trim() || capture.transcript?.trim() || getObservationAssistantText(capture.extracted_data) || capture.ai_summary?.trim() || null,
      }))

    const supportingImages = [primary].map((capture) => ({
      id: capture.id,
      title: getStoredObservationTitle(capture.extracted_data),
      technicianNote: capture.technician_note?.trim() || capture.transcript?.trim() || null,
      aiDescription: getObservationAssistantText(capture.capture_ai_analysis) || getObservationAssistantText(capture.extracted_data) || capture.ai_summary?.trim() || capture.ocr_text?.trim() || null,
      detectedObjects: isRecord(capture.capture_ai_analysis) ? capture.capture_ai_analysis.detected_objects ?? capture.capture_ai_analysis.objects ?? null : null,
      extractedMetadata: capture.extracted_data ?? null,
    }))
    const currentText = getString(formData, 'current_text').slice(0, 4000) || primary.customer_facing_observation || primary.technician_note || null
    const classification = getString(formData, 'classification') || normalizeEvidenceCategory(primary?.evidence_category)
    const technicianNote = primary.technician_note?.trim() || primary.transcript?.trim() || null
    const generated = await generateObservationWriting({
      action,
      classification,
      currentText,
      observationTitle: getString(formData, 'observation_title') || getStoredObservationTitle(primary.extracted_data),
      technicianNote,
      observationType: primary?.type ?? null,
      concern: classification === 'concern' ? currentText : null,
      observation: classification === 'observation' ? currentText : primary.customer_facing_observation ?? null,
      supportingEvidence: supportingImages.map((item) => [item.title, item.aiDescription].filter(Boolean).join(': ')).filter(Boolean).join('\n') || null,
      recommendedAction: classification === 'recommended_action' ? currentText : null,
      supportingImages,
      supportsRelationship: supportsCapture ? `Supports ${getStoredObservationTitle(supportsCapture.extracted_data) || supportsCapture.technician_note?.slice(0, 120) || supportsCapture.id}` : 'Standalone',
      sessionContext: {
        reportTitle: draft?.title ?? session?.title ?? null,
        assetType: session?.asset_label ?? null,
        customerType: session?.customer_name ? 'customer' : null,
        industry: typeof session?.session_type === 'string' ? session.session_type : null,
      },
      nearbyObservations,
    })
    await recordUsageEvent({
      supabase: workspace.supabase,
      organizationId: workspace.profile.organization_id,
      eventType: 'ai_report_draft_generation',
      quantity: 1,
      metadata: { session_id: sessionId, capture_id: captureId, operation: 'capture_observation_writing', action },
    })
    return { ok: true, text: generated }
  } catch (error) {
    return { ok: false, error: getObservationAssistantErrorMessage(error) }
  }
}

export type SummaryAssistantActionState = { ok: boolean; error?: string; summary?: string }

function getSummaryStyle(value: FormDataEntryValue | null): SummaryStyle {
  return value === 'concise' || value === 'detailed' ? value : 'professional'
}

function getSummaryAssistantErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === 'OPENAI_API_KEY_MISSING') return 'AI summary tools are not configured for this workspace.'
  return error instanceof Error && error.message ? error.message : 'AI summary tool failed. Please try again.'
}

async function requireSummaryAssistantAllowance(workspace: Awaited<ReturnType<typeof requireSessionWorkspace>>) {
  const billingAccess = requireActiveBillingAccess(workspace.profile)
  if (!billingAccess.ok) return { ok: false as const, error: billingAccess.message }
  const aiAllowance = await requireUsageAllowance({
    supabase: workspace.supabase,
    organizationId: workspace.profile.organization_id,
    plan: billingAccess.access.plan,
    eventType: 'ai_report_draft_generation',
  })
  if (!aiAllowance.ok) return { ok: false as const, error: aiAllowance.message }
  return { ok: true as const, plan: billingAccess.access.plan }
}

async function getActiveSummaryDraft(workspace: Awaited<ReturnType<typeof requireSessionWorkspace>>, sessionId: string) {
  const { data: drafts, error } = await workspace.supabase
    .from('ai_report_drafts')
    .select('id, status, summary, title, header_fields, report_structure, generated_at, created_at')
    .eq('documentation_session_id', sessionId)
    .eq('organization_id', workspace.profile.organization_id)
    .order('generated_at', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (drafts ?? []).find((item) => item.status === 'approved') ?? (drafts ?? []).find((item) => item.status !== 'superseded') ?? drafts?.[0] ?? null
}

export type SaveReportSummaryState = { ok: boolean; error?: string; summary?: string }

export async function saveReportSummaryFromStudio(_state: SaveReportSummaryState, formData: FormData): Promise<SaveReportSummaryState> {
  const workspace = await requireSessionWorkspace()
  const { supabase, profile } = workspace
  const sessionId = getString(formData, 'session_id')
  if (!sessionId) return { ok: false, error: 'Select a session before saving the summary.' }

  const { data: session } = await supabase
    .from('documentation_sessions')
    .select('review_status, status')
    .eq('id', sessionId)
    .eq('organization_id', profile.organization_id)
    .maybeSingle()
  if (session && reportIsReadyForDelivery(session)) {
    return { ok: false, error: 'This report is approved and read-only.' }
  }

  const { data: drafts, error: draftError } = await supabase
    .from('ai_report_drafts')
    .select('id, status, generated_at, created_at')
    .eq('documentation_session_id', sessionId)
    .eq('organization_id', profile.organization_id)
    .order('generated_at', { ascending: false })
    .order('created_at', { ascending: false })

  if (draftError) return { ok: false, error: draftError.message }
  const draft = (drafts ?? []).find((item) => item.status === 'approved') ?? (drafts ?? []).find((item) => item.status !== 'superseded') ?? drafts?.[0] ?? null
  if (!draft) return { ok: false, error: 'Generate a report draft before editing the executive summary.' }

  const summary = getString(formData, 'report_summary').slice(0, 1200)
  const now = new Date().toISOString()
  // Canonical customer-facing report summary: ai_report_drafts.summary.
  // Review, Report Studio preview, and PDF export all read this field before using any deterministic fallback.
  const { error } = await supabase
    .from('ai_report_drafts')
    .update({ summary: summary || null, updated_at: now })
    .eq('id', draft.id)
    .eq('organization_id', profile.organization_id)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/dashboard/sessions/${sessionId}/report`)
  revalidatePath('/dashboard/settings/branding')
  return { ok: true, summary }
}


export async function improveReportSummaryAction(_state: SummaryAssistantActionState, formData: FormData): Promise<SummaryAssistantActionState> {
  const workspace = await requireSessionWorkspace()
  const sessionId = getString(formData, 'session_id')
  const currentSummary = getString(formData, 'report_summary').slice(0, 1200)
  if (!sessionId) return { ok: false, error: 'Select a session before improving the summary.' }
  if (!currentSummary) return { ok: false, error: 'Enter a summary before improving writing.' }

  const allowance = await requireSummaryAssistantAllowance(workspace)
  if (!allowance.ok) return { ok: false, error: allowance.error }

  try {
    const summary = await improveReportSummaryWriting(currentSummary)
    await recordUsageEvent({
      supabase: workspace.supabase,
      organizationId: workspace.profile.organization_id,
      eventType: 'ai_report_draft_generation',
      quantity: 1,
      metadata: { session_id: sessionId, operation: 'summary_improve_writing' },
    })
    return { ok: true, summary }
  } catch (error) {
    return { ok: false, error: getSummaryAssistantErrorMessage(error) }
  }
}

export async function regenerateReportSummaryAction(_state: SummaryAssistantActionState, formData: FormData): Promise<SummaryAssistantActionState> {
  const workspace = await requireSessionWorkspace()
  const sessionId = getString(formData, 'session_id')
  const summaryStyle = getSummaryStyle(formData.get('summary_style'))
  if (!sessionId) return { ok: false, error: 'Select a session before regenerating the summary.' }

  const allowance = await requireSummaryAssistantAllowance(workspace)
  if (!allowance.ok) return { ok: false, error: allowance.error }

  try {
    const draft = await getActiveSummaryDraft(workspace, sessionId)
    if (!draft) return { ok: false, error: 'Generate a report draft before regenerating the executive summary.' }

    const { data: session, error: sessionError } = await workspace.supabase
      .from('documentation_sessions')
      .select('title, customer_name, asset_label, unit_number, suggested_details, session_metadata')
      .eq('id', sessionId)
      .eq('organization_id', workspace.profile.organization_id)
      .single()
    if (sessionError) return { ok: false, error: sessionError.message }

    const { data: sections, error: sectionsError } = await workspace.supabase
      .from('ai_report_draft_sections')
      .select('title, body, status, source_capture_ids, sort_order')
      .eq('ai_report_draft_id', draft.id)
      .eq('organization_id', workspace.profile.organization_id)
      .order('sort_order', { ascending: true })
    if (sectionsError) return { ok: false, error: sectionsError.message }

    const { data: captures, error: capturesError } = await workspace.supabase
      .from('capture_items')
      .select('id, type, media_kind, captured_at, technician_note, transcript, ai_summary, ocr_text, extracted_data, capture_ai_analysis, evidence_category, include_in_report, evidence_review_status, deleted_at, source_kind, source_metadata, observation_group_id, group_order')
      .eq('documentation_session_id', sessionId)
      .eq('organization_id', workspace.profile.organization_id)
      .is('deleted_at', null)
      .order('report_order', { ascending: true, nullsFirst: false })
      .order('captured_at', { ascending: true })
    if (capturesError) return { ok: false, error: capturesError.message }

    const includedCaptures = (captures ?? []).filter(isCaptureIncludedInOutput)
    const captureEvidence = includedCaptures.map((capture) => {
      const technicianText = capture.technician_note?.trim() || capture.transcript?.trim() || null
      return {
        source: 'included_capture_item' as const,
        capture_id: capture.id,
        observation_group_id: capture.observation_group_id,
        group_order: capture.group_order,
        title: getStoredObservationTitle(capture.extracted_data),
        technician_note: capture.technician_note?.trim() || null,
        transcript: !capture.technician_note?.trim() ? capture.transcript?.trim() || null : null,
        caption: technicianText ?? getSummaryAssistantCaptureText(capture.extracted_data) ?? getSummaryAssistantCaptureText(capture.capture_ai_analysis) ?? capture.ai_summary?.trim() ?? null,
        evidence_category: normalizeEvidenceCategory(capture.evidence_category),
        media_kind: capture.media_kind,
        captured_at: capture.captured_at,
      }
    }).filter((item) => item.caption || item.technician_note || item.transcript || item.title)

    if (includedCaptures.length > 0 && captureEvidence.length === 0) {
      console.warn('[summary-assistant] Included capture items found but no observation text was extracted for regeneration.', {
        session_id: sessionId,
        draft_id: draft.id,
        included_capture_count: includedCaptures.length,
      })
    }

    const summary = await regenerateReportSummaryFromEvidence({
      sessionTitle: session?.title ?? null,
      reportContext: {
        title: draft.title ?? session?.title ?? null,
        customer: session?.customer_name ?? null,
        asset: session?.asset_label ?? null,
        unit: session?.unit_number ?? null,
        location: getReportLocationHint(session ?? {}),
        header_fields: draft.header_fields,
      },
      captures: captureEvidence,
      evidenceGroups: isRecord(draft.report_structure) ? draft.report_structure.evidence_groups : null,
      style: summaryStyle,
      evidence: (sections ?? []).map((section) => ({
        title: section.title,
        body: stripConfidenceText(section.body ?? ''),
        status: section.status,
        source_capture_ids: Array.isArray(section.source_capture_ids) ? section.source_capture_ids.filter((id): id is string => typeof id === 'string') : [],
      })),
    })
    await recordUsageEvent({
      supabase: workspace.supabase,
      organizationId: workspace.profile.organization_id,
      eventType: 'ai_report_draft_generation',
      quantity: 1,
      metadata: { session_id: sessionId, draft_id: draft.id, operation: 'summary_regenerate', summary_style: summaryStyle },
    })
    return { ok: true, summary }
  } catch (error) {
    return { ok: false, error: getSummaryAssistantErrorMessage(error) }
  }
}

export async function saveFinalNotes(sessionId: string, formData: FormData) {
  const { supabase, profile, session } = await requireOwnedSession(sessionId)
  const finalNotes = getString(formData, 'final_notes').slice(0, 6000)
  const includeInExport = formData.get('include_final_notes_in_export') === 'on'
  const { error } = await supabase
    .from('documentation_sessions')
    .update({
      final_notes: finalNotes || null,
      final_notes_ai_generated: false,
      final_notes_updated_at: new Date().toISOString(),
      final_notes_edited_by_user: true,
      include_final_notes_in_export: includeInExport,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.id)
    .eq('organization_id', profile.organization_id)
  if (error) redirect(getReportRedirectPath(session.id, { error: error.message }))
  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  redirect(getReportRedirectPath(session.id, { notes: 1 }))
}

export async function generateFinalNotesForSession(sessionId: string) {
  const { supabase, profile, session } = await requireOwnedSession(sessionId)
  const billingAccess = requireActiveBillingAccess(profile)
  if (!billingAccess.ok) redirect(getReportRedirectPath(session.id, { error: billingAccess.message }))

  const aiAllowance = await requireUsageAllowance({
    supabase,
    organizationId: profile.organization_id,
    plan: billingAccess.access.plan,
    eventType: 'ai_report_draft_generation',
  })
  if (!aiAllowance.ok) redirect(getReportRedirectPath(session.id, { error: aiAllowance.message }))

  const { data: fullSession, error: fullSessionError } = await supabase
    .from('documentation_sessions')
    .select('id, title, session_type, session_metadata, asset_label, vin, unit_number, customer_name, field_service_details')
    .eq('id', session.id)
    .eq('organization_id', profile.organization_id)
    .single()
  if (fullSessionError || !fullSession) redirect(getReportRedirectPath(session.id, { error: 'Documentation session not found.' }))

  const { data: captures, error: capturesError } = await supabase
    .from('capture_items')
    .select('id, type, media_kind, captured_at, technician_note, transcript, extracted_data, evidence_category')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .order('report_order', { ascending: true, nullsFirst: false })
    .order('captured_at', { ascending: true })
  if (capturesError) redirect(getReportRedirectPath(session.id, { error: capturesError.message }))

  const { data: currentDraft } = await supabase
    .from('ai_report_drafts')
    .select('findings, measurements')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .not('status', 'in', '(superseded)')
    .order('generated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let notes: string
  try {
    notes = await generateFinalNotes({
      session: fullSession,
      captures: sanitizeCapturesForImageAiAssist(captures ?? [], true),
      findings: currentDraft?.findings ?? [],
      recommendations: currentDraft?.measurements ?? [],
    })
  } catch (error) {
    redirect(getReportRedirectPath(session.id, { error: getReportDraftErrorMessage(error) }))
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('documentation_sessions')
    .update({
      final_notes: notes,
      final_notes_ai_generated: true,
      final_notes_updated_at: now,
      final_notes_edited_by_user: false,
      updated_at: now,
    })
    .eq('id', session.id)
    .eq('organization_id', profile.organization_id)
  if (error) redirect(getReportRedirectPath(session.id, { error: error.message }))

  await recordUsageEvent({
    supabase,
    organizationId: profile.organization_id,
    eventType: 'ai_report_draft_generation',
    metadata: { session_id: session.id, operation: 'final_notes_generation', model: FINAL_NOTES_MODEL, prompt_version: FINAL_NOTES_PROMPT_VERSION },
    createdBy: profile.id,
  })
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  redirect(getReportRedirectPath(session.id, { notes_generated: 1 }))
}

export async function markReportReviewed(sessionId: string, formData: FormData) {
  const missingEvidenceCount = Number(getString(formData, 'missing_evidence_count') || 0)
  const missingEvidenceAcknowledged = formData.get('missing_evidence_acknowledged') === 'on'
  const { supabase, profile, session } = await requireOwnedSession(sessionId)

  if (missingEvidenceCount > 0 && !missingEvidenceAcknowledged) {
    redirect(
      getSessionStepRedirectPath(session.id, 'approve', {
        error: 'Please confirm you considered the suggestions before approving this report.',
      }),
    )
  }

  const { data: reportDrafts } = await supabase
    .from('ai_report_drafts')
    .select('id, status, report_structure')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .not('status', 'eq', 'superseded')
    .order('generated_at', { ascending: false })

  const reportDraft = reportDrafts?.[0] ?? null
  if (!reportDraft) {
    redirect(
      getSessionStepRedirectPath(session.id, 'approve', {
        error: 'The report is still preparing. Review it before approval.',
      }),
    )
  }

  const reportStructure = (reportDrafts ?? []).map((draft) => draft.report_structure).find((structure) => isRecord(structure) && structure.mode === 'diagnostic_procedure')
  if (isRecord(reportStructure) && reportStructure.signed_off !== true) {
    redirect(getSessionStepRedirectPath(session.id, 'approve', { error: 'Technician sign-off is required before approving diagnostic documentation for export.' }))
  }

  const { error } = await supabase
    .from('documentation_sessions')
    .update({
      review_status: 'ready_for_delivery',
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile.id,
    })
    .eq('id', session.id)
    .eq('organization_id', profile.organization_id)

  if (error) {
    redirect(getSessionStepRedirectPath(session.id, 'approve', { error: error.message }))
  }

  await appendDiagnosticReportApprovedAuditEvent(session.id)

  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  revalidatePath(`/dashboard/sessions/${session.id}/approve`)
  revalidatePath(`/dashboard/sessions/${session.id}/export`)
  redirect(getSessionStepRedirectPath(session.id, 'export', { reviewed: 1 }))
}

async function getOrCreateActiveShareToken({
  createdBy,
  organizationId,
  sessionId,
  supabase,
  plan,
}: {
  createdBy: string
  organizationId: string
  sessionId: string
  supabase: Awaited<ReturnType<typeof requireSessionWorkspace>>['supabase']
  plan: OrganizationPlan | null
}) {
  const now = new Date()
  const { data: existingTokens, error: existingTokenError } = await supabase
    .from('report_share_tokens')
    .select('id, token, expires_at')
    .eq('documentation_session_id', sessionId)
    .eq('organization_id', organizationId)
    .eq('link_kind', 'report')
    .is('deliverable_id', null)
    .is('disabled_at', null)
    .order('created_at', { ascending: false })

  if (existingTokenError) {
    throw new ReportEmailError(existingTokenError.message)
  }

  const activeToken = existingTokens?.find((shareToken) => !shareToken.expires_at || new Date(shareToken.expires_at) > now)
  if (activeToken) {
    return activeToken.token
  }

  const shareAllowance = await requireUsageAllowance({
    supabase,
    organizationId,
    plan,
    eventType: 'share_link_created',
  })

  if (!shareAllowance.ok) {
    throw new ReportEmailError(shareAllowance.message)
  }

  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + REPORT_SHARE_EXPIRATION_DAYS)

  const { data: createdToken, error: createTokenError } = await supabase
    .from('report_share_tokens')
    .insert({
      documentation_session_id: sessionId,
      organization_id: organizationId,
      token: randomBytes(24).toString('hex'),
      expires_at: expiresAt.toISOString(),
      created_by: createdBy,
    })
    .select('token')
    .single()

  if (createTokenError || !createdToken) {
    throw new ReportEmailError(createTokenError?.message ?? 'Could not create secure report link.')
  }

  await recordUsageEvent({
    supabase,
    organizationId,
    eventType: 'share_link_created',
    metadata: { session_id: sessionId, delivery: 'email_report' },
    createdBy,
  })

  return createdToken.token
}

export async function emailReport(sessionId: string, formData: FormData) {
  const message = getString(formData, 'message')
  let recipients: string[]

  try {
    recipients = validateReportEmailRecipients(getRecipients(formData))
  } catch (error) {
    const message = error instanceof ReportEmailError ? error.message : 'Check the recipient email addresses.'
    redirect(getSessionStepRedirectPath(sessionId, 'export', { error: message }))
  }

  const { supabase, profile, session } = await requireOwnedSession(sessionId)
  requireReportReadyForDelivery(session.id, session)
  const billingAccess = requireActiveBillingAccess(profile)
  if (!billingAccess.ok) {
    redirect(getSessionStepRedirectPath(session.id, 'export', { error: billingAccess.message }))
  }

  const emailAllowance = await requireUsageAllowance({
    supabase,
    organizationId: profile.organization_id,
    plan: billingAccess.access.plan,
    eventType: 'email_report_sent',
  })

  if (!emailAllowance.ok) {
    redirect(getSessionStepRedirectPath(session.id, 'export', { error: emailAllowance.message }))
  }

  const subject = `CRED Report - ${session.title}`
  let providerMessageId: string

  try {
    const token = await getOrCreateActiveShareToken({
      createdBy: profile.id,
      organizationId: profile.organization_id,
      sessionId: session.id,
      supabase,
      plan: billingAccess.access.plan,
    })
    const reportUrl = `${getPublicAppUrl()}/reports/share/${token}`
    const result = await sendReportEmail({
      to: recipients,
      subject,
      message,
      reportUrl,
      organizationName: profile.organization.name,
      sessionTitle: session.title,
    })
    providerMessageId = result.id
    recipients = result.recipients
  } catch (error) {
    const message = error instanceof ReportEmailError ? error.message : 'Email could not be sent. Please try again.'
    redirect(getSessionStepRedirectPath(session.id, 'export', { error: message }))
  }

  const metadata: Json = {
    recipients,
    subject,
    branding: profile.organization.name,
    delivery: 'secure_printable_report_link',
    provider: 'sendgrid',
    provider_message_id: providerMessageId,
    custom_message_included: Boolean(message),
  }
  const { error } = await supabase.from('exports').insert({
    documentation_session_id: session.id,
    organization_id: profile.organization_id,
    export_type: 'email',
    status: 'sent',
    created_by: profile.id,
    metadata,
  })
  if (error) redirect(getSessionStepRedirectPath(session.id, 'export', { error: error.message }))
  await recordUsageEvent({
    supabase,
    organizationId: profile.organization_id,
    eventType: 'email_report_sent',
    metadata: { session_id: session.id, recipient_count: recipients.length },
    createdBy: profile.id,
  })
  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  revalidatePath(`/dashboard/sessions/${session.id}/export`)
  redirect(getSessionStepRedirectPath(session.id, 'export', { emailed: 1 }))
}

export async function createReportShareLink(sessionId: string, formData: FormData) {
  const expiresAt = getString(formData, 'expires_at') || null
  const { supabase, profile, session } = await requireOwnedSession(sessionId)
  requireReportReadyForDelivery(session.id, session)
  const billingAccess = requireActiveBillingAccess(profile)
  if (!billingAccess.ok) {
    redirect(getSessionStepRedirectPath(session.id, 'export', { error: billingAccess.message }))
  }

  const shareAllowance = await requireUsageAllowance({
    supabase,
    organizationId: profile.organization_id,
    plan: billingAccess.access.plan,
    eventType: 'share_link_created',
  })

  if (!shareAllowance.ok) {
    redirect(getSessionStepRedirectPath(session.id, 'export', { error: shareAllowance.message }))
  }

  const token = randomBytes(24).toString('hex')
  const { error } = await supabase.from('report_share_tokens').insert({
    documentation_session_id: session.id,
    organization_id: profile.organization_id,
    token,
    expires_at: expiresAt,
    created_by: profile.id,
  })
  if (error) redirect(getSessionStepRedirectPath(session.id, 'export', { error: error.message }))
  await recordUsageEvent({
    supabase,
    organizationId: profile.organization_id,
    eventType: 'share_link_created',
    metadata: { session_id: session.id, expires_at: expiresAt },
    createdBy: profile.id,
  })
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  revalidatePath(`/dashboard/sessions/${session.id}/export`)
  redirect(getSessionStepRedirectPath(session.id, 'export', { shared: 1 }))
}

export async function disableReportShareLink(sessionId: string, tokenId: string) {
  const { supabase, profile, session } = await requireOwnedSession(sessionId)
  const { error } = await supabase.from('report_share_tokens').update({ disabled_at: new Date().toISOString() }).eq('id', tokenId).eq('organization_id', profile.organization_id)
  if (error) redirect(getSessionStepRedirectPath(session.id, 'export', { error: error.message }))
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  revalidatePath(`/dashboard/sessions/${session.id}/export`)
  redirect(getSessionStepRedirectPath(session.id, 'export', { disabled: 1 }))
}

export async function saveReport(sessionId: string, formData?: FormData) {
  const { supabase, profile, session } = await requireOwnedSession(sessionId)
  requireReportReadyForDelivery(session.id, session)
  const billingAccess = requireActiveBillingAccess(profile)
  if (!billingAccess.ok) {
    redirect(getSessionStepRedirectPath(session.id, 'export', { error: billingAccess.message }))
  }

  const { error } = await supabase.from('exports').insert({
    documentation_session_id: session.id,
    organization_id: profile.organization_id,
    export_type: 'saved_report',
    status: 'saved',
    created_by: profile.id,
    metadata: { retention: 'indefinite_until_deleted', report_template_id: typeof formData?.get('report_template_id') === 'string' ? String(formData.get('report_template_id')) : 'workspace-default' },
  })
  if (error) redirect(getSessionStepRedirectPath(session.id, 'export', { error: error.message }))
  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/export`)
  redirect(getSessionStepRedirectPath(session.id, 'export', { saved: 1 }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeJson(value: unknown): Json {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value as Json
  if (isRecord(value)) return value as Json
  return null
}


function cleanDraftField(value: unknown, maxLength = 240) {
  return typeof value === 'string' ? stripConfidenceText(value).replace(/\s+/g, ' ').trim().slice(0, maxLength) : ''
}

function extractDocumentReportInformation(captures: Array<{ ocr_text?: string | null; extracted_data: Json | null }>) {
  const info: Record<string, string> = {}
  const normalizedFields = buildNormalizedReportFields(captures.map((capture, index) => ({
    id: `document-info-${index}`,
    type: 'document',
    media_kind: 'document',
    extracted_data: capture.extracted_data,
    ocr_text: capture.ocr_text ?? null,
  })))
  const setIfEmpty = (key: string, value: unknown) => {
    const cleaned = cleanDraftField(value)
    if (cleaned && !info[key]) info[key] = cleaned
  }

  for (const field of normalizedFields) {
    if (field.key === 'customer') setIfEmpty('customer_client', field.display_value)
    if (field.key === 'asset') setIfEmpty('asset_equipment', field.display_value)
    if (field.key === 'vin') setIfEmpty('asset_equipment', field.display_value)
    if (field.key === 'work_order' || field.key === 'po_number') setIfEmpty('reference_number', field.display_value)
  }

  for (const capture of captures) {
    const extractedData = isRecord(capture.extracted_data) ? capture.extracted_data : {}
    const extraction = isRecord(extractedData.extraction) ? extractedData.extraction : {}
    const fields = isRecord(extraction.fields) ? extraction.fields : {}
    Object.entries(fields).forEach(([key, value]) => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '_')
      if (/subject|inspect(ed)?_?by|report_for/.test(normalizedKey)) setIfEmpty('subject_name', value)
      if (/customer|client|owner/.test(normalizedKey)) setIfEmpty('customer_client', value)
      if (/asset|equipment|vehicle|unit|vin|serial/.test(normalizedKey)) setIfEmpty('asset_equipment', value)
      if (/location|address|site/.test(normalizedKey)) setIfEmpty('location', value)
      if (/work_order|repair_order|reference|job|invoice|po|purchase_order/.test(normalizedKey)) setIfEmpty('reference_number', value)
    })
  }

  return info
}

function detectDocumentReportType(captures: Array<{ ocr_text?: string | null; extracted_data: Json | null }>) {
  const titles = captures.flatMap((capture) => {
    const extractedData = isRecord(capture.extracted_data) ? capture.extracted_data : {}
    const sourceDocument = isRecord(extractedData.source_document) ? extractedData.source_document : {}
    const extraction = isRecord(extractedData.extraction) ? extractedData.extraction : {}
    return [sourceDocument.title, extraction.document_title, extraction.form_title]
  }).filter((value): value is string => typeof value === 'string' && value.trim().length >= 8)
  const trustedTitle = titles.find((title) => /\b(report|inspection|form|checklist)\b/i.test(title) && !/\b(battery|charging|electrical|starter|alternator)\b/i.test(title))
  return trustedTitle ? cleanDraftField(trustedTitle, 120) : null
}

function mergeDocumentContextIntoDraft(args: {
  draftOutput: Awaited<ReturnType<typeof generateReportDraft>>
  captures: Array<{ ocr_text?: string | null; extracted_data: Json | null }>
  session: { title: string; customer_name: string | null; asset_label: string | null; vin: string | null; unit_number: string | null; suggested_details: Json | null }
}) {
  const documentInfo = extractDocumentReportInformation(args.captures)
  const savedInfo = isRecord(args.session.suggested_details) && isRecord(args.session.suggested_details.report_information)
    ? args.session.suggested_details.report_information
    : {}
  const headerFields = isRecord(args.draftOutput.header_fields) ? { ...args.draftOutput.header_fields } : {}
  const setHeaderIfEmpty = (key: string, value: unknown) => {
    const cleaned = cleanDraftField(value)
    if (cleaned && !cleanDraftField(headerFields[key])) headerFields[key] = cleaned
  }

  Object.entries(documentInfo).forEach(([key, value]) => {
    if (!cleanDraftField(savedInfo[key])) setHeaderIfEmpty(key, value)
  })
  setHeaderIfEmpty('customer_name', args.session.customer_name || documentInfo.customer_client)
  setHeaderIfEmpty('asset_label', args.session.asset_label || documentInfo.asset_equipment)
  setHeaderIfEmpty('vin', args.session.vin)
  setHeaderIfEmpty('unit_number', args.session.unit_number)

  const detectedType = detectDocumentReportType(args.captures)
  const subject = cleanDraftField(savedInfo.subject_name) || documentInfo.subject_name || args.session.customer_name || documentInfo.customer_client || args.session.asset_label || documentInfo.asset_equipment || documentInfo.reference_number
  const contextualTitle = detectedType
    ? detectedType === 'Inspection Report' && subject
      ? `Inspection Report — ${subject}`
      : detectedType
    : null
  const reportTitle = cleanDraftField(savedInfo.report_title) || contextualTitle || args.draftOutput.title
  if (reportTitle) headerFields.report_title = reportTitle
  Object.entries(documentInfo).forEach(([key, value]) => setHeaderIfEmpty(key, value))

  return {
    ...args.draftOutput,
    title: reportTitle,
    header_fields: headerFields as Json,
  }
}

function getDraftStatus(confidence: number, sectionCount: number): 'draft' | 'needs_review' {
  return confidence >= 0.7 && sectionCount > 0 ? 'draft' : 'needs_review'
}

function getReportDraftErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === 'OPENAI_API_KEY_MISSING') {
    return 'Report generation is not configured yet.'
  }

  return error instanceof Error && error.message ? error.message : 'Report could not be generated. Please try again.'
}


export async function completeCaptureAndPrepareReport(sessionId: string, formData: FormData) {
  void formData
  const { supabase, profile, session } = await requireOwnedSession(sessionId)

  const { count: itemCount, error: itemCountError } = await supabase
    .from('documentation_items')
    .select('id', { count: 'exact', head: true })
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .eq('item_kind', 'observation')
    .is('deleted_at', null)

  if (itemCountError) {
    redirect(`/dashboard/sessions/${session.id}/capture?error=item_check_failed`)
  }

  if (!itemCount) {
    redirect(`/dashboard/sessions/${session.id}/capture?error=no_items`)
  }

  const { error } = await supabase
    .from('documentation_sessions')
    .update({ status: 'review', updated_at: new Date().toISOString() })
    .eq('id', session.id)
    .eq('organization_id', profile.organization_id)

  if (error) {
    redirect(getReportRedirectPath(session.id, { error: error.message }))
  }

  const { data: activeReport } = await supabase
    .from('ai_report_drafts')
    .select('id')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .not('status', 'in', '(superseded)')
    .order('generated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/sessions')
  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/capture`)
  revalidatePath(`/dashboard/sessions/${session.id}/report`)

  if (activeReport) {
    redirect(getReportRedirectPath(session.id))
  }

  await generateAiReportDraft(session.id)
}

export async function generateAiReportDraft(sessionId: string) {
  const { supabase, profile, session } = await requireOwnedSession(sessionId)

  await supabase
    .from('documentation_sessions')
    .update({ status: 'review', updated_at: new Date().toISOString() })
    .eq('id', session.id)
    .eq('organization_id', profile.organization_id)

  const billingAccess = requireActiveBillingAccess(profile)
  if (!billingAccess.ok) {
    redirect(getReportRedirectPath(session.id, { error: billingAccess.message }))
  }

  const aiAllowance = await requireUsageAllowance({
    supabase,
    organizationId: profile.organization_id,
    plan: billingAccess.access.plan,
    eventType: 'ai_report_draft_generation',
  })

  if (!aiAllowance.ok) {
    redirect(getReportRedirectPath(session.id, { error: aiAllowance.message }))
  }

  const { data: fullSession, error: fullSessionError } = await supabase
    .from('documentation_sessions')
    .select('id, title, session_type, session_metadata, asset_label, vin, odometer, unit_number, customer_name, suggested_details, field_service_details, workflow_template_id, organization_id')
    .eq('id', session.id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (fullSessionError || !fullSession) {
    redirect(getReportRedirectPath(session.id, { error: 'Documentation session not found.' }))
  }

  const { data: template } = fullSession.workflow_template_id
    ? await supabase
        .from('documentation_workflow_templates')
        .select('id, name, description, template_type, sections, fields, required_evidence, recommended_evidence, signature_requirements')
        .eq('id', fullSession.workflow_template_id)
        .eq('organization_id', profile.organization_id)
        .maybeSingle()
    : { data: null }

  const { data: captures, error: capturesError } = await supabase
    .from('capture_items')
    .select('id, type, media_kind, captured_at, ai_status, ai_summary, ocr_text, technician_note, transcript, extracted_data, capture_ai_analysis, evidence_category')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .order('report_order', { ascending: true, nullsFirst: false })
    .order('captured_at', { ascending: true })

  if (capturesError) {
    redirect(getReportRedirectPath(session.id, { error: capturesError.message }))
  }

  let observationTitleSuggestionCount = 0

  try {
    const titleCandidates = (captures ?? []).flatMap((capture) => {
      const note =
        capture.technician_note?.trim() ||
        capture.transcript?.trim() ||
        ''

      if (!note) return []

      const noteHash = createHash('sha256').update(note).digest('hex')
      const titleState = getObservationReportTitleState(capture.extracted_data)

      if (titleState.approved) return []
      if (
        titleState.suggested &&
        titleState.sourceNoteHash === noteHash
      ) {
        return []
      }

      return [{
        captureId: capture.id,
        note,
        noteHash,
      }]
    })

    const suggestions = await generateObservationTitles(
      titleCandidates.map(({ captureId, note }) => ({
        captureId,
        note,
      })),
    )

    const candidatesById = new Map(
      titleCandidates.map((candidate) => [candidate.captureId, candidate]),
    )
    const generatedAt = new Date().toISOString()

    for (const suggestion of suggestions) {
      const capture = (captures ?? []).find(
        (item) => item.id === suggestion.captureId,
      )
      const candidate = candidatesById.get(suggestion.captureId)

      if (!capture || !candidate) continue

      const nextExtractedData = mergeSuggestedObservationTitle({
        extractedData: capture.extracted_data,
        suggested: suggestion.title,
        sourceNoteHash: candidate.noteHash,
        model: OBSERVATION_TITLE_MODEL,
        promptVersion: OBSERVATION_TITLE_PROMPT_VERSION,
        generatedAt,
      })

      const { error: titleUpdateError } = await supabase
        .from('capture_items')
        .update({
          extracted_data: nextExtractedData,
          updated_at: generatedAt,
        })
        .eq('id', capture.id)
        .eq('documentation_session_id', session.id)
        .eq('organization_id', profile.organization_id)

      if (titleUpdateError) {
        console.warn('[observation-title] Could not persist suggestion', {
          capture_id: capture.id,
          error: titleUpdateError.message,
        })
        continue
      }

      capture.extracted_data = nextExtractedData
      observationTitleSuggestionCount += 1
    }
  } catch (error) {
    console.warn('[observation-title] Suggestions unavailable; using deterministic titles.', {
      session_id: session.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const { data: signatures } = await supabase
    .from('signature_captures')
    .select('id, signature_type, signer_name, signed_at')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .order('signed_at', { ascending: true })

  let draftOutput
  try {
    draftOutput = await generateReportDraft({
      reportContext: template
        ? {
            name: template.name,
            description: template.description,
            template_type: template.template_type,
            sections: template.sections,
            fields: template.fields,
            required_evidence: template.required_evidence,
            recommended_evidence: template.recommended_evidence,
            signature_requirements: template.signature_requirements,
          }
        : null,
      session: {
        id: fullSession.id,
        title: fullSession.title,
        session_type: fullSession.session_type,
        asset_label: fullSession.asset_label,
        vin: fullSession.vin,
        odometer: fullSession.odometer,
        unit_number: fullSession.unit_number,
        customer_name: fullSession.customer_name,
        suggested_details: fullSession.suggested_details,
        field_service_details: fullSession.field_service_details,
      },
      captures: sanitizeCapturesForImageAiAssist((captures ?? []).map((capture) => ({
        id: capture.id,
        type: capture.type,
        media_kind: capture.media_kind,
        captured_at: capture.captured_at,
        ai_status: capture.ai_status,
        ai_summary: capture.ai_summary,
        ocr_text: capture.ocr_text,
        technician_note: capture.technician_note,
        transcript: capture.transcript,
        extracted_data: capture.extracted_data,
        capture_ai_analysis: capture.capture_ai_analysis,
        evidence_category: capture.evidence_category,
      })), true),
      signatures: signatures ?? [],
    })
  } catch (error) {
    redirect(getReportRedirectPath(session.id, { error: getReportDraftErrorMessage(error) }))
  }

  const normalizedCaptures = sanitizeCapturesForImageAiAssist((captures ?? []).map((capture) => ({
    id: capture.id,
    type: capture.type,
    media_kind: capture.media_kind,
    ai_summary: capture.ai_summary,
    ocr_text: capture.ocr_text,
    technician_note: capture.technician_note,
    transcript: capture.transcript,
    extracted_data: capture.extracted_data,
    capture_ai_analysis: capture.capture_ai_analysis,
    evidence_category: capture.evidence_category,
  })), true)
  draftOutput = mergeDocumentContextIntoDraft({
    draftOutput,
    captures: normalizedCaptures,
    session: {
      title: fullSession.title,
      customer_name: fullSession.customer_name,
      asset_label: fullSession.asset_label,
      vin: fullSession.vin,
      unit_number: fullSession.unit_number,
      suggested_details: fullSession.suggested_details,
    },
  })
  const structureSourceMetadata = getReportStructureSourceMetadata(normalizedCaptures)
  const formSections = deriveFormSectionsFromCaptures(normalizedCaptures)
  const formBlueprint = extractFormBlueprint(normalizedCaptures)
  const evidenceFieldMappings = mapEvidenceToFormBlueprint(normalizedCaptures, formBlueprint)
  const formCaptureIds = formBlueprint?.source_capture_ids ?? selectPrimaryFormCaptures(normalizedCaptures).map((capture) => capture.id)
  if (structureSourceMetadata.report_structure_source === 'generic_fallback') {
    draftOutput = {
      ...draftOutput,
      sections: genericFallbackDraftSections(draftOutput, normalizedCaptures),
    }
  }
  draftOutput = { ...draftOutput, sections: ensureDraftSectionsReferenceCaptures(draftOutput.sections, normalizedCaptures) }
  const evidenceGroups = buildEvidenceGroups(normalizedCaptures, draftOutput.sections, draftOutput.measurements, draftOutput.findings)
  const formDebug = normalizedCaptures.map((capture, index) => ({ id: capture.id, score: Number(scoreFormReferenceCapture(capture, index).toFixed(2)) }))
  if (process.env.NODE_ENV !== 'production') {
    console.info('[report-structure]', { session_id: session.id, mode: formSections.length > 0 ? 'form_structured' : 'evidence_first', form_capture_ids: formCaptureIds, scores: formDebug })
  }
  const rawReportStructure: Json = safeJson({
    version: 2,
    mode: formSections.length > 0 ? 'form_structured' : 'evidence_first',
    ...structureSourceMetadata,
    form_sections: formSections,
    form_blueprint: formBlueprint,
    structured_form_data: formBlueprint ? { blueprint: formBlueprint, field_mappings: evidenceFieldMappings } : null,
    evidence_field_mappings: evidenceFieldMappings,
    export_package: { artifacts: ['structured_form_data', 'evidence_report', 'evidence_appendix'], duplicate_policy: 'evidence_used_once_as_truth' },
    form_capture_ids: formCaptureIds,
    evidence_groups: buildEvidencePackages(normalizedCaptures, evidenceGroups),
    evidence_cards: evidenceGroups,
    normalized_report_fields: buildNormalizedReportFields(normalizedCaptures),
  }) ?? {}
  const reportStructure = sanitizeReportStructureForSession(rawReportStructure, normalizedCaptures.map((capture) => capture.id))
  const formReliability = getFormStructureReliability(reportStructure)
  if (process.env.NODE_ENV !== 'production') {
    console.info('[report-structure-reliability]', { session_id: session.id, ...formReliability, source_capture_ids: formCaptureIds, extraction_warnings: formBlueprint?.fields.length === 0 ? ['no_form_fields_extracted'] : [] })
  }

  const safeReportTitle = buildSafeReportTitle({
    draftTitle: draftOutput.title,
    sessionTitle: fullSession.title,
    structureSource: structureSourceMetadata.report_structure_source,
    sourceDocumentName: structureSourceMetadata.source_document_name,
    customerName: fullSession.customer_name,
    assetLabel: fullSession.asset_label,
    unitNumber: fullSession.unit_number,
    vin: fullSession.vin,
  })
  draftOutput = { ...draftOutput, title: safeReportTitle }
  if (isPlaceholderSessionTitle(fullSession.title)) {
    await supabase
      .from('documentation_sessions')
      .update({ title: safeReportTitle, updated_at: new Date().toISOString() })
      .eq('id', session.id)
      .eq('organization_id', profile.organization_id)
  }

  const now = new Date().toISOString()
  const { data: draft, error: draftError } = await supabase
    .from('ai_report_drafts')
    .insert({
      documentation_session_id: session.id,
      organization_id: profile.organization_id,
      workflow_template_id: fullSession.workflow_template_id,
      status: getDraftStatus(draftOutput.confidence, draftOutput.sections.length),
      title: draftOutput.title,
      summary: draftOutput.summary,
      header_fields: draftOutput.header_fields,
      measurements: draftOutput.measurements,
      findings: draftOutput.findings,
      coverage: draftOutput.coverage,
      unmapped_evidence: draftOutput.unmapped_evidence,
      report_structure: reportStructure,
      confidence: draftOutput.confidence,
      model: AI_REPORT_DRAFT_MODEL,
      prompt_version: AI_REPORT_DRAFT_PROMPT_VERSION,
      generated_at: now,
    })
    .select('id')
    .single()

  if (draftError || !draft) {
    redirect(getReportRedirectPath(session.id, { error: draftError?.message ?? 'Could not save report.' }))
  }

  if (formBlueprint) {
    const formBlueprintStore = supabase as unknown as { from: (table: 'form_blueprints') => { upsert: (values: Record<string, unknown>, options: { onConflict: string }) => Promise<unknown> } }
    await formBlueprintStore.from('form_blueprints').upsert({
      documentation_session_id: session.id,
      organization_id: profile.organization_id,
      source_capture_ids: formBlueprint.source_capture_ids,
      document_type: formBlueprint.document_type,
      classification: formBlueprint.classification,
      classification_confidence: formBlueprint.classification_confidence,
      blueprint: formBlueprint,
      structured_form_data: { blueprint: formBlueprint, field_mappings: evidenceFieldMappings },
      evidence_field_mappings: evidenceFieldMappings,
      export_package: { artifacts: ['structured_form_data', 'evidence_report', 'evidence_appendix'], duplicate_policy: 'evidence_used_once_as_truth' },
      updated_at: now,
    }, { onConflict: 'documentation_session_id' })
  }

  if (draftOutput.sections.length > 0) {
    const { error: sectionsError } = await supabase.from('ai_report_draft_sections').insert(
      draftOutput.sections.map((section) => ({
        ai_report_draft_id: draft.id,
        documentation_session_id: session.id,
        organization_id: profile.organization_id,
        section_key: section.section_key,
        title: section.title,
        body: section.body,
        status: section.status,
        confidence: section.confidence,
        source_capture_ids: section.source_capture_ids,
        sort_order: section.sort_order,
        metadata: safeJson(section.metadata) ?? {},
      })),
    )

    if (sectionsError) {
      await supabase.from('ai_report_drafts').delete().eq('id', draft.id).eq('organization_id', profile.organization_id)
      redirect(getReportRedirectPath(session.id, { error: sectionsError.message }))
    }
  }

  const { error: supersedeError } = await supabase
    .from('ai_report_drafts')
    .update({ status: 'superseded' })
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .neq('id', draft.id)
    .not('status', 'in', '(approved,superseded)')

  if (supersedeError) {
    redirect(getReportRedirectPath(session.id, { error: supersedeError.message }))
  }

  await recordUsageEvent({
    supabase,
    organizationId: profile.organization_id,
    eventType: 'ai_report_draft_generation',
    metadata: {
      session_id: session.id,
      draft_id: draft.id,
      operation: 'report_draft_generation',
      model: AI_REPORT_DRAFT_MODEL,
      prompt_version: AI_REPORT_DRAFT_PROMPT_VERSION,
      observation_title_suggestions: observationTitleSuggestionCount,
      observation_title_model: OBSERVATION_TITLE_MODEL,
      observation_title_prompt_version: OBSERVATION_TITLE_PROMPT_VERSION,
    },
    createdBy: profile.id,
  })

  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  redirect(getReportRedirectPath(session.id, { draft: 1 }))
}


function sanitizeReportText(value: FormDataEntryValue | null, maxLength: number) {
  if (typeof value !== 'string') return null
  const trimmed = stripConfidenceText(value.trim())
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

function metadataWithReportVisibility(value: Json, includeInReport: boolean, fields?: Json): Json {
  const metadata = isRecord(value) ? { ...value } : {}
  if (includeInReport) {
    delete metadata.hidden_from_report
  } else {
    metadata.hidden_from_report = true
  }
  if (fields) metadata.fields = fields
  metadata.edited_for_report = true
  return metadata as Json
}

export async function saveReportEdits(draftId: string, formData: FormData) {
  const workspace = await requireSessionWorkspace()
  const { supabase, profile } = workspace
  const { data: draft, error: draftError } = await supabase
    .from('ai_report_drafts')
    .select('id, documentation_session_id, organization_id, title, summary, header_fields')
    .eq('id', draftId)
    .eq('organization_id', profile.organization_id)
    .single()

  if (draftError || !draft) {
    redirect('/dashboard?error=Report not found.')
  }

  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('id, organization_id, session_type, session_metadata, asset_label, customer_name, suggested_details, review_status, status')
    .eq('id', draft.documentation_session_id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) {
    redirect(getReportRedirectPath(draft.documentation_session_id, { error: 'Documentation session not found.' }))
  }
  if (reportIsReadyForDelivery(session)) {
    redirect(getSessionStepRedirectPath(session.id, 'export', { notice: 'Approved reports are read-only.' }))
  }

  const fieldCount = Number(getString(formData, 'field_count') || 0)
  const reportInfoFields = normalizeSessionMetadata(Object.fromEntries(
    SESSION_METADATA_FIELDS.map((field) => [field.name, sanitizeReportText(formData.get(field.name), field.maxLength) ?? '']),
  ), session)
  const editedHeaderFields: Record<string, string> = {}
  for (let index = 0; index < fieldCount; index += 1) {
    const key = getString(formData, `field_key_${index}`)
    const value = getString(formData, `field_value_${index}`)
    const included = formData.get(`field_include_${index}`) === 'on'
    if (key && value && included) editedHeaderFields[key] = value.slice(0, 500)
  }

  Object.entries(reportInfoFields).forEach(([key, value]) => { if (value) editedHeaderFields[key] = value })

  const reportTitle = sanitizeReportText(formData.get('report_title'), 180) || draft.title || session.asset_label || session.customer_name || 'Professional Documentation Report'
  const includeEvidenceAppendix = formData.get('include_evidence_appendix') === 'on'
  const baseSessionMetadata = sessionMetadataToJson(reportInfoFields)
  const reportOptions = {
    ...(isRecord(session.session_metadata) && isRecord(session.session_metadata.report_options) ? session.session_metadata.report_options : {}),
    includeEvidenceAppendix,
  }
  const sessionMetadata = { ...(isRecord(baseSessionMetadata) ? baseSessionMetadata : {}), report_options: reportOptions } as Json
  const now = new Date().toISOString()
  const { error: updateSessionError } = await supabase
    .from('documentation_sessions')
    .update({
      title: reportTitle,
      session_type: normalizeReportType(session.session_type || DEFAULT_REPORT_TYPE),
      session_metadata: sessionMetadata,
      customer_name: reportInfoFields.customer_client || session.customer_name,
      asset_label: reportInfoFields.asset_equipment || reportInfoFields.subject_name || session.asset_label,
      suggested_details: { ...((session.suggested_details && typeof session.suggested_details === 'object' && !Array.isArray(session.suggested_details)) ? session.suggested_details : {}), report_information: reportInfoFields } as Json,
      updated_at: now,
    })
    .eq('id', session.id)
    .eq('organization_id', profile.organization_id)

  if (updateSessionError) redirect(getReportRedirectPath(session.id, { error: updateSessionError.message }))

  const { error: updateDraftError } = await supabase
    .from('ai_report_drafts')
    .update({
      title: reportTitle,
      summary: sanitizeReportText(formData.get('report_summary'), 1200) ?? draft.summary,
      header_fields: editedHeaderFields,
      updated_at: now,
    })
    .eq('id', draft.id)
    .eq('organization_id', profile.organization_id)

  if (updateDraftError) {
    redirect(getReportRedirectPath(session.id, { error: updateDraftError.message }))
  }

  const { data: sections, error: sectionsError } = await supabase
    .from('ai_report_draft_sections')
    .select('id, metadata')
    .eq('ai_report_draft_id', draft.id)
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)

  if (sectionsError) {
    redirect(getReportRedirectPath(session.id, { error: sectionsError.message }))
  }

  for (const section of sections ?? []) {
    const includeInReport = formData.get(`section_include_${section.id}`) === 'on'
    const sectionTitle = sanitizeReportText(formData.get(`section_title_${section.id}`), 140) ?? 'Report section'
    const sectionBody = sanitizeReportText(formData.get(`section_body_${section.id}`), 4000)
    const sectionFieldCount = Number(getString(formData, `section_field_count_${section.id}`) || 0)
    const editedSectionFields: Json[] = []
    for (let fieldIndex = 0; fieldIndex < sectionFieldCount; fieldIndex += 1) {
      const included = formData.get(`section_field_include_${section.id}_${fieldIndex}`) === 'on'
      if (!included) continue
      const key = getString(formData, `section_field_key_${section.id}_${fieldIndex}`)
      const label = getString(formData, `section_field_label_${section.id}_${fieldIndex}`)
      const value = sanitizeReportText(formData.get(`section_field_value_${section.id}_${fieldIndex}`), 800)
      if (key && label && value) editedSectionFields.push({ key, label, value })
    }
    const { error: sectionUpdateError } = await supabase
      .from('ai_report_draft_sections')
      .update({
        title: sectionTitle,
        body: sectionBody,
        metadata: metadataWithReportVisibility(section.metadata, includeInReport, editedSectionFields.length > 0 ? editedSectionFields : undefined),
        updated_at: now,
      })
      .eq('id', section.id)
      .eq('ai_report_draft_id', draft.id)
      .eq('documentation_session_id', session.id)
      .eq('organization_id', profile.organization_id)

    if (sectionUpdateError) {
      redirect(getReportRedirectPath(session.id, { error: sectionUpdateError.message }))
    }
  }

  const { data: captures, error: capturesError } = await supabase
    .from('capture_items')
    .select('id, observation_group_id, report_order, technician_note, original_technician_note')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)

  if (capturesError) {
    redirect(getReportRedirectPath(session.id, { error: capturesError.message }))
  }

  for (const capture of captures ?? []) {
    const includeInReport = formData.get(`capture_include_${capture.id}`) === 'on'
    const note = sanitizeReportText(formData.get(`capture_note_${capture.id}`), 2000)
    const customerObservation = sanitizeReportText(formData.get(`capture_customer_observation_${capture.id}`), 4000)
    const originalTechnicianNote = sanitizeReportText(formData.get(`capture_original_technician_note_${capture.id}`), 2000) || capture.original_technician_note || capture.technician_note
    const lastAiObservation = sanitizeReportText(formData.get(`capture_last_ai_observation_${capture.id}`), 4000)
    const evidenceCategory = normalizeEvidenceCategory(getString(formData, `capture_category_${capture.id}`))
    const groupWith = getString(formData, `capture_group_with_${capture.id}`)
    const observationGroupId = groupWith && groupWith !== capture.id ? groupWith : capture.observation_group_id
    const requestedOrder = Number(getString(formData, `capture_report_order_${capture.id}`))
    const reportOrder = Number.isFinite(requestedOrder) && requestedOrder > 0 ? requestedOrder : capture.report_order
    const { error: captureUpdateError } = await supabase
      .from('capture_items')
      .update({ include_in_report: includeInReport, technician_note: note, customer_facing_observation: customerObservation, original_technician_note: originalTechnicianNote, last_ai_observation: lastAiObservation, evidence_category: evidenceCategory, observation_group_id: observationGroupId || null, report_order: reportOrder, updated_at: now })
      .eq('id', capture.id)
      .eq('documentation_session_id', session.id)
      .eq('organization_id', profile.organization_id)

    if (captureUpdateError) {
      redirect(getReportRedirectPath(session.id, { error: captureUpdateError.message }))
    }
  }

  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  if (formData.get('autosave') === '1') return
  redirect(getReportRedirectPath(session.id, { edited: 1 }))
}

export async function approveAiReportDraft(draftId: string) {
  const workspace = await requireSessionWorkspace()
  const { supabase, profile } = workspace
  const { data: draft, error: draftError } = await supabase
    .from('ai_report_drafts')
    .select('id, documentation_session_id, organization_id, status')
    .eq('id', draftId)
    .eq('organization_id', profile.organization_id)
    .single()

  if (draftError || !draft) {
    redirect('/dashboard?error=Report not found.')
  }

  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('id, organization_id')
    .eq('id', draft.documentation_session_id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) {
    redirect(getReportRedirectPath(draft.documentation_session_id, { error: 'Documentation session not found.' }))
  }

  const now = new Date().toISOString()
  const { error: approveError } = await supabase
    .from('ai_report_drafts')
    .update({ status: 'approved', approved_at: now, approved_by: profile.id })
    .eq('id', draft.id)
    .eq('organization_id', profile.organization_id)

  if (approveError) {
    redirect(getReportRedirectPath(session.id, { error: approveError.message }))
  }

  const { error: sessionUpdateError } = await supabase
    .from('documentation_sessions')
    .update({
      review_status: 'ready_for_delivery',
      reviewed_at: now,
      reviewed_by: profile.id,
    })
    .eq('id', session.id)
    .eq('organization_id', profile.organization_id)

  if (sessionUpdateError) {
    redirect(getReportRedirectPath(session.id, { error: sessionUpdateError.message }))
  }

  const { error: supersedeError } = await supabase
    .from('ai_report_drafts')
    .update({ status: 'superseded' })
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .neq('id', draft.id)
    .neq('status', 'approved')

  if (supersedeError) {
    redirect(getReportRedirectPath(session.id, { error: supersedeError.message }))
  }

  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  redirect(getReportRedirectPath(session.id, { approved_draft: 1 }))
}
