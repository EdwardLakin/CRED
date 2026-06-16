'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireActiveBillingAccess } from '@/features/billing'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { recordUsageEvent, requireUsageAllowance } from '@/features/usage'
import { ReportEmailError, sendReportEmail, validateReportEmailRecipients } from '@/lib/email/reports'
import { AI_REPORT_DRAFT_MODEL, AI_REPORT_DRAFT_PROMPT_VERSION, generateReportDraft } from '@/lib/openai/report-draft-generator'
import type { OrganizationPlan } from '@/lib/stripe'
import { buildEvidenceGroups, buildEvidencePackages,
  sanitizeReportStructureForSession, buildNormalizedReportFields, deriveFormSectionsFromCaptures, scoreFormReferenceCapture, selectPrimaryFormCaptures, stripConfidenceText } from '@/features/reports/report-structure'
import type { Json } from '@/lib/supabase/database.types'

const REPORT_SHARE_EXPIRATION_DAYS = 30

function getString(formData: FormData, field: string) {
  const value = formData.get(field)
  return typeof value === 'string' ? value.trim() : ''
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
    .select('id, title, organization_id, review_status')
    .eq('id', sessionId)
    .eq('organization_id', workspace.profile.organization_id)
    .single()
  if (error || !session) redirect(getReportRedirectPath(sessionId, { error: 'Documentation session not found.' }))
  return { ...workspace, session }
}


function reportIsReadyForDelivery(session: { review_status?: string | null }) {
  return session.review_status === 'ready_for_delivery'
}

function requireReportReadyForDelivery(sessionId: string, session: { review_status?: string | null }) {
  if (!reportIsReadyForDelivery(session)) {
    redirect(
      getReportRedirectPath(sessionId, {
        error: 'Approve this report before exporting.',
      }),
    )
  }
}

