'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireActiveBillingAccess } from '@/features/billing'
import { createCaptureRecordFromUploadedFile } from '@/features/capture/actions'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { recordUsageEvent, requireUsageAllowance } from '@/features/usage'
import {
  DIAGNOSTIC_PROCEDURE_EXTRACTION_MODEL,
  DIAGNOSTIC_PROCEDURE_PROMPT_VERSION,
  extractDiagnosticProcedure,
  type DiagnosticProcedureExtractionResult,
} from '@/lib/openai/diagnostic-procedure-extractor'
import type { Json } from '@/lib/supabase/database.types'

const CAPTURE_BUCKET = 'documentation-captures'
const ALLOWED_PROCEDURE_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])

const STEP_STATUSES = new Set(['not_tested', 'pass', 'fail', 'blocked', 'not_applicable'])

type ActionResult = { ok: true; message?: string } | { ok: false; error: string }

type SectionMetadata = {
  section_type?: string
  step_id?: string
  step_number?: string | null
  step_key?: string
  title?: string | null
  instruction?: string
  required_measurements?: Json
  required_evidence?: Json
  oem_flow_text?: string | null
  oem_branches?: Json
  external_references?: Json
  visible?: boolean
  extraction_review_status?: string
  extraction_warnings?: Json
  technician_status?: string
  technician_readings?: Json
  technician_notes?: string | null
  technician_conclusion?: string | null
  attached_capture_ids?: string[]
  updated_by?: string
  updated_at?: string
  [key: string]: unknown
}

function getString(formData: FormData, field: string) {
  const value = formData.get(field)
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeJson(value: unknown): Json {
  if (value === null || value === undefined) return null
  return value as Json
}

function getRedirectPath(sessionId: string, params: Record<string, string | number | boolean>) {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))
  return `/dashboard/sessions/${sessionId}/diagnostic-procedure?${query.toString()}`
}

function getStepSectionTitle(step: DiagnosticProcedureExtractionResult['steps'][number]) {
  const prefix = step.step_number ? `${step.step_number}: ` : ''
  return `${prefix}${step.title ?? 'OEM procedure step'}`.slice(0, 180)
}

function buildReportStructure(params: {
  procedure: DiagnosticProcedureExtractionResult
  sourceCaptureId: string
  sourceFilename: string
  sourceStoragePath: string
}) {
  return {
    version: 1,
    mode: 'diagnostic_procedure',
    guardrails: {
      documentation_support_only: true,
      follow_oem_procedure: true,
      technician_owns_conclusions: true,
      ai_diagnosis_disabled: true,
    },
    procedure_status: 'technician_review_required',
    extraction_status: 'extracted',
    procedure: {
      title: params.procedure.title,
      manufacturer: params.procedure.manufacturer,
      document_type: params.procedure.document_type,
      source_summary: params.procedure.source_summary,
      source_capture_id: params.sourceCaptureId,
      source_file_name: params.sourceFilename,
      source_storage_path: params.sourceStoragePath,
      prompt_version: DIAGNOSTIC_PROCEDURE_PROMPT_VERSION,
    },
    steps: params.procedure.steps.map((step, index) => ({
      ...step,
      sort_order: index + 1,
      visible: true,
      extraction_review_status: 'technician_review_required',
      technician_status: 'not_tested',
      technician_readings: [],
      technician_notes: null,
      technician_conclusion: null,
      attached_capture_ids: [],
    })),
    extraction_warnings: params.procedure.extraction_warnings,
  }
}

async function getAuthorizedSession(sessionId: string) {
  const workspace = await requireSessionWorkspace()
  const { data: session, error } = await workspace.supabase
    .from('documentation_sessions')
    .select('id, organization_id, title, session_type')
    .eq('id', sessionId)
    .eq('organization_id', workspace.profile.organization_id)
    .single()

  return { ...workspace, session: error || !session ? null : session }
}

