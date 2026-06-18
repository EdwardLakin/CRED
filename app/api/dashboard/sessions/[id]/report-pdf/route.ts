import type { SupabaseClient } from '@supabase/supabase-js'
import { notFound, redirect } from 'next/navigation'

import { requireActiveBillingAccess } from '@/features/billing'
import {
  FIELD_SERVICE_FIELD_LABELS,
  FIELD_SERVICE_SECTIONS,
  getFieldServiceBoolean,
  getFieldServiceText,
  isFieldServiceSessionType,
  normalizeFieldServiceDetails,
} from '@/features/field-service'
import { buildUniversalReportDocument } from '@/features/reports/report-document'
import { buildCustomerAssetRows, buildNormalizedReportModel, classifyReferenceDocumentTitle, dedupeEvidenceDetails, deriveFormSectionsFromCaptures, getNormalizedFindingModels, getNormalizedRecommendedActions, isMeaningfulCustomerReportText, normalizeDraftSections, shouldRenderDetail, splitRecommendationText, stripConfidenceText, sanitizeCapturesForImageAiAssist } from '@/features/reports/report-structure'
import { getDisplayReportTitle, getReportInfoValue } from '@/features/reports/report-title'
import { asDiagnosticRecordArray, getDiagnosticProcedureProgress, getDiagnosticStepCompleteness } from '@/features/diagnostic-procedures/progress'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { recordUsageEvent } from '@/features/usage'
import { formatDateInTimeZone, formatDateTimeInTimeZone } from '@/lib/date-format'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database, Json } from '@/lib/supabase/database.types'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ id: string }>
}

type ReportCapture = Database['public']['Tables']['capture_items']['Row']
type ReportSignature = Database['public']['Tables']['signature_captures']['Row']
type ReportDraft = Database['public']['Tables']['ai_report_drafts']['Row']
type ReportDraftSection = Database['public']['Tables']['ai_report_draft_sections']['Row']
type ReportSession = Database['public']['Tables']['documentation_sessions']['Row'] & {
  organizations: { name: string; image_ai_assist_enabled?: boolean | null } | null
}


function escapeHtml(value: unknown) {
  return stripConfidenceText(String(value ?? ''))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanReportTitle(preferred: string | null | undefined, session: ReportSession, draft: ReportDraft | null | undefined) {
  return getDisplayReportTitle(preferred ? { ...draft, title: preferred } : draft, session)
}

function escapeRawHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}


function isHiddenFromReport(metadata: Json) {
  return isRecord(metadata) && metadata.hidden_from_report === true
}

function buildFinalNotesHtml(session: Pick<ReportSession, 'final_notes' | 'include_final_notes_in_export'>) {
  const notes = session.include_final_notes_in_export ? (session.final_notes ?? '') : ''
  if (!notes) return ''
  return `<section class="item service-section"><h2>Final Summary / Report Notes</h2><p>${escapeRawHtml(notes).replace(/\n/g, '<br />')}</p></section>`
}

function getCaptureFilename(capture: ReportCapture) {
  const path = capture.storage_path ?? capture.thumbnail_path
  if (!path) return ''
  return path.split('/').filter(Boolean).at(-1) ?? ''
}

function getEvidenceKind(capture: ReportCapture) {
  const isImageFile = Boolean(capture.storage_path?.match(/\.(jpg|jpeg|png|webp|gif|heic)$/i))
  if (capture.type === 'text_note' || capture.media_kind === 'note') return 'note'
  if (isImageFile || capture.media_kind === 'image' || capture.type === 'photo') return 'image'
  if (capture.media_kind === 'video' || capture.type === 'video') return 'video'
  if (capture.media_kind === 'audio' || capture.type === 'voice_note') return 'audio'
  if (capture.media_kind === 'document') return 'document'
  return 'file'
}

function getPrimaryEvidenceDescription(capture: ReportCapture) {
  return (
    capture.technician_note?.trim()
    || capture.transcript?.trim()
    || (capture.type === 'text_note' ? capture.technician_note?.trim() : '')
    || getCaptureFilename(capture)
    || getEvidenceKind(capture)
  )
}

function getAppendixCaptures(captures: ReportCapture[]) {
  const byId = new Map<string, ReportCapture>()
  const duplicateCaptureIds: string[] = []
  for (const capture of captures) {
    if (byId.has(capture.id)) {
      duplicateCaptureIds.push(capture.id)
      continue
    }
    byId.set(capture.id, capture)
  }
  return {
    captures: Array.from(byId.values()).sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()),
    duplicateCaptureIds: Array.from(new Set(duplicateCaptureIds)),
  }
}

function logExportIntegrity(params: { session: ReportSession; includedCaptures: ReportCapture[]; appendixCaptures: ReportCapture[]; duplicateCaptureIds: string[]; finalNotesSource: 'documentation_sessions.final_notes' | 'other' }) {
  const finalNotesLength = params.session.include_final_notes_in_export ? (params.session.final_notes ?? '').length : 0
  const integrity = {
    session_id: params.session.id,
    included_capture_count: params.includedCaptures.length,
    appendix_unique_capture_count: params.appendixCaptures.length,
    duplicate_capture_ids: params.duplicateCaptureIds,
    final_notes_length: finalNotesLength,
    final_notes_source: params.finalNotesSource,
  }
  if (integrity.appendix_unique_capture_count !== integrity.included_capture_count || integrity.duplicate_capture_ids.length > 0 || integrity.final_notes_source !== 'documentation_sessions.final_notes') {
    console.warn('[report-export-integrity]', integrity)
  }
}

function getDetailValue(details: Record<string, unknown>, fieldName: string) {
  const field = FIELD_SERVICE_SECTIONS.flatMap((section) => section.fields).find((item) => item.name === fieldName)
  if (field?.type === 'checkbox') {
    return getFieldServiceBoolean(details, fieldName) ? 'Yes' : 'No'
  }
  return getFieldServiceText(details, fieldName)
}

function getProfessionalRows(rows: Array<{ label: string; value: string }>) {
  const visibleRows = rows.filter((row) => row.value.trim())
  const captured = visibleRows.filter((row) => !/^(not captured|pending|unknown)$/i.test(row.value.trim()))
  return captured.length > 0 ? captured : visibleRows.slice(0, 4)
}


