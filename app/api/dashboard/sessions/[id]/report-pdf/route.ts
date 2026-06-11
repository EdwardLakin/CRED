import type { SupabaseClient } from '@supabase/supabase-js'
import { notFound, redirect } from 'next/navigation'

import { getBillingAccessErrorMessage, getOrganizationBillingAccess } from '@/features/billing'
import {
  FIELD_SERVICE_FIELD_LABELS,
  FIELD_SERVICE_SECTIONS,
  getFieldServiceBoolean,
  getFieldServiceText,
  isFieldServiceSessionType,
  normalizeFieldServiceDetails,
} from '@/features/field-service'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database, Json } from '@/lib/supabase/database.types'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ id: string }>
}

type ReportCapture = Database['public']['Tables']['capture_items']['Row']
type ReportSignature = Database['public']['Tables']['signature_captures']['Row']
type ReportSession = Database['public']['Tables']['documentation_sessions']['Row'] & {
  organizations: { name: string } | null
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getFields(extractedData: Json | null) {
  if (!isRecord(extractedData) || !isRecord(extractedData.extraction) || !isRecord(extractedData.extraction.fields)) {
    return []
  }

  const labels: Record<string, string> = {
    location: 'Location / position',
    component: 'Component',
    measurement: 'Measurement',
    condition: 'Condition',
    recommendation: 'Recommendation',
    severity: 'Severity',
    vin: 'VIN',
    unit_number: 'Unit number',
    odometer: 'Odometer',
    hour_meter: 'Hour meter',
    plate_number: 'Plate',
    work_order_number: 'Work order',
    manufacturer: 'Manufacturer',
    model: 'Model',
    serial_number: 'Serial',
    purchase_order_number: 'PO #',
    complaint: 'Complaint',
    cause_of_failure: 'Cause of failure',
    correction: 'Correction',
    technician_notes: 'Technician notes',
    recommendations: 'Recommendations',
    equipment_serial_number: 'Equipment serial',
    licence_number: 'Licence #',
  }

  return Object.entries(labels)
    .map(([field, label]) => {
      const value = extractedData.extraction && isRecord(extractedData.extraction) && isRecord(extractedData.extraction.fields)
        ? extractedData.extraction.fields[field]
        : null
      return typeof value === 'string' && value.trim() ? { label, value: value.trim() } : null
    })
    .filter((row): row is { label: string; value: string } => Boolean(row))
}


function getDetailValue(details: Record<string, unknown>, fieldName: string) {
  const field = FIELD_SERVICE_SECTIONS.flatMap((section) => section.fields).find((item) => item.name === fieldName)
  if (field?.type === 'checkbox') {
    return getFieldServiceBoolean(details, fieldName) ? 'Yes' : 'No'
  }
  return getFieldServiceText(details, fieldName)
}

function renderDefinitionRows(rows: Array<{ label: string; value: string }>) {
  const visibleRows = rows.filter((row) => row.value.trim())
  if (visibleRows.length === 0) return '<p class="muted">No details entered.</p>'
  return `<dl>${visibleRows.map((row) => `<div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`).join('')}</dl>`
}

function renderFieldServiceSection(details: Record<string, unknown>, sectionKey: string) {
  const section = FIELD_SERVICE_SECTIONS.find((item) => item.key === sectionKey)
  if (!section) return ''
  const rows = section.fields.map((field) => ({ label: field.label, value: getDetailValue(details, field.name) }))
  return `<section class="item service-section"><h2>${escapeHtml(section.title)}</h2>${renderDefinitionRows(rows)}</section>`
}

function buildSignaturesHtml(signatures: ReportSignature[], signatureUrls: Record<string, string>) {
  if (signatures.length === 0) return '<section class="item service-section"><h2>Signatures</h2><p class="muted">No signatures captured.</p></section>'
  return `<section class="item service-section"><h2>Signatures</h2><div class="signature-grid">${signatures.map((signature) => {
    const url = signatureUrls[signature.id]
    return `<div class="signature-block"><strong>${escapeHtml(signature.signature_type)}</strong><p>Signed By: ${escapeHtml(signature.signer_name)}</p><p>Date: ${escapeHtml(new Date(signature.signed_at).toLocaleString())}</p>${url ? `<img class="signature-image" src="${escapeHtml(url)}" alt="${escapeHtml(signature.signature_type)}" />` : '<p>Signature image saved.</p>'}</div>`
  }).join('')}</div></section>`
}

function buildEvidenceItemsHtml(captureItems: ReportCapture[], signedUrls: Record<string, string>) {
  return captureItems.map((capture, index) => {
    const signedUrl = signedUrls[capture.id]
    const note = capture.technician_note || capture.transcript || (capture.transcript_status === 'pending' ? 'Transcribing…' : 'No technician note provided.')
    const fields = getFields(capture.extracted_data)
    const mediaKind = capture.media_kind || (capture.type === 'video' ? 'video' : 'image')
    const mediaHtml = signedUrl && mediaKind === 'image'
      ? `<img src="${escapeHtml(signedUrl)}" alt="Evidence item ${index + 1}" />`
      : signedUrl && mediaKind === 'video'
        ? `<div class="video-still">Video reference</div><p class="video-link">Video file: <a href="${escapeHtml(signedUrl)}">${escapeHtml(capture.storage_path)}</a></p>`
        : signedUrl
          ? `<p><a href="${escapeHtml(signedUrl)}">Open saved ${escapeHtml(mediaKind)} file</a></p>`
          : `<div class="video-still">Saved evidence file</div>`

    return `<article class="item">
      <h2>Item ${index + 1}</h2>
      <div class="media">${mediaHtml}<div class="note"><strong>Technician note</strong><p>${escapeHtml(note)}</p></div></div>
      <section class="finding"><h3>AI finding / extracted details</h3><p>${escapeHtml(getAiSummary(capture.extracted_data, capture.ai_summary))}</p>
      ${fields.length > 0 ? renderDefinitionRows(fields) : '<p>Structured extraction pending.</p>'}</section>
    </article>`
  }).join('')
}

function buildFieldServiceReportHtml({
  session,
  organizationName,
  captureItems,
  signedUrls,
  signatures,
  signatureUrls,
}: {
  session: ReportSession
  organizationName: string
  captureItems: ReportCapture[]
  signedUrls: Record<string, string>
  signatures: ReportSignature[]
  signatureUrls: Record<string, string>
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
    { label: 'Date', value: new Date().toLocaleDateString() },
    { label: 'Job completed', value: getDetailValue(details, 'job_completed') },
  ]
  const travelRows = ['travel_start_location', 'travel_end_location', 'travel_start_odometer', 'travel_end_odometer', 'kilometers_traveled', 'travel_started_at', 'travel_ended_at', 'gps_distance_km', 'gps_distance_source']
    .map((fieldName) => ({ label: FIELD_SERVICE_FIELD_LABELS[fieldName] ?? fieldName, value: getDetailValue(details, fieldName) }))
  const workRows = ['complaint', 'cause_of_failure', 'correction', 'technician_notes']
    .map((fieldName) => ({ label: FIELD_SERVICE_FIELD_LABELS[fieldName] ?? fieldName, value: getDetailValue(details, fieldName) }))
  const timeRows = ['work_started_at', 'work_ended_at', 'travel_time_hours', 'working_time_hours', 'overtime_hours', 'double_time_hours', 'total_hours']
    .map((fieldName) => ({ label: FIELD_SERVICE_FIELD_LABELS[fieldName] ?? fieldName, value: getDetailValue(details, fieldName) }))
  const signatureRows = ['technician_name', 'technician_signature', 'customer_name_signed', 'customer_signature', 'customer_signed_at', 'supervisor_signature_name']
    .map((fieldName) => ({ label: FIELD_SERVICE_FIELD_LABELS[fieldName] ?? fieldName, value: getDetailValue(details, fieldName) }))
  const chargeRows = ['labour_charge', 'parts_charge', 'mileage_charge', 'expenses_charge', 'misc_charges', 'subtotal', 'tax', 'total']
    .map((fieldName) => ({ label: FIELD_SERVICE_FIELD_LABELS[fieldName] ?? fieldName, value: getDetailValue(details, fieldName) }))
  const evidenceHtml = buildEvidenceItemsHtml(captureItems, signedUrls)
  const signaturesHtml = buildSignaturesHtml(signatures, signatureUrls)

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(session.title)} field service report</title>
  <style>${REPORT_STYLES}</style></head><body><main class="report"><div class="toolbar"><button onclick="window.print()">Download / print PDF</button></div><header class="header"><p class="eyebrow">Field service report</p><h1>${escapeHtml(session.title)}</h1><p>${escapeHtml(organizationName)}</p><p class="meta">Documentation-only service report · ${escapeHtml(new Date().toLocaleDateString())}</p>${renderDefinitionRows(headerRows)}</header>${renderFieldServiceSection(details, 'equipment')}<section class="item service-section"><h2>Travel</h2>${renderDefinitionRows(travelRows)}</section><section class="item service-section"><h2>Work performed</h2>${renderDefinitionRows(workRows)}</section><section class="item service-section"><h2>Evidence</h2><p class="muted">Evidence items reference captured photos, videos, documents, and technician notes.</p></section>${evidenceHtml || '<section class="item"><h2>No report evidence selected.</h2></section>'}<section class="item service-section"><h2>Time card summary</h2>${renderDefinitionRows(timeRows)}</section><section class="item service-section"><h2>Charges / documentation only</h2>${renderDefinitionRows(chargeRows)}</section><section class="item service-section"><h2>Signature requirements</h2>${renderDefinitionRows(signatureRows)}</section>${signaturesHtml}</main></body></html>`
}

const REPORT_STYLES = `
    body{font-family:Arial,Helvetica,sans-serif;background:#f7f8fc;color:#13213a;margin:0;padding:32px}.report{max-width:980px;margin:0 auto}.header,.item{background:white;border:1px solid #d8e2ef;border-radius:18px;box-shadow:0 12px 34px rgba(20,33,61,.08);padding:24px;margin-bottom:18px}.eyebrow{color:#155dfc;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.meta,.muted{color:#5f6f89}.media{position:relative;border-radius:16px;overflow:hidden;background:#f1f5fb;border:1px solid #d8e2ef}.media img{display:block;width:100%;max-height:620px;object-fit:contain;background:#0f172a}.note{background:rgba(15,23,42,.86);bottom:0;color:white;left:0;padding:14px 18px;position:absolute;right:0}.note p{margin:6px 0 0}.finding{margin-top:16px}.finding h3{margin-bottom:8px}dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}dl div{background:#f1f5fb;border:1px solid #d8e2ef;border-radius:12px;padding:10px}dt{font-weight:800}dd{margin:4px 0 0}.video-still{align-items:center;aspect-ratio:16/9;background:#14213d;color:white;display:flex;font-size:24px;font-weight:800;justify-content:center}.video-link{padding:12px 16px}.toolbar{margin-bottom:16px}.service-section h2{border-bottom:1px solid #d8e2ef;padding-bottom:8px}.signature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.signature-block{background:#f8fafc;border:1px solid #d8e2ef;border-radius:14px;padding:14px}.signature-image{background:white;border:1px solid #d8e2ef;border-radius:10px;display:block;max-height:120px;max-width:100%;object-fit:contain;padding:8px}@media print{body{background:white;padding:0}.toolbar{display:none}.header,.item{break-inside:avoid;box-shadow:none}.note{position:static;background:#14213d}a{color:#13213a}}
  `

function getAiSummary(extractedData: Json | null, fallback: string | null) {
  if (fallback) return fallback
  if (!isRecord(extractedData)) return 'AI review pending.'
  const extraction = isRecord(extractedData.extraction) ? extractedData.extraction : null
  if (typeof extraction?.summary === 'string' && extraction.summary.trim()) return extraction.summary.trim()
  const classification = isRecord(extractedData.classification) ? extractedData.classification : null
  if (typeof classification?.label === 'string') return `Classified as ${classification.label}.`
  return 'AI review pending.'
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params
  const requestUrl = new URL(_request.url)
  const shareTokenValue = requestUrl.searchParams.get('share_token')
  const sharedAccess = Boolean(shareTokenValue)

  let supabase: SupabaseClient<Database>
  let session: ReportSession
  let organizationId: string
  let createdBy: string | null = null

  if (shareTokenValue) {
    supabase = createAdminClient()
    const { data: shareToken, error: shareError } = await supabase
      .from('report_share_tokens')
      .select('*, documentation_sessions(*, organizations(name))')
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
  } else {
    const workspace = await requireSessionWorkspace()
    supabase = workspace.supabase
    organizationId = workspace.profile.organization_id
    createdBy = workspace.profile.id

    const billingAccess = getOrganizationBillingAccess(workspace.profile.organization)

    if (!billingAccess.hasAccess) {
      redirect(`/dashboard?error=${encodeURIComponent(getBillingAccessErrorMessage(billingAccess))}`)
    }

    const { data: ownedSession, error: sessionError } = await supabase
      .from('documentation_sessions')
      .select('*, organizations(name)')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single()

    if (sessionError || !ownedSession) notFound()
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

  const captureItems = captures ?? []
  const signedUrls: Record<string, string> = {}
  await Promise.all(captureItems.map(async (capture) => {
    const { data } = await supabase.storage.from('documentation-captures').createSignedUrl(capture.storage_path, 60 * 20)
    if (data?.signedUrl) signedUrls[capture.id] = data.signedUrl
  }))

  const { data: signatures } = await supabase
    .from('signature_captures')
    .select('*')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', organizationId)
    .order('signed_at', { ascending: true })

  const reportSignatures = signatures ?? []
  const signatureUrls: Record<string, string> = {}
  await Promise.all(reportSignatures.map(async (signature) => {
    const { data } = await supabase.storage.from('documentation-signatures').createSignedUrl(signature.signature_image_path, 60 * 20)
    if (data?.signedUrl) signatureUrls[signature.id] = data.signedUrl
  }))

  if (!sharedAccess) {
    await supabase.from('exports').insert({
      documentation_session_id: session.id,
      organization_id: organizationId,
      export_type: 'pdf',
      status: 'generated',
      created_by: createdBy,
      metadata: { item_count: captureItems.length, format: 'print_ready_html' },
    })
  }

  const organizationName = isRecord(session.organizations) && typeof session.organizations.name === 'string'
    ? session.organizations.name
    : 'CRED'
  if (isFieldServiceSessionType(session.session_type)) {
    const html = buildFieldServiceReportHtml({ session, organizationName, captureItems, signedUrls, signatures: reportSignatures, signatureUrls })
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const assetDetails = [session.asset_label, session.vin, session.unit_number, session.odometer, session.customer_name]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' · ')

  const itemsHtml = captureItems.map((capture, index) => {
    const signedUrl = signedUrls[capture.id]
    const note = capture.technician_note || capture.transcript || (capture.transcript_status === 'pending' ? 'Transcribing…' : 'No technician note provided.')
    const fields = getFields(capture.extracted_data)
    const mediaKind = capture.media_kind || (capture.type === 'video' ? 'video' : 'image')
    const mediaHtml = signedUrl && mediaKind === 'image'
      ? `<img src="${escapeHtml(signedUrl)}" alt="Evidence item ${index + 1}" />`
      : signedUrl && mediaKind === 'video'
        ? `<div class="video-still">Video thumbnail/still</div><p class="video-link">Video file: <a href="${escapeHtml(signedUrl)}">${escapeHtml(capture.storage_path)}</a></p>`
        : signedUrl
          ? `<p><a href="${escapeHtml(signedUrl)}">Open saved ${escapeHtml(mediaKind)} file</a></p>`
          : `<div class="video-still">Saved evidence file</div>`

    return `<article class="item">
      <h2>Item ${index + 1}</h2>
      <div class="media">${mediaHtml}<div class="note"><strong>Technician note</strong><p>${escapeHtml(note)}</p></div></div>
      <section class="finding"><h3>AI finding / extracted details</h3><p>${escapeHtml(getAiSummary(capture.extracted_data, capture.ai_summary))}</p>
      ${fields.length > 0 ? `<dl>${fields.map((field) => `<div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(field.value)}</dd></div>`).join('')}</dl>` : '<p>Structured extraction pending.</p>'}</section>
    </article>`
  }).join('')

  const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(session.title)} report</title>
  <style>${REPORT_STYLES}</style></head><body><main class="report"><div class="toolbar"><button onclick="window.print()">Download / print PDF</button></div><header class="header"><p class="eyebrow">Session report</p><h1>${escapeHtml(session.title)}</h1><p>${escapeHtml(organizationName)}</p><p class="meta">${escapeHtml(session.session_type)} · ${escapeHtml(assetDetails || 'No asset details')} · ${escapeHtml(new Date().toLocaleDateString())}</p></header>${itemsHtml || '<section class="item"><h2>No report evidence selected.</h2></section>'}${buildSignaturesHtml(reportSignatures, signatureUrls)}</main></body></html>`

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