export async function uploadAndExtractDiagnosticProcedure(sessionId: string, formData: FormData) {
  const file = formData.get('procedure_file')
  if (!(file instanceof File) || file.size === 0) {
    redirect(getRedirectPath(sessionId, { error: 'Choose an OEM diagnostic procedure PDF or image.' }))
  }

  const mimeType = file.type || 'application/octet-stream'
  if (!ALLOWED_PROCEDURE_MIME_TYPES.has(mimeType)) {
    redirect(getRedirectPath(sessionId, { error: 'Diagnostic procedure uploads support PDF and image files.' }))
  }

  const { supabase, profile, session } = await getAuthorizedSession(sessionId)
  if (!session) redirect('/dashboard?error=Documentation session not found.')

  const billingAccess = requireActiveBillingAccess(profile)
  if (!billingAccess.ok) redirect(getRedirectPath(session.id, { error: billingAccess.message }))

  const storageAllowance = await requireUsageAllowance({
    supabase,
    organizationId: profile.organization_id,
    plan: billingAccess.access.plan,
    eventType: 'storage_bytes_added',
    quantity: file.size,
    fileSizeBytes: file.size,
  })
  if (!storageAllowance.ok) redirect(getRedirectPath(session.id, { error: storageAllowance.message }))

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 140) || 'diagnostic-procedure'
  const storagePath = `organizations/${profile.organization_id}/sessions/${session.id}/captures/${Date.now()}-diagnostic-procedure-${safeName}`
  const { error: uploadError } = await supabase.storage.from(CAPTURE_BUCKET).upload(storagePath, file, { contentType: mimeType, upsert: false })
  if (uploadError) redirect(getRedirectPath(session.id, { error: uploadError.message }))

  const captureResult = await createCaptureRecordFromUploadedFile({
    sessionId: session.id,
    storagePath,
    filename: file.name,
    mimeType,
    size: file.size,
    captureIntent: 'manual',
    manualType: 'document',
    workflow: 'diagnostic_procedure',
    guidedStep: 'source_procedure',
    guidedLabel: 'Diagnostic Procedure Source',
    technicianNote: 'Uploaded OEM diagnostic procedure for documentation support only.',
    includeInReport: true,
    sourceDocumentType: 'diagnostic_procedure',
    sourceDocumentLabel: 'Diagnostic Procedure / OEM Pinpoint Test',
  })

  if (!captureResult.ok) {
    await supabase.storage.from(CAPTURE_BUCKET).remove([storagePath])
    redirect(getRedirectPath(session.id, { error: captureResult.error }))
  }

  const { data: signed } = await supabase.storage.from(CAPTURE_BUCKET).createSignedUrl(storagePath, 60 * 10)
  const extraction = await extractDiagnosticProcedure({ signedUrl: signed?.signedUrl ?? '', filename: file.name, mimeType })
  await saveDiagnosticProcedureDraft({
    sessionId: session.id,
    sourceCaptureId: captureResult.captureItemId,
    sourceFilename: file.name,
    sourceStoragePath: storagePath,
    extraction,
  })

  await recordUsageEvent({
    supabase,
    organizationId: profile.organization_id,
    eventType: 'storage_bytes_added',
    quantity: file.size,
    metadata: { source: 'diagnostic_procedure_upload', session_id: session.id, filename: file.name, mime_type: mimeType },
    createdBy: profile.id,
  })

  revalidatePath(`/dashboard/sessions/${session.id}/diagnostic-procedure`)
  redirect(getRedirectPath(session.id, { extracted: 1 }))
}