function renderReportInformationHtml(draft: ReportDraft | null | undefined, session: ReportSession) {
  const rows = [
    { label: 'Report Title', value: cleanReportTitle(draft?.title || session.title, session, draft) },
    { label: 'Subject Name', value: getReportInfoValue(draft, session, 'subject_name') },
    { label: 'Customer / Client', value: getReportInfoValue(draft, session, 'customer_client') || session.customer_name || '' },
    { label: 'Asset / Equipment', value: getReportInfoValue(draft, session, 'asset_equipment') || session.asset_label || '' },
    { label: 'Location / Address', value: getReportInfoValue(draft, session, 'location_address') },
    { label: 'Reference Number', value: getReportInfoValue(draft, session, 'reference_number') },
  ]
  const html = renderDefinitionRows(rows)
  return html ? `<section class="item service-section"><h2>Report Information</h2>${html}</section>` : ''
}

function buildStructuredFormDataHtml(reportStructure: Json | null) {
  const structure = isRecord(reportStructure) ? reportStructure : {}
  const blueprint = isRecord(structure.form_blueprint) ? structure.form_blueprint : null
  if (!blueprint) return ''
  const sections = Array.isArray(blueprint.sections) ? blueprint.sections : []
  const fields = Array.isArray(blueprint.fields) ? blueprint.fields : []
  const mappings = Array.isArray(structure.evidence_field_mappings) ? structure.evidence_field_mappings : []
  const confidence = typeof blueprint.confidence === 'number' ? blueprint.confidence : null
  const classification = typeof blueprint.classification === 'string' && confidence !== null && confidence >= 0.7 ? blueprint.classification.replace(/_/g, ' ') : 'Optional layout reference'
  const sectionRows = sections.slice(0, 12).flatMap((section) => {
    if (!isRecord(section)) return []
    const sectionId = typeof section.id === 'string' ? section.id : ''
    const title = typeof section.title === 'string' ? section.title : 'Form section'
    const count = fields.filter((field) => isRecord(field) && field.section_id === sectionId).length
    return [{ label: title, value: `${count} fields` }]
  })
  return `<section class="item service-section"><h2>Structured Form Data</h2><p class="muted">Optional uploaded form/report blueprint is used only as a layout reference when confidence is sufficient; otherwise the universal professional evidence report is used (${escapeHtml(classification)}). Evidence mappings reference user-provided captures and notes only.</p>${renderDefinitionRows([...sectionRows, { label: 'Evidence-field mappings', value: String(mappings.length) }])}</section>`
}

function renderDefinitionRows(rows: Array<{ label: string; value: string }>) {
  const visibleRows = getProfessionalRows(rows)
  if (visibleRows.length === 0) return ''
  return `<dl>${visibleRows.map((row) => `<div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`).join('')}</dl>`
}

function renderFieldServiceSection(details: Record<string, unknown>, sectionKey: string) {
  const section = FIELD_SERVICE_SECTIONS.find((item) => item.key === sectionKey)
  if (!section) return ''
  const rows = section.fields.map((field) => ({ label: field.label, value: getDetailValue(details, field.name) }))
  return `<section class="item service-section"><h2>${escapeHtml(section.title)}</h2>${renderDefinitionRows(rows)}</section>`
}


function buildInspectorFacilityHtml(profile: { full_name?: string | null; inspector_role_or_title?: string | null; technician_license_number?: string | null; inspector_email?: string | null; inspector_phone?: string | null; default_signature_path?: string | null; use_default_signature?: boolean | null } | null, companyProfile: { company_name?: string | null; facility_name?: string | null; facility_number?: string | null; facility_address_line_1?: string | null; facility_address_line_2?: string | null; facility_city?: string | null; facility_region?: string | null; facility_postal_code?: string | null; facility_country?: string | null; facility_phone?: string | null; facility_email?: string | null; permit_number?: string | null; certification_number?: string | null } | null, signatures: ReportSignature[], signatureUrls: Record<string, string>) {
  const address = [companyProfile?.facility_address_line_1, companyProfile?.facility_address_line_2, companyProfile?.facility_city, companyProfile?.facility_region, companyProfile?.facility_postal_code, companyProfile?.facility_country].filter(Boolean).join(', ')
  const rows = [
    { label: 'Inspector Name', value: profile?.full_name ?? '' },
    { label: 'Organization Name', value: companyProfile?.company_name ?? companyProfile?.facility_name ?? '' },
    { label: 'Role / Title', value: profile?.inspector_role_or_title ?? '' },
    { label: 'Email', value: profile?.inspector_email ?? companyProfile?.facility_email ?? '' },
    { label: 'Phone', value: profile?.inspector_phone ?? companyProfile?.facility_phone ?? '' },
    { label: 'Organization Address', value: address },
    { label: 'Licence Number', value: profile?.technician_license_number ?? '' },
    { label: 'Permit Number', value: companyProfile?.permit_number ?? '' },
    { label: 'Certification Number', value: companyProfile?.certification_number ?? '' },
  ]
  const signature = signatures.find((item) => /inspector|technician/i.test(item.signature_type)) ?? signatures[0]
  const defaultSignatureUrl = profile?.use_default_signature && profile.default_signature_path ? signatureUrls.__default_signature : null
  const signatureUrl = signature ? signatureUrls[signature.id] : defaultSignatureUrl
  const signatureLabel = signature ? 'Report-specific signature' : 'Default saved signature'
  const signatureHtml = signatureUrl
    ? `<div class="signature-block"><p class="muted">${escapeHtml(signatureLabel)}</p><img class="signature-image" src="${escapeHtml(signatureUrl)}" alt="Inspector signature" /></div>`
    : '<div class="signature-block signature-empty"><p class="muted">No signature available.</p></div>'
  return `<section class="item service-section"><h2>Inspector / Organization Details</h2>${renderDefinitionRows(rows)}${signatureHtml}</section>`
}

function getEvidenceTitle(capture: ReportCapture) {
  const referenceTitle = classifyReferenceDocumentTitle(capture)
  if (referenceTitle !== 'Reference Document' || capture.media_kind === 'document') return referenceTitle
  if (capture.type === 'text_note' || capture.media_kind === 'note') return "Technician Note"
  if (capture.media_kind === 'audio' || capture.type === 'voice_note') return "Voice Note"
  if (capture.media_kind === 'image' || capture.type === 'photo') return "Evidence Photo"
  return "Supporting Evidence"
}

function renderTextList(title: string, values: string[], existingRenderedText: string[]) {
  const visible = values.filter((value) => shouldRenderDetail(title, value, existingRenderedText))
  visible.forEach((value) => existingRenderedText.push(value))
  if (visible.length === 0) return ''
  return `<section class="finding"><h3>${escapeHtml(title)}</h3>${visible.map((value) => `<p>${escapeHtml(value)}</p>`).join('')}</section>`
}