export async function markReportReviewed(sessionId: string, formData: FormData) {
  const missingEvidenceCount = Number(getString(formData, 'missing_evidence_count') || 0)
  const missingEvidenceAcknowledged = formData.get('missing_evidence_acknowledged') === 'on'
  const { supabase, profile, session } = await requireOwnedSession(sessionId)

  if (missingEvidenceCount > 0 && !missingEvidenceAcknowledged) {
    redirect(
      getReportRedirectPath(session.id, {
        error: 'Please confirm you considered the suggestions before approving this report.',
      }),
    )
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

  if (error) redirect(getReportRedirectPath(session.id, { error: error.message }))

  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  redirect(getReportRedirectPath(session.id, { reviewed: 1 }))
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
    redirect(getReportRedirectPath(sessionId, { error: message }))
  }

  const { supabase, profile, session } = await requireOwnedSession(sessionId)
  requireReportReadyForDelivery(session.id, session)
  const billingAccess = requireActiveBillingAccess(profile)
  if (!billingAccess.ok) {
    redirect(getReportRedirectPath(session.id, { error: billingAccess.message }))
  }

  const emailAllowance = await requireUsageAllowance({
    supabase,
    organizationId: profile.organization_id,
    plan: billingAccess.access.plan,
    eventType: 'email_report_sent',
  })

  if (!emailAllowance.ok) {
    redirect(getReportRedirectPath(session.id, { error: emailAllowance.message }))
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
    redirect(getReportRedirectPath(session.id, { error: message }))
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
  if (error) redirect(getReportRedirectPath(session.id, { error: error.message }))
  await recordUsageEvent({
    supabase,
    organizationId: profile.organization_id,
    eventType: 'email_report_sent',
    metadata: { session_id: session.id, recipient_count: recipients.length },
    createdBy: profile.id,
  })
  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  redirect(getReportRedirectPath(session.id, { emailed: 1 }))
}

export async function createReportShareLink(sessionId: string, formData: FormData) {
  const expiresAt = getString(formData, 'expires_at') || null
  const { supabase, profile, session } = await requireOwnedSession(sessionId)
  requireReportReadyForDelivery(session.id, session)
  const billingAccess = requireActiveBillingAccess(profile)
  if (!billingAccess.ok) {
    redirect(getReportRedirectPath(session.id, { error: billingAccess.message }))
  }

  const shareAllowance = await requireUsageAllowance({
    supabase,
    organizationId: profile.organization_id,
    plan: billingAccess.access.plan,
    eventType: 'share_link_created',
  })

  if (!shareAllowance.ok) {
    redirect(getReportRedirectPath(session.id, { error: shareAllowance.message }))
  }

  const token = randomBytes(24).toString('hex')
  const { error } = await supabase.from('report_share_tokens').insert({
    documentation_session_id: session.id,
    organization_id: profile.organization_id,
    token,
    expires_at: expiresAt,
    created_by: profile.id,
  })
  if (error) redirect(getReportRedirectPath(session.id, { error: error.message }))
  await recordUsageEvent({
    supabase,
    organizationId: profile.organization_id,
    eventType: 'share_link_created',
    metadata: { session_id: session.id, expires_at: expiresAt },
    createdBy: profile.id,
  })
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  redirect(getReportRedirectPath(session.id, { shared: 1 }))
}

export async function disableReportShareLink(sessionId: string, tokenId: string) {
  const { supabase, profile, session } = await requireOwnedSession(sessionId)
  const { error } = await supabase.from('report_share_tokens').update({ disabled_at: new Date().toISOString() }).eq('id', tokenId).eq('organization_id', profile.organization_id)
  if (error) redirect(getReportRedirectPath(session.id, { error: error.message }))
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  redirect(getReportRedirectPath(session.id, { disabled: 1 }))
}

export async function saveReport(sessionId: string) {
  const { supabase, profile, session } = await requireOwnedSession(sessionId)
  requireReportReadyForDelivery(session.id, session)
  const billingAccess = requireActiveBillingAccess(profile)
  if (!billingAccess.ok) {
    redirect(getReportRedirectPath(session.id, { error: billingAccess.message }))
  }

  const { error } = await supabase.from('exports').insert({
    documentation_session_id: session.id,
    organization_id: profile.organization_id,
    export_type: 'saved_report',
    status: 'saved',
    created_by: profile.id,
    metadata: { retention: 'indefinite_until_deleted' },
  })
  if (error) redirect(getReportRedirectPath(session.id, { error: error.message }))
  revalidatePath(`/dashboard/sessions/${session.id}`)
  redirect(getReportRedirectPath(session.id, { saved: 1 }))
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
    .select('id, title, session_type, asset_label, vin, odometer, unit_number, customer_name, suggested_details, field_service_details, workflow_template_id, organization_id')
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
    .select('id, type, media_kind, captured_at, ai_status, ai_summary, ocr_text, technician_note, transcript, extracted_data')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .order('report_order', { ascending: true, nullsFirst: false })
    .order('captured_at', { ascending: true })

  if (capturesError) {
    redirect(getReportRedirectPath(session.id, { error: capturesError.message }))
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
      captures: (captures ?? []).map((capture) => ({
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
      })),
      signatures: signatures ?? [],
    })
  } catch (error) {
    redirect(getReportRedirectPath(session.id, { error: getReportDraftErrorMessage(error) }))
  }

  const normalizedCaptures = (captures ?? []).map((capture) => ({
    id: capture.id,
    type: capture.type,
    media_kind: capture.media_kind,
    ai_summary: capture.ai_summary,
    ocr_text: capture.ocr_text,
    technician_note: capture.technician_note,
    transcript: capture.transcript,
    extracted_data: capture.extracted_data,
  }))
  const formSections = deriveFormSectionsFromCaptures(normalizedCaptures)
  const formCaptureIds = selectPrimaryFormCaptures(normalizedCaptures).map((capture) => capture.id)
  const evidenceGroups = buildEvidenceGroups(normalizedCaptures, draftOutput.sections, draftOutput.measurements, draftOutput.findings)
  const formDebug = normalizedCaptures.map((capture, index) => ({ id: capture.id, score: Number(scoreFormReferenceCapture(capture, index).toFixed(2)) }))
  if (process.env.NODE_ENV !== 'production') {
    console.info('[report-structure]', { session_id: session.id, mode: formSections.length > 0 ? 'form_structured' : 'evidence_first', form_capture_ids: formCaptureIds, scores: formDebug })
  }
  const rawReportStructure: Json = safeJson({
    version: 2,
    mode: formSections.length > 0 ? 'form_structured' : 'evidence_first',
    form_sections: formSections,
    form_capture_ids: formCaptureIds,
    evidence_groups: buildEvidencePackages(normalizedCaptures, evidenceGroups),
    evidence_cards: evidenceGroups,
    normalized_report_fields: buildNormalizedReportFields(normalizedCaptures),
  }) ?? {}
  const reportStructure = sanitizeReportStructureForSession(rawReportStructure, normalizedCaptures.map((capture) => capture.id))

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
    metadata: { session_id: session.id, draft_id: draft.id, model: AI_REPORT_DRAFT_MODEL, prompt_version: AI_REPORT_DRAFT_PROMPT_VERSION },
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
    .select('id, organization_id')
    .eq('id', draft.documentation_session_id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) {
    redirect(getReportRedirectPath(draft.documentation_session_id, { error: 'Documentation session not found.' }))
  }

  const fieldCount = Number(getString(formData, 'field_count') || 0)
  const editedHeaderFields: Record<string, string> = {}
  for (let index = 0; index < fieldCount; index += 1) {
    const key = getString(formData, `field_key_${index}`)
    const value = getString(formData, `field_value_${index}`)
    const included = formData.get(`field_include_${index}`) === 'on'
    if (key && value && included) editedHeaderFields[key] = value.slice(0, 500)
  }

  const now = new Date().toISOString()
  const { error: updateDraftError } = await supabase
    .from('ai_report_drafts')
    .update({
      title: sanitizeReportText(formData.get('report_title'), 180) ?? draft.title,
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
    .select('id')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)

  if (capturesError) {
    redirect(getReportRedirectPath(session.id, { error: capturesError.message }))
  }

  for (const capture of captures ?? []) {
    const includeInReport = formData.get(`capture_include_${capture.id}`) === 'on'
    const note = sanitizeReportText(formData.get(`capture_note_${capture.id}`), 2000)
    const { error: captureUpdateError } = await supabase
      .from('capture_items')
      .update({ include_in_report: includeInReport, technician_note: note, updated_at: now })
      .eq('id', capture.id)
      .eq('documentation_session_id', session.id)
      .eq('organization_id', profile.organization_id)

    if (captureUpdateError) {
      redirect(getReportRedirectPath(session.id, { error: captureUpdateError.message }))
    }
  }

  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
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