async function saveDiagnosticProcedureDraft(input: {
  sessionId: string
  sourceCaptureId: string
  sourceFilename: string
  sourceStoragePath: string
  extraction: DiagnosticProcedureExtractionResult
}) {
  const { supabase, profile, session } = await getAuthorizedSession(input.sessionId)
  if (!session) throw new Error('Documentation session not found.')
  const now = new Date().toISOString()
  const reportStructure = buildReportStructure({
    procedure: input.extraction,
    sourceCaptureId: input.sourceCaptureId,
    sourceFilename: input.sourceFilename,
    sourceStoragePath: input.sourceStoragePath,
  })

  const { data: draft, error: draftError } = await supabase
    .from('ai_report_drafts')
    .insert({
      documentation_session_id: session.id,
      organization_id: profile.organization_id,
      status: 'needs_review',
      title: input.extraction.title ?? 'Diagnostic Procedure Workspace',
      summary: 'Documentation support only. Follow OEM procedure. Technician owns all conclusions.',
      header_fields: safeJson({
        workflow: 'diagnostic_procedure',
        manufacturer: input.extraction.manufacturer,
        document_type: input.extraction.document_type,
        source_file: input.sourceFilename,
      }),
      measurements: [],
      findings: [],
      coverage: safeJson({ documentation_support_only: true }),
      unmapped_evidence: [],
      report_structure: safeJson(reportStructure),
      confidence: 0,
      model: DIAGNOSTIC_PROCEDURE_EXTRACTION_MODEL,
      prompt_version: DIAGNOSTIC_PROCEDURE_PROMPT_VERSION,
      generated_at: now,
    })
    .select('id')
    .single()

  if (draftError || !draft) throw new Error(draftError?.message ?? 'Unable to save diagnostic procedure draft.')

  const { error: sectionsError } = await supabase.from('ai_report_draft_sections').insert(
    input.extraction.steps.map((step, index) => ({
      ai_report_draft_id: draft.id,
      documentation_session_id: session.id,
      organization_id: profile.organization_id,
      section_key: step.step_id,
      title: getStepSectionTitle(step),
      body: step.instruction,
      status: 'informational',
      confidence: 0,
      source_capture_ids: [input.sourceCaptureId],
      sort_order: index + 1,
      metadata: safeJson({
        section_type: 'diagnostic_procedure_step',
        step_id: step.step_id,
        step_number: step.step_number,
        step_key: step.step_key,
        title: step.title,
        instruction: step.instruction,
        required_measurements: step.required_measurements,
        required_evidence: step.required_evidence,
        oem_flow_text: step.oem_flow_text,
        extraction_warnings: step.extraction_warnings,
        visible: true,
        extraction_review_status: 'technician_review_required',
        technician_status: 'not_tested',
        technician_readings: [],
        technician_notes: null,
        technician_conclusion: null,
        attached_capture_ids: [],
        documentation_support_only: true,
      }),
    })),
  )

  if (sectionsError) {
    await supabase.from('ai_report_drafts').delete().eq('id', draft.id).eq('organization_id', profile.organization_id)
    throw new Error(sectionsError.message)
  }

  await supabase
    .from('ai_report_drafts')
    .update({ status: 'superseded' })
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .neq('id', draft.id)
    .not('status', 'in', '(approved,superseded)')

  await recordUsageEvent({
    supabase,
    organizationId: profile.organization_id,
    eventType: 'ai_report_draft_generation',
    metadata: { source: 'diagnostic_procedure_extraction', session_id: session.id, draft_id: draft.id, model: DIAGNOSTIC_PROCEDURE_EXTRACTION_MODEL, prompt_version: DIAGNOSTIC_PROCEDURE_PROMPT_VERSION },
    createdBy: profile.id,
  })
}

async function getAuthorizedStep(sectionId: string) {
  const workspace = await requireSessionWorkspace()
  const { data: section, error } = await workspace.supabase
    .from('ai_report_draft_sections')
    .select('id, ai_report_draft_id, documentation_session_id, organization_id, section_key, title, body, source_capture_ids, metadata, ai_report_drafts(report_structure)')
    .eq('id', sectionId)
    .eq('organization_id', workspace.profile.organization_id)
    .single()

  if (error || !section || !isRecord(section.metadata) || section.metadata.section_type !== 'diagnostic_procedure_step') {
    return { ...workspace, section: null }
  }

  return { ...workspace, section }
}


function parseJsonArrayField(formData: FormData, field: string, maxLength = 12000): Json {
  const raw = getString(formData, field).slice(0, maxLength)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? safeJson(parsed) : []
  } catch {
    return raw.split('\n').map((line) => line.trim()).filter(Boolean).map((text) => ({ text })) as Json
  }
}

function patchDraftProcedureStatus(reportStructure: unknown, status: string): Json {
  if (!isRecord(reportStructure)) return safeJson(reportStructure)
  return safeJson({ ...reportStructure, procedure_status: status })
}

function updateDraftReportStructure(reportStructure: unknown, stepId: string, patch: SectionMetadata): Json {
  if (!isRecord(reportStructure)) return safeJson(reportStructure)
  const steps = Array.isArray(reportStructure.steps)
    ? reportStructure.steps.map((step) => isRecord(step) && step.step_id === stepId ? { ...step, ...patch } : step)
    : []
  return safeJson({ ...reportStructure, steps })
}