function buildExecutiveSummaryHtml(params: { reportTitle: string; organizationName: string; dateLabel: string; findings: ReturnType<typeof getNormalizedFindingModels<ReportCapture>>; referenceCount: number; evidenceCount: number }) {
  return `<section class="item premium-cover"><p class="eyebrow">Professional Evidence Report</p><h1>${escapeHtml(params.reportTitle)}</h1><p class="meta">${escapeHtml(params.organizationName)} · ${escapeHtml(params.dateLabel)}</p></section><section class="item service-section"><h2>Report Overview</h2><p>Evidence-first report assembled from included captures and user-authored content. CRED does not diagnose, classify photos, determine findings, or recommend repairs.</p><dl><div><dt>Technician-authored findings</dt><dd>${params.findings.length}</dd></div><div><dt>Reference Documents Captured</dt><dd>${params.referenceCount}</dd></div><div><dt>Evidence Items Captured</dt><dd>${params.evidenceCount}</dd></div></dl></section>`
}

function buildFindingCardsHtml(items: ReturnType<typeof buildNormalizedReportModel<ReportCapture>>['findings'], signedUrls: Record<string, string>, options: { renderImages?: boolean } = {}) {
  const findings = getNormalizedFindingModels(items)
  if (findings.length === 0) return ''
  return `<section class="item service-section"><h2>Technician-Authored Findings</h2>${findings.map((finding, index) => {
    const capture = finding.entry.capture
    const signedUrl = signedUrls[capture.id]
    const isImageFile = Boolean(capture.storage_path?.match(/\.(jpg|jpeg|png|webp|gif|heic)$/i))
    const shouldRenderImage = options.renderImages !== false && signedUrl && (capture.media_kind === 'image' || capture.type === 'photo' || isImageFile)
    const imageHtml = shouldRenderImage ? `<div class="finding-image"><img src="${escapeHtml(signedUrl)}" alt="${escapeHtml(finding.title)} evidence image" /></div>` : ''
    const details = finding.details.filter((detail) => !finding.observations.some((observation) => observation.includes(detail.value)))
    return `<article class="finding-card">${imageHtml}<div class="finding-content"><p class="eyebrow">Finding ${index + 1}</p><h3>${escapeHtml(finding.title)}</h3><h4>Technician / Verified Condition</h4>${finding.observations.length ? finding.observations.map((item) => `<p>${escapeHtml(item)}</p>`).join('') : '<p class="muted">Condition documented in supporting evidence.</p>'}${details.length ? `<h4>Key Details</h4>${renderDefinitionRows(details.map((detail) => ({ label: detail.label, value: detail.value })))}` : ''}<h4>User-entered Recommendation</h4>${finding.recommendations.length ? `<ul>${finding.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p class="muted">No user-entered recommendation captured.</p>'}</div></article>`
  }).join('')}</section>`
}

function buildRecommendedActionsHtml(findings: ReturnType<typeof getNormalizedFindingModels<ReportCapture>>) {
  const actions = getNormalizedRecommendedActions(findings)
  if (!actions.length) return ''
  return `<section class="item service-section"><h2>Recommendations (User-entered)</h2><table><thead><tr><th>Priority</th><th>Action</th></tr></thead><tbody>${actions.map((item) => `<tr><td>${escapeHtml(item.priority)}</td><td>${escapeHtml(item.action)}</td></tr>`).join('')}</tbody></table></section>`
}

function buildReferenceDocumentsHtml(items: ReturnType<typeof buildNormalizedReportModel<ReportCapture>>['findings'], signedUrls: Record<string, string>, options: { includeOriginal?: boolean } = {}) {
  if (!items.length) return ''
  return `<section class="item service-section"><h2>Reference Documents</h2>${items.map((entry) => { const details = dedupeEvidenceDetails(entry.group.details).filter((detail) => isMeaningfulCustomerReportText(detail.value)); const originalHtml = options.includeOriginal === false ? '' : `<details><summary>View Original Reference</summary>${buildEvidenceItemsHtml([entry], signedUrls)}</details>`; return `<article class="reference-card"><h3>${escapeHtml(getEvidenceTitle(entry.capture))}</h3>${details.length ? renderDefinitionRows(details.map((detail) => ({ label: detail.label, value: detail.value }))) : '<p class="muted">Reference captured for report support.</p>'}${originalHtml}</article>` }).join('')}</section>`
}

function buildEvidenceItemsHtml(
  items: ReturnType<typeof buildNormalizedReportModel<ReportCapture>>['findings'],
  signedUrls: Record<string, string>,
) {
  return items.map((entry) => {
    const capture = entry.capture
    const signedUrl = signedUrls[capture.id]
    const isImageFile = Boolean(capture.storage_path?.match(/\.(jpg|jpeg|png|webp|gif|heic)$/i))
    const mediaKind = isImageFile ? 'image' : (capture.media_kind || (capture.type === 'text_note' ? 'note' : capture.type === 'video' ? 'video' : 'image'))
    const evidenceTitle = getEvidenceTitle(capture)
    const title = evidenceTitle
    const mediaHtml = mediaKind === 'note'
      ? `<div class="video-still">${escapeHtml(stripConfidenceText(capture.technician_note || capture.transcript || 'Technician Note'))}</div>`
      : signedUrl && mediaKind === 'image'
        ? `<img src="${escapeHtml(signedUrl)}" alt="${escapeHtml(getEvidenceTitle(capture))}" />`
        : signedUrl && mediaKind === 'video'
          ? `<div class="video-still">Video reference</div><p class="video-link"><a href="${escapeHtml(signedUrl)}">Open video evidence</a></p>`
          : signedUrl
            ? `<p><a href="${escapeHtml(signedUrl)}">Open saved file</a></p>`
            : mediaKind === 'audio'
              ? '<div class="video-still">Voice Note</div>'
              : `<div class="video-still">Saved evidence file</div>`
    const group = entry.group
    const renderedText: string[] = []
    const details = dedupeEvidenceDetails(group.details).filter((detail) => shouldRenderDetail(detail.label, detail.value, renderedText))
    details.forEach((detail) => renderedText.push(detail.value))
    const detailsHtml = details.length ? `<section class="finding"><h3>Details</h3>${renderDefinitionRows(details.map((detail) => ({ label: detail.label, value: detail.value })))}</section>` : ''
    const findingsHtml = renderTextList('Observed condition', group.findings, renderedText)
    const recs = group.recommendations.flatMap(splitRecommendationText).filter((value) => shouldRenderDetail('Recommendation', value, renderedText))
    recs.forEach((value) => renderedText.push(value))
    const recommendationsHtml = recs.length ? `<section class="finding"><h3>Recommendations</h3><ul>${recs.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul></section>` : ''
    return `<article class="item">
      <h2>${escapeHtml(title)}</h2>
      <div class="media">${mediaHtml}</div>
      ${detailsHtml}${findingsHtml}${recommendationsHtml}
    </article>`
  }).join('')
}

function buildEvidenceSectionHtml(title: string, items: ReturnType<typeof buildNormalizedReportModel<ReportCapture>>['findings'], signedUrls: Record<string, string>) {
  if (items.length === 0) return ''
  return `<section class="item service-section"><h2>${escapeHtml(title)}</h2><div class="evidence-children">${buildEvidenceItemsHtml(items, signedUrls)}</div></section>`
}

function buildEvidenceAppendixHtml(captures: ReportCapture[], signedUrls: Record<string, string>, timeZone: string | null, options: { showDebugDetails?: boolean } = {}) {
  if (captures.length === 0) return '<section class="item service-section"><h2>Evidence Appendix</h2><p class="muted">No included evidence selected for this report.</p></section>'
  const reportDocument = buildUniversalReportDocument({ captures, timeZone })
  const evidenceByCaptureId = new Map(reportDocument.evidenceItems.map((item) => [item.sourceCaptureId, item]))
  return `<section class="item service-section"><h2>Evidence Appendix</h2><p class="muted">Included captures are listed once from the reviewed report state. Each section traces back to capture IDs where available.</p><div class="evidence-grid">${captures.map((capture) => {
    const signedUrl = signedUrls[capture.id]
    const mediaKind = getEvidenceKind(capture)
    const evidenceMeta = evidenceByCaptureId.get(capture.id)
    const primaryNote = evidenceMeta?.note || getPrimaryEvidenceDescription(capture) || 'No technician note provided.'
    const mediaHtml = signedUrl && mediaKind === 'image'
      ? `<img src="${escapeHtml(signedUrl)}" alt="${escapeHtml(getEvidenceTitle(capture))}" />`
      : signedUrl
        ? `<p><a href="${escapeHtml(signedUrl)}">Open ${escapeHtml(mediaKind)} evidence</a></p>`
        : `<div class="video-still">${escapeHtml(getEvidenceTitle(capture))}</div>`
    const technicianFields = isRecord(capture.extracted_data) ? capture.extracted_data : {}
    const technicianPills = [
      typeof technicianFields.technician_status === 'string' ? technicianFields.technician_status : null,
      typeof technicianFields.technician_category === 'string' ? technicianFields.technician_category : null,
    ].filter((value): value is string => Boolean(value?.trim()))
    const neutralPills = [getEvidenceTitle(capture), 'Included', 'Captured']
    const pillsHtml = `<div class="evidence-pill-row">${[...technicianPills, ...neutralPills].map((pill) => `<span class="evidence-pill">${escapeHtml(pill.replace(/_/g, ' '))}</span>`).join('')}</div>`
    const detailRows = [{ label: 'Evidence ID', value: evidenceMeta?.evidenceId ?? '' }, { label: 'Captured', value: evidenceMeta?.capturedAtLabel ?? formatDateTimeInTimeZone(new Date(capture.captured_at), timeZone) }, { label: 'Evidence type', value: evidenceMeta?.evidenceType ?? mediaKind }, { label: 'Source capture ID', value: capture.id }]
    if (options.showDebugDetails) detailRows.unshift({ label: 'Capture ID', value: capture.id }, { label: 'Media kind', value: String(capture.media_kind ?? mediaKind) })
    return `<article class="evidence-card"${options.showDebugDetails ? ` data-capture-id="${escapeHtml(capture.id)}"` : ''}><div class="media evidence-media">${mediaHtml}</div><div class="evidence-copy"><h3>${escapeHtml(`${evidenceMeta?.evidenceId ?? 'Evidence'} · ${getEvidenceTitle(capture)}`)}</h3>${pillsHtml}<p>${escapeHtml(primaryNote)}</p>${renderDefinitionRows(detailRows)}</div></article>`
  }).join('')}</div></section>`
}


function getDiagnosticProcedureInfo(draft: ReportDraft | null) {
  if (!draft || !isRecord(draft.report_structure) || draft.report_structure.mode !== 'diagnostic_procedure') return null
  const procedure = isRecord(draft.report_structure.procedure) ? draft.report_structure.procedure : {}
  return {
    title: typeof procedure.title === 'string' ? procedure.title : draft.title ?? 'Diagnostic Procedure Workspace',
    manufacturer: typeof procedure.manufacturer === 'string' ? procedure.manufacturer : null,
    documentType: typeof procedure.document_type === 'string' ? procedure.document_type.replace(/_/g, ' ') : null,
    sourceFile: typeof procedure.source_file_name === 'string' ? procedure.source_file_name : null,
    signedOff: draft.report_structure.signed_off === true,
    signOffName: typeof draft.report_structure.sign_off_name === 'string' ? draft.report_structure.sign_off_name : null,
    signedOffAt: typeof draft.report_structure.signed_off_at === 'string' ? draft.report_structure.signed_off_at : null,
    signOffStatement: typeof draft.report_structure.sign_off_statement === 'string' ? draft.report_structure.sign_off_statement : null,
  }
}

function getDiagnosticStepMetadata(section: ReportDraftSection) {
  return isRecord(section.metadata) ? section.metadata as Record<string, unknown> : {}
}

function getDiagnosticEvidenceRole(capture: ReportCapture) {
  if (!isRecord(capture.extracted_data) || !isRecord(capture.extracted_data.diagnostic_step)) return 'other'
  const role = capture.extracted_data.diagnostic_step.evidence_role
  return typeof role === 'string' ? role : 'other'
}

function formatDiagnosticEvidenceRole(role: string) {
  return role.replace(/_/g, ' ')
}

function captureMatchesDiagnosticStep(capture: ReportCapture, stepId: string) {
  return isRecord(capture.extracted_data) && isRecord(capture.extracted_data.diagnostic_step) && capture.extracted_data.diagnostic_step.step_id === stepId
}

function buildDiagnosticProcedureReportHtml(params: { session: ReportSession; organizationName: string; reportDraft: ReportDraft; reportSections: ReportDraftSection[]; captureItems: ReportCapture[]; signedUrls: Record<string, string>; showToolbar: boolean; timeZone: string | null }) {
  const info = getDiagnosticProcedureInfo(params.reportDraft)
  const steps = params.reportSections.filter((section) => { const metadata = getDiagnosticStepMetadata(section); return metadata.section_type === 'diagnostic_procedure_step' && metadata.visible !== false })
  const progress = getDiagnosticProcedureProgress(steps, params.captureItems)
  const toolbarHtml = params.showToolbar ? '<div class="toolbar"><button onclick="window.print()">Print / Save Documentation</button><p class="print-help">Documentation support only. Follow OEM procedure.</p></div>' : ''
  const stepHtml = steps.map((section) => {
    const metadata = getDiagnosticStepMetadata(section)
    const stepId = typeof metadata.step_id === 'string' ? metadata.step_id : section.section_key
    const readings = asDiagnosticRecordArray(metadata.technician_readings)
    const stepCaptures = params.captureItems.filter((capture) => captureMatchesDiagnosticStep(capture, stepId))
    const completeness = getDiagnosticStepCompleteness(section, params.captureItems)
    const readingsHtml = readings.length ? renderDefinitionRows(readings.map((reading, index) => ({ label: String(reading.label ?? `Reading ${index + 1}`), value: `${String(reading.value ?? '')}${reading.unit ? ` ${String(reading.unit)}` : ''}` }))) : '<p class="muted">No technician readings entered.</p>'
    const evidenceHtml = stepCaptures.length ? Array.from(new Set(stepCaptures.map(getDiagnosticEvidenceRole))).map((role) => `<div><p class="muted">${escapeHtml(formatDiagnosticEvidenceRole(role))}</p><ul>${stepCaptures.filter((capture) => getDiagnosticEvidenceRole(capture) === role).map((capture) => `<li>${escapeHtml(getEvidenceTitle(capture))}${capture.technician_note ? ` — ${escapeHtml(capture.technician_note)}` : ''}</li>`).join('')}</ul></div>`).join('') : '<p class="muted">No step evidence attached.</p>'
    return `<section class="item service-section"><h2>${escapeHtml(section.title)}</h2>${typeof metadata.source_page_start === 'number' ? `<p class="muted">Source page${typeof metadata.source_page_end === 'number' && metadata.source_page_end !== metadata.source_page_start ? `s ${metadata.source_page_start}-${metadata.source_page_end}` : ` ${metadata.source_page_start}`}</p>` : ''}${Array.isArray(metadata.extraction_warnings) && metadata.extraction_warnings.length ? `<p class="notice warning">${escapeHtml(metadata.extraction_warnings.map(String).join('; '))}</p>` : ''}<p><strong>Status:</strong> ${escapeHtml(typeof metadata.technician_status === 'string' ? metadata.technician_status.replace(/_/g, ' ') : 'not tested')}</p><p><strong>Completeness:</strong> ${escapeHtml(completeness.badges.length ? completeness.badges.join(', ') : 'Incomplete')}</p>${typeof metadata.technician_selected_branch === 'string' && metadata.technician_selected_branch ? `<p><strong>Technician-selected branch:</strong> ${escapeHtml(metadata.technician_selected_branch)}</p>` : ''}<h3>OEM instruction text</h3><p>${escapeHtml(String(metadata.instruction ?? section.body ?? ''))}</p>${typeof metadata.oem_flow_text === 'string' && metadata.oem_flow_text ? `<p><strong>OEM flow text:</strong> ${escapeHtml(metadata.oem_flow_text)}</p>` : ''}<h3>Technician-entered readings</h3>${readingsHtml}${typeof metadata.technician_notes === 'string' && metadata.technician_notes ? `<h3>Technician notes</h3><p>${escapeHtml(metadata.technician_notes)}</p>` : ''}${typeof metadata.technician_conclusion === 'string' && metadata.technician_conclusion ? `<h3>Technician conclusion</h3><p>${escapeHtml(metadata.technician_conclusion)}</p>` : ''}<h3>Attached evidence</h3>${evidenceHtml}</section>`
  }).join('')
  const appendixHtml = buildEvidenceAppendixHtml(getAppendixCaptures(params.captureItems).captures, params.signedUrls, params.timeZone)
  const details = [
    { label: 'Organization', value: params.organizationName },
    { label: 'Session', value: params.session.title },
    { label: 'Procedure', value: info?.title ?? params.reportDraft.title ?? 'Diagnostic Procedure Workspace' },
    { label: 'Manufacturer', value: info?.manufacturer ?? '' },
    { label: 'Document type', value: info?.documentType ?? '' },
    { label: 'Source file', value: info?.sourceFile ?? '' },
    { label: 'Technician sign-off', value: info?.signedOff ? `Signed by ${info.signOffName ?? 'technician'}${info.signedOffAt ? ` at ${formatDateInTimeZone(new Date(info.signedOffAt), params.timeZone)}` : ''}` : 'Not signed off' },
    { label: 'Date', value: formatDateInTimeZone(new Date(), params.timeZone) },
  ]
  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(info?.title ?? params.session.title)} diagnostic procedure documentation</title><style>${REPORT_STYLES}</style></head><body><main class="report">${toolbarHtml}<header class="header"><p class="eyebrow">Diagnostic Procedure Workspace</p><h1>${escapeHtml(info?.title ?? params.session.title)}</h1><p class="notice info"><strong>Documentation support only.</strong> Follow OEM procedure. Technician owns all conclusions and recommendations. AI does not diagnose, determine root cause, or recommend repair.</p>${info?.signedOff ? `<p class="notice info"><strong>Signed off by ${escapeHtml(info.signOffName ?? 'technician')}</strong>${info.signedOffAt ? ` at ${escapeHtml(formatDateInTimeZone(new Date(info.signedOffAt), params.timeZone))}` : ''}. ${escapeHtml(info.signOffStatement ?? '')}</p>` : '<p class="notice warning"><strong>Technician sign-off pending.</strong></p>'}${renderDefinitionRows(details)}</header>${`<section class="item service-section"><h2>Documentation completeness summary</h2>${renderDefinitionRows([
    { label: 'Percent complete', value: `${progress.percentComplete}%` },
    { label: 'Visible steps', value: String(progress.totalVisibleSteps) },
    { label: 'Incomplete steps', value: String(progress.incompleteSteps) },
    { label: 'Blocked steps', value: String(progress.blockedSteps) },
    { label: 'Missing readings/evidence/branches', value: String(progress.missingRequiredDocumentationCount) },
    { label: 'Warnings', value: String(progress.warningCount) },
    { label: 'Documentation ready', value: progress.reportReady ? 'Yes' : 'No' },
  ])}</section>`}${stepHtml || '<section class="item"><h2>No visible procedure steps documented.</h2><p class="notice warning">All extracted steps may be hidden or unavailable.</p></section>'}${appendixHtml}</main></body></html>`
}