export async function updateDiagnosticProcedureStepExtraction(sectionId: string, formData: FormData): Promise<ActionResult> {
  const { supabase, profile, section } = await getAuthorizedStep(sectionId)
  if (!section) return { ok: false, error: 'Diagnostic procedure step not found.' }

  const metadata = section.metadata as SectionMetadata
  const stepId = typeof metadata.step_id === 'string' ? metadata.step_id : section.section_key
  const title = getString(formData, 'title').slice(0, 180) || 'OEM procedure step'
  const stepNumber = getString(formData, 'step_number').slice(0, 80) || null
  const instruction = getString(formData, 'instruction').slice(0, 4000) || section.body || ''
  const oemFlowText = getString(formData, 'oem_flow_text').slice(0, 1200) || null
  const sortOrder = Math.max(1, Math.min(999, Number(getString(formData, 'sort_order') || 1) || 1))
  const visible = formData.get('visible') === 'on'
  const patch: SectionMetadata = {
    title,
    step_number: stepNumber,
    instruction,
    oem_flow_text: oemFlowText,
    required_measurements: parseJsonArrayField(formData, 'required_measurements'),
    oem_branches: parseJsonArrayField(formData, 'oem_branches'),
    external_references: parseJsonArrayField(formData, 'external_references'),
    visible,
    extraction_review_status: 'technician_review_required',
    updated_by: profile.id,
    updated_at: new Date().toISOString(),
  }
  const nextMetadata = { ...metadata, ...patch }
  const sectionTitle = `${stepNumber ? `${stepNumber}: ` : ''}${title}`.slice(0, 180)
  const draftRecord = Array.isArray(section.ai_report_drafts) ? section.ai_report_drafts[0] : section.ai_report_drafts
  let nextReportStructure = updateDraftReportStructure(isRecord(draftRecord) ? draftRecord.report_structure : null, stepId, { ...patch, sort_order: sortOrder } as SectionMetadata)
  if (isRecord(nextReportStructure)) nextReportStructure = safeJson({ ...nextReportStructure, procedure_status: 'technician_review_required' })

  const { error: sectionError } = await supabase
    .from('ai_report_draft_sections')
    .update({ title: sectionTitle, body: instruction, sort_order: sortOrder, metadata: safeJson(nextMetadata), updated_at: new Date().toISOString() })
    .eq('id', section.id)
    .eq('documentation_session_id', section.documentation_session_id)
    .eq('organization_id', profile.organization_id)
  if (sectionError) return { ok: false, error: sectionError.message }

  const { error: draftError } = await supabase
    .from('ai_report_drafts')
    .update({ report_structure: nextReportStructure, status: 'needs_review', updated_at: new Date().toISOString() })
    .eq('id', section.ai_report_draft_id)
    .eq('documentation_session_id', section.documentation_session_id)
    .eq('organization_id', profile.organization_id)
  if (draftError) return { ok: false, error: draftError.message }

  revalidatePath(`/dashboard/sessions/${section.documentation_session_id}/diagnostic-procedure`)
  revalidatePath(`/dashboard/sessions/${section.documentation_session_id}/report`)
  return { ok: true, message: 'Extracted step structure updated for technician review.' }
}

export async function approveDiagnosticProcedureStructure(draftId: string): Promise<ActionResult> {
  const workspace = await requireSessionWorkspace()
  const { data: draft, error } = await workspace.supabase
    .from('ai_report_drafts')
    .select('id, documentation_session_id, organization_id, report_structure')
    .eq('id', draftId)
    .eq('organization_id', workspace.profile.organization_id)
    .single()
  if (error || !draft) return { ok: false, error: 'Diagnostic procedure draft not found.' }
  const nextReportStructure = patchDraftProcedureStatus(draft.report_structure, 'approved_for_use')
  const { error: updateError } = await workspace.supabase
    .from('ai_report_drafts')
    .update({ report_structure: nextReportStructure, status: 'reviewed', updated_at: new Date().toISOString() })
    .eq('id', draft.id)
    .eq('documentation_session_id', draft.documentation_session_id)
    .eq('organization_id', workspace.profile.organization_id)
  if (updateError) return { ok: false, error: updateError.message }
  revalidatePath(`/dashboard/sessions/${draft.documentation_session_id}/diagnostic-procedure`)
  revalidatePath(`/dashboard/sessions/${draft.documentation_session_id}/report`)
  return { ok: true, message: 'Procedure structure approved for use.' }
}

export async function updateDiagnosticStep(sectionId: string, formData: FormData): Promise<ActionResult> {
  const { supabase, profile, section } = await getAuthorizedStep(sectionId)
  if (!section) return { ok: false, error: 'Diagnostic procedure step not found.' }

  const requestedStatus = getString(formData, 'technician_status') || 'not_tested'
  const technicianStatus = STEP_STATUSES.has(requestedStatus) ? requestedStatus : 'not_tested'
  const technicianNotes = getString(formData, 'technician_notes').slice(0, 3000) || null
  const technicianConclusion = getString(formData, 'technician_conclusion').slice(0, 2000) || null
  const readingCount = Number(getString(formData, 'reading_count') || 0)
  const technicianReadings = Array.from({ length: Math.max(0, Math.min(20, readingCount)) }).map((_, index) => ({
    key: getString(formData, `reading_key_${index}`) || `reading_${index + 1}`,
    label: getString(formData, `reading_label_${index}`) || `Reading ${index + 1}`,
    value: getString(formData, `reading_value_${index}`).slice(0, 240),
    unit: getString(formData, `reading_unit_${index}`).slice(0, 40) || null,
    captured_at: new Date().toISOString(),
    captured_by: profile.id,
  })).filter((reading) => reading.value || reading.label)

  const metadata = section.metadata as SectionMetadata
  const patch: SectionMetadata = {
    technician_status: technicianStatus,
    technician_notes: technicianNotes,
    technician_conclusion: technicianConclusion,
    technician_readings: safeJson(technicianReadings),
    updated_by: profile.id,
    updated_at: new Date().toISOString(),
  }
  const nextMetadata = { ...metadata, ...patch }
  const stepId = typeof metadata.step_id === 'string' ? metadata.step_id : section.section_key
  const draftRecord = Array.isArray(section.ai_report_drafts) ? section.ai_report_drafts[0] : section.ai_report_drafts
  const nextReportStructure = updateDraftReportStructure(isRecord(draftRecord) ? draftRecord.report_structure : null, stepId, patch)

  const { error: sectionError } = await supabase
    .from('ai_report_draft_sections')
    .update({ metadata: safeJson(nextMetadata), updated_at: new Date().toISOString() })
    .eq('id', section.id)
    .eq('documentation_session_id', section.documentation_session_id)
    .eq('organization_id', profile.organization_id)

  if (sectionError) return { ok: false, error: sectionError.message }

  await supabase
    .from('ai_report_drafts')
    .update({ report_structure: nextReportStructure, updated_at: new Date().toISOString() })
    .eq('id', section.ai_report_draft_id)
    .eq('documentation_session_id', section.documentation_session_id)
    .eq('organization_id', profile.organization_id)

  revalidatePath(`/dashboard/sessions/${section.documentation_session_id}/diagnostic-procedure`)
  revalidatePath(`/dashboard/sessions/${section.documentation_session_id}/report`)
  return { ok: true, message: 'Diagnostic procedure step saved.' }
}

export async function attachCaptureToDiagnosticStep(sectionId: string, captureItemId: string): Promise<ActionResult> {
  const { supabase, profile, section } = await getAuthorizedStep(sectionId)
  if (!section) return { ok: false, error: 'Diagnostic procedure step not found.' }

  const { data: capture, error: captureError } = await supabase
    .from('capture_items')
    .select('id, extracted_data')
    .eq('id', captureItemId)
    .eq('documentation_session_id', section.documentation_session_id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (captureError || !capture) return { ok: false, error: 'Capture not found.' }

  const metadata = section.metadata as SectionMetadata
  const stepId = typeof metadata.step_id === 'string' ? metadata.step_id : section.section_key
  const existingCaptureIds = Array.isArray(metadata.attached_capture_ids) ? metadata.attached_capture_ids : []
  const attachedCaptureIds = Array.from(new Set([...existingCaptureIds, capture.id]))
  const nextMetadata = { ...metadata, attached_capture_ids: attachedCaptureIds, updated_by: profile.id, updated_at: new Date().toISOString() }
  const extractedData = isRecord(capture.extracted_data) ? { ...capture.extracted_data } : {}
  const nextExtractedData = {
    ...extractedData,
    diagnostic_step: {
      workflow: 'diagnostic_procedure',
      step_id: stepId,
      label: section.title,
      documentation_support_only: true,
    },
  }

  const { error: captureUpdateError } = await supabase
    .from('capture_items')
    .update({ extracted_data: safeJson(nextExtractedData), updated_at: new Date().toISOString() })
    .eq('id', capture.id)
    .eq('documentation_session_id', section.documentation_session_id)
    .eq('organization_id', profile.organization_id)

  if (captureUpdateError) return { ok: false, error: captureUpdateError.message }

  const { error: sectionError } = await supabase
    .from('ai_report_draft_sections')
    .update({ metadata: safeJson(nextMetadata), source_capture_ids: attachedCaptureIds, updated_at: new Date().toISOString() })
    .eq('id', section.id)
    .eq('organization_id', profile.organization_id)

  if (sectionError) return { ok: false, error: sectionError.message }

  revalidatePath(`/dashboard/sessions/${section.documentation_session_id}/diagnostic-procedure`)
  return { ok: true }
}