function buildFieldServiceReportHtml({
  session,
  organizationName,
  captureItems,
  signedUrls,
  signatures,
  signatureUrls,
  reportDraft,
  reportSections,
  showToolbar = true,
  timeZone,
}: {
  session: ReportSession
  organizationName: string
  captureItems: ReportCapture[]
  signedUrls: Record<string, string>
  signatures: ReportSignature[]
  signatureUrls: Record<string, string>
  reportDraft: ReportDraft | null
  reportSections: ReportDraftSection[]
  showToolbar?: boolean
  timeZone: string | null
}) {
  const details = normalizeFieldServiceDetails(session.field_service_details)
  const headerRows = [
    { label: 'Company', value: organizationName },
    { label: 'Customer', value: getDetailValue(details, 'customer_name') || session.customer_name || '' },
    { label: 'Customer address', value: getDetailValue(details, 'customer_address') },
    { label: 'Customer phone', value: getDetailValue(details, 'customer_phone') },
    { label: 'Work order #', value: getDetailValue(details, 'work_order_number') },
    { label: 'PO #', value: getDetailValue(details, 'purchase_order_number') },
    { label: 'Unit #', value: getDetailValue(details, 'unit_number') || session.unit_number || '' },
    { label: 'Licence #', value: getDetailValue(details, 'licence_number') },
    { label: 'Date', value: formatDateInTimeZone(new Date(), timeZone) },
    { label: 'Job completed', value: getDetailValue(details, 'job_completed') },
  ]
  const travelRows = ['travel_start_location', 'travel_end_location', 'travel_start_odometer', 'travel_end_odometer', 'kilometers_traveled', 'travel_started_at', 'travel_ended_at', 'gps_distance_km', 'gps_distance_source']
    .map((fieldName) => ({ label: FIELD_SERVICE_FIELD_LABELS[fieldName] ?? fieldName, value: getDetailValue(details, fieldName) }))
  const workRows = ['complaint', 'cause_of_failure', 'correction', 'technician_notes']
    .map((fieldName) => ({ label: FIELD_SERVICE_FIELD_LABELS[fieldName] ?? fieldName, value: getDetailValue(details, fieldName) }))
  const timeRows = ['work_started_at', 'work_ended_at', 'travel_time_hours', 'working_time_hours', 'overtime_hours', 'double_time_hours', 'total_hours']
    .map((fieldName) => ({ label: FIELD_SERVICE_FIELD_LABELS[fieldName] ?? fieldName, value: getDetailValue(details, fieldName) }))
  const chargeRows = ['labour_charge', 'parts_charge', 'mileage_charge', 'expenses_charge', 'misc_charges', 'subtotal', 'tax', 'total']
    .map((fieldName) => ({ label: FIELD_SERVICE_FIELD_LABELS[fieldName] ?? fieldName, value: getDetailValue(details, fieldName) }))
  const reviewDocument = buildNormalizedReportModel({ captures: captureItems, sections: [], draftSections: reportSections, measurements: reportDraft?.measurements ?? [], findings: reportDraft?.findings ?? [] })
  const reportTitle = cleanReportTitle(reportDraft?.title || session.title, session, reportDraft)
  const findingModels = reviewDocument.findingModels
  const summaryHtml = buildExecutiveSummaryHtml({ reportTitle, organizationName, dateLabel: formatDateInTimeZone(new Date(), timeZone), findings: findingModels, referenceCount: reviewDocument.referenceDocuments.length, evidenceCount: captureItems.length })
  const appendixHtml = buildEvidenceAppendixHtml(getAppendixCaptures(captureItems).captures, signedUrls, timeZone)
  const evidenceHtml = [buildFindingCardsHtml(reviewDocument.findings, signedUrls), buildRecommendedActionsHtml(findingModels), buildReferenceDocumentsHtml(reviewDocument.referenceDocuments, signedUrls), buildEvidenceSectionHtml('Additional Notes', reviewDocument.additionalNotes.filter((entry) => isMeaningfulCustomerReportText([entry.capture.technician_note, entry.capture.transcript, ...entry.group.findings, ...entry.group.recommendations].filter(Boolean).join(' '))), signedUrls), buildEvidenceSectionHtml('Supporting Evidence', reviewDocument.supportingEvidence, signedUrls)].join('')
  const toolbarHtml = showToolbar ? '<div class="toolbar"><button onclick="window.print()">Print / Save Report</button><p class="print-help">Use your browser’s Print or Share menu to save a printable report.</p></div>' : ''

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(reportTitle)} printable field service report</title>
  <style>${REPORT_STYLES}</style></head><body><main class="report">${toolbarHtml}<header class="header"><p class="eyebrow">Report Header</p>${renderDefinitionRows(headerRows)}</header>${summaryHtml}${renderFieldServiceSection(details, 'equipment')}<section class="item service-section"><h2>Travel</h2>${renderDefinitionRows(travelRows)}</section><section class="item service-section"><h2>Work performed</h2>${renderDefinitionRows(workRows)}</section><section class="item service-section"><h2>Evidence</h2><p class="muted">Evidence items reference captured photos, videos, documents, and technician notes.</p></section>${buildFinalNotesHtml(session)}${evidenceHtml}${appendixHtml}<section class="item service-section"><h2>Time card summary</h2>${renderDefinitionRows(timeRows)}</section><section class="item service-section"><h2>Charges / documentation only</h2>${renderDefinitionRows(chargeRows)}</section>${buildInspectorFacilityHtml(null, null, signatures, signatureUrls)}</main></body></html>`
}

const REPORT_STYLES = `
    body{font-family:Arial,Helvetica,sans-serif;background:#f7f8fc;color:#13213a;margin:0;padding:32px}.report{max-width:980px;margin:0 auto}.header,.item{background:white;border:1px solid #d8e2ef;border-radius:18px;box-shadow:0 12px 34px rgba(20,33,61,.08);padding:24px;margin-bottom:18px}.eyebrow{color:#155dfc;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.meta,.muted{color:#5f6f89}.media{position:relative;border-radius:16px;overflow:hidden;background:#f1f5fb;border:1px solid #d8e2ef}.media img{display:block;width:100%;max-height:620px;object-fit:contain;background:#0f172a}.note{background:rgba(15,23,42,.86);bottom:0;color:white;left:0;padding:14px 18px;position:absolute;right:0}.note p{margin:6px 0 0}.finding{margin-top:16px}.finding h3{margin-bottom:8px}dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}dl div{background:#f1f5fb;border:1px solid #d8e2ef;border-radius:12px;padding:10px}dt{font-weight:800}dd{margin:4px 0 0}.video-still{align-items:center;aspect-ratio:16/9;background:#14213d;color:white;display:flex;font-size:24px;font-weight:800;justify-content:center}.video-link{padding:12px 16px}.toolbar{margin-bottom:16px}.print-help{color:#5f6f89;font-size:13px;margin:8px 0 0}.service-section h2{border-bottom:1px solid #d8e2ef;padding-bottom:8px}.signature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.signature-block{background:#f8fafc;border:1px solid #d8e2ef;border-radius:14px;padding:14px}.signature-image{background:white;border:1px solid #d8e2ef;border-radius:10px;display:block;max-height:120px;max-width:100%;object-fit:contain;padding:8px}.premium-cover{background:linear-gradient(135deg,#fff,#eef4ff)}.finding-card,.reference-card{border:1px solid #d8e2ef;border-radius:14px;margin:12px 0;padding:14px}.finding-card{display:grid;gap:16px;grid-template-columns:minmax(220px,36%) 1fr}.finding-image{align-self:start;background:#f1f5fb;border:1px solid #d8e2ef;border-radius:12px;overflow:hidden}.finding-image img{display:block;width:100%;max-height:360px;object-fit:contain}.reference-card details{margin-top:10px}.reference-card details:not([open]) .item{display:none}.evidence-grid{display:grid;gap:16px;grid-template-columns:repeat(2,minmax(0,1fr))}.evidence-card{border:1px solid #d8e2ef;border-radius:14px;display:grid;gap:12px;grid-template-rows:auto 1fr;padding:14px}.evidence-card h3{margin:0 0 8px}.evidence-card p{margin-top:0}.evidence-media img{max-height:260px;object-fit:contain}.evidence-copy dl{grid-template-columns:1fr}.evidence-copy dl div{padding:8px}.severity,.evidence-pill{background:#f8fafc;border:1px solid #d8e2ef;border-radius:999px;display:inline-block;font-size:12px;font-weight:800;padding:7px 10px}.evidence-pill-row{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d8e2ef;padding:10px;text-align:left}th{background:#f1f5fb}@media (max-width:700px){body{padding:14px}dl,.evidence-grid{grid-template-columns:1fr}.header,.item{border-radius:14px;padding:16px}.finding-card{grid-template-columns:1fr}}@media print{body{background:white;padding:0}.toolbar{display:none}.header,.item,.finding-card,.evidence-card{break-inside:avoid;box-shadow:none}.finding-image,.finding-image img{break-inside:avoid;visibility:visible}.reference-card details:not([open])>*:not(summary){display:none}.note{position:static;background:#14213d}a{color:#13213a}}
  `

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params
  const requestUrl = new URL(_request.url)
  const shareTokenValue = requestUrl.searchParams.get('share_token')
  const previewOnly = requestUrl.searchParams.get('preview') === '1'
  const showDebugDetails = requestUrl.searchParams.get('debug') === '1'
  const sharedAccess = Boolean(shareTokenValue)

  let supabase: SupabaseClient<Database>
  let session: ReportSession
  let organizationId: string
  let createdBy: string | null = null
  let timeZone: string | null = null

  if (shareTokenValue) {
    supabase = createAdminClient()
    const { data: shareToken, error: shareError } = await supabase
      .from('report_share_tokens')
      .select('*, documentation_sessions(*, organizations(name, image_ai_assist_enabled))')
      .eq('token', shareTokenValue)
      .maybeSingle()

    const sharedSession = Array.isArray(shareToken?.documentation_sessions)
      ? shareToken.documentation_sessions[0]
      : shareToken?.documentation_sessions

    if (
      shareError
      || !shareToken
      || !sharedSession
      || shareToken.disabled_at
      || sharedSession.id !== id
      || sharedSession.organization_id !== shareToken.organization_id
      || (shareToken.expires_at && new Date(shareToken.expires_at) < new Date())
    ) {
      notFound()
    }

    session = sharedSession as ReportSession
    organizationId = shareToken.organization_id
    createdBy = typeof sharedSession.created_by === 'string' ? sharedSession.created_by : null
  } else {
    const workspace = await requireSessionWorkspace()
    supabase = workspace.supabase
    organizationId = workspace.profile.organization_id
    createdBy = workspace.profile.id
    timeZone = workspace.profile.timezone

    const billingAccess = requireActiveBillingAccess(workspace.profile)

    if (!billingAccess.ok) {
      redirect(`/dashboard/sessions/${id}/report?error=${encodeURIComponent(billingAccess.message)}`)
    }

    const { data: ownedSession, error: sessionError } = await supabase
      .from('documentation_sessions')
      .select('*, organizations(name, image_ai_assist_enabled)')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single()

    if (sessionError || !ownedSession) notFound()

    if (!previewOnly && ownedSession.review_status !== 'ready_for_delivery') {
      redirect(
        `/dashboard/sessions/${id}/report?error=${encodeURIComponent('Approve this report before exporting.')}`,
      )
    }

    session = ownedSession
  }

  const { data: captures } = await supabase
    .from('capture_items')
    .select('*')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', organizationId)
    .eq('include_in_report', true)
    .is('deleted_at', null)
    .order('report_order', { ascending: true, nullsFirst: false })
    .order('captured_at', { ascending: true })

  const imageAiAssistEnabled = isRecord(session.organizations) && session.organizations.image_ai_assist_enabled === true
  const captureItems = sanitizeCapturesForImageAiAssist(captures ?? [], imageAiAssistEnabled) as ReportCapture[]
  const appendixCaptureResult = getAppendixCaptures(captureItems)
  const appendixCaptureItems = appendixCaptureResult.captures
  logExportIntegrity({
    session,
    includedCaptures: captureItems,
    appendixCaptures: appendixCaptureItems,
    duplicateCaptureIds: appendixCaptureResult.duplicateCaptureIds,
    finalNotesSource: 'documentation_sessions.final_notes',
  })
  const signedUrls: Record<string, string> = {}
  await Promise.all(captureItems.map(async (capture) => {
    const path = capture.storage_path ?? capture.thumbnail_path
    if (!path) return

    const { data } = await supabase.storage.from('documentation-captures').createSignedUrl(path, 60 * 20)
    if (data?.signedUrl) signedUrls[capture.id] = data.signedUrl
  }))

  const { data: signatures } = await supabase
    .from('signature_captures')
    .select('*')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', organizationId)
    .order('signed_at', { ascending: true })

  const reportSignatures = signatures ?? []

  const { data: reportProfile } = await supabase
    .from('profiles')
    .select('full_name, inspector_role_or_title, technician_license_number, inspector_email, inspector_phone, timezone, default_signature_path, use_default_signature')
    .eq('id', session.created_by)
    .eq('organization_id', organizationId)
    .maybeSingle()
  timeZone = timeZone ?? reportProfile?.timezone ?? 'UTC'

  const { data: reportCompanyProfile } = await supabase
    .from('company_profiles')
    .select('company_name, facility_name, facility_number, facility_address_line_1, facility_address_line_2, facility_city, facility_region, facility_postal_code, facility_country, facility_email, facility_phone, permit_number, certification_number')
    .eq('organization_id', organizationId)
    .maybeSingle()
  const signatureUrls: Record<string, string> = {}
  await Promise.all(reportSignatures.map(async (signature) => {
    const { data } = await supabase.storage.from('documentation-signatures').createSignedUrl(signature.signature_image_path, 60 * 20)
    if (data?.signedUrl) signatureUrls[signature.id] = data.signedUrl
  }))
  if ((reportSignatures.length === 0 || !reportSignatures.some((signature) => /inspector|technician/i.test(signature.signature_type))) && reportProfile?.use_default_signature && reportProfile.default_signature_path) {
    const { data } = await supabase.storage.from('documentation-signatures').createSignedUrl(reportProfile.default_signature_path, 60 * 20)
    if (data?.signedUrl) signatureUrls.__default_signature = data.signedUrl
  }

  const { data: reportDrafts } = await supabase
    .from('ai_report_drafts')
    .select('*')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', organizationId)
    .order('generated_at', { ascending: false })
    .order('created_at', { ascending: false })

  const reportDraft =
    (reportDrafts ?? []).find((draft) => draft.status === 'approved') ??
    (reportDrafts ?? []).find((draft) => draft.status !== 'superseded') ??
    reportDrafts?.[0] ??
    null

  const { data: draftSections } = reportDraft
    ? await supabase
        .from('ai_report_draft_sections')
        .select('*')
        .eq('ai_report_draft_id', reportDraft.id)
        .eq('documentation_session_id', session.id)
        .eq('organization_id', organizationId)
        .order('sort_order', { ascending: true })
    : { data: [] }
  const reportSections = draftSections ?? []

  if (!sharedAccess && !previewOnly) {
    await supabase.from('exports').insert({
      documentation_session_id: session.id,
      organization_id: organizationId,
      export_type: 'printable_report_opened',
      status: 'opened',
      created_by: createdBy,
      metadata: { item_count: captureItems.length, format: 'printable_html' },
    })
    await recordUsageEvent({
      supabase,
      organizationId,
      eventType: 'printable_report_opened',
      metadata: { session_id: session.id, item_count: captureItems.length, format: 'printable_html' },
      createdBy,
    })
  }

  const organizationName = isRecord(session.organizations) && typeof session.organizations.name === 'string'
    ? session.organizations.name
    : 'CRED'
  if (reportDraft && getDiagnosticProcedureInfo(reportDraft)) {
    const html = buildDiagnosticProcedureReportHtml({ session, organizationName, reportDraft, reportSections, captureItems, signedUrls, showToolbar: !previewOnly, timeZone })
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  if (isFieldServiceSessionType(session.session_type)) {
    const visibleReportSections = reportSections.filter((section) => !isHiddenFromReport(section.metadata))
    const html = buildFieldServiceReportHtml({ session, organizationName, captureItems, signedUrls, signatures: reportSignatures, signatureUrls, reportDraft, reportSections: visibleReportSections, showToolbar: !previewOnly, timeZone })
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const assetDetails = [session.asset_label, session.vin, session.unit_number, session.odometer, session.customer_name]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' · ')

  const visibleReportSections = reportSections.filter((section) => !isHiddenFromReport(section.metadata))
  const reportTitle = cleanReportTitle(reportDraft?.title || session.title, session, reportDraft)

  const documentSections = normalizeDraftSections(visibleReportSections, captureItems)
  const derivedFormSections = deriveFormSectionsFromCaptures(captureItems)
  const formSections = documentSections.length > 0 ? documentSections : derivedFormSections
  const customerAssetHtml = renderDefinitionRows(buildCustomerAssetRows(formSections, session as unknown as Record<string, unknown>))
  const structuredFormDataHtml = buildStructuredFormDataHtml(reportDraft?.report_structure ?? null)
  const reportInfoHtml = renderReportInformationHtml(reportDraft, session)
  const reviewDocument = buildNormalizedReportModel({ captures: captureItems, sections: formSections, draftSections: visibleReportSections, measurements: reportDraft?.measurements ?? [], findings: reportDraft?.findings ?? [] })
  const unattachedHtml = ''
  const findingModels = reviewDocument.findingModels
  const summaryHtml = buildExecutiveSummaryHtml({ reportTitle, organizationName, dateLabel: formatDateInTimeZone(new Date(), timeZone), findings: findingModels, referenceCount: reviewDocument.referenceDocuments.length, evidenceCount: captureItems.length })
  const appendixHtml = buildEvidenceAppendixHtml(appendixCaptureItems, signedUrls, timeZone, { showDebugDetails })
  const draftReferencedCaptureCount = new Set(visibleReportSections.flatMap((section) => section.source_capture_ids ?? []).filter((id) => captureItems.some((capture) => capture.id === id))).size
  const evidenceSectionIsEmpty = reviewDocument.findings.length === 0 && reviewDocument.referenceDocuments.length === 0 && reviewDocument.additionalNotes.length === 0 && reviewDocument.supportingEvidence.length === 0 && reviewDocument.unattachedDetails.length === 0
  if (captureItems.length > 0 && draftReferencedCaptureCount === 0 && evidenceSectionIsEmpty) console.warn('[report-evidence-check] Included captures have no draft references; Evidence Appendix will render all included captures.', { session_id: session.id, included_capture_count: captureItems.length })
  const referenceHtml = buildReferenceDocumentsHtml(reviewDocument.referenceDocuments, signedUrls, { includeOriginal: false })
  const findingsHtml = buildFindingCardsHtml(reviewDocument.findings, signedUrls, { renderImages: false })
  const supportingHtml = ''


  const toolbarHtml = previewOnly ? '' : '<div class="toolbar"><button onclick="window.print()">Print / Save Report</button><p class="print-help">Use your browser’s Print or Share menu to save a printable report.</p></div>'
  const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(reportTitle)} printable report</title>
  <style>${REPORT_STYLES}</style></head><body><main class="report">${toolbarHtml}<header class="header"><p class="eyebrow">Professional Evidence Report</p><p class="meta">${escapeHtml(session.session_type)} · ${escapeHtml(assetDetails || 'General evidence report')} · ${escapeHtml(formatDateInTimeZone(new Date(), timeZone))}</p></header>${summaryHtml}${reportInfoHtml}${structuredFormDataHtml}${customerAssetHtml || referenceHtml ? `<section class="item service-section"><h2>Report Metadata</h2>${customerAssetHtml}${referenceHtml}</section>` : ''}${findingsHtml}${unattachedHtml}${buildFinalNotesHtml(session)}${buildInspectorFacilityHtml(reportProfile, reportCompanyProfile, reportSignatures, signatureUrls)}${supportingHtml}${appendixHtml}</main></body></html>`

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
