import type { Json } from '@/lib/supabase/database.types'

type CaptureLike = {
  id: string
  type: string | null
  media_kind: string | null
  ai_summary?: string | null
  ocr_text?: string | null
  technician_note?: string | null
  transcript?: string | null
  extracted_data: Json | null
}

type DraftSectionLike = {
  id?: string
  section_key: string
  title: string
  body: string | null
  source_capture_ids?: string[] | null
  metadata: Json
  sort_order: number
}

export type NormalizedFormField = {
  key: string
  label: string
  value: string
  source_capture_id?: string
}

export type NormalizedReportSection = {
  key: string
  title: string
  body: string | null
  fields: NormalizedFormField[]
  source_capture_ids: string[]
  related_capture_ids: string[]
  source_field_group?: string
}

export type EvidenceDetail = {
  label: string
  value: string
}

export type EvidenceGroup = {
  capture_id: string
  details: EvidenceDetail[]
  findings: string[]
  recommendations: string[]
}

type StructuredReportItem = {
  source_capture_id?: string
  label?: string
  component?: string
  location?: string
  value?: string
  unit?: string
  status?: string
  title?: string
  condition?: string
  severity?: string
  recommendation?: string
  notes?: string
}

export type FormStructureSummary = {
  isFormStructured: boolean
  sourceCaptureIds: string[]
  guidance: string[]
}

const FORM_SECTION_KEYWORDS = [
  'customer', 'contact', 'unit', 'equipment', 'vehicle', 'asset', 'travel', 'work', 'repair', 'complaint',
  'cause', 'correction', 'time', 'labour', 'labor', 'charge', 'misc', 'acceptance', 'signature', 'header',
  'inspection', 'checklist', 'technician', 'date', 'vin', 'serial', 'model', 'odometer', 'hours', 'mileage',
]
const FORM_LAYOUT_TERMS = ['name', 'date', 'signature', 'yes', 'no', 'pass', 'fail', 'n/a', 'remarks', 'notes', 'description']
const FORM_FIELD_LABELS: Record<string, string> = {
  vin: 'VIN', unit_number: 'Unit number', asset_label: 'Asset', odometer: 'Odometer', hour_meter: 'Hour meter',
  customer_name: 'Customer', work_order_number: 'Work order', purchase_order_number: 'PO number',
  complaint: 'Complaint', cause_of_failure: 'Cause of failure', correction: 'Correction', technician_notes: 'Technician notes',
  recommendation: 'Recommendation', recommendations: 'Recommendations', condition: 'Condition', measurement: 'Measurement',
  severity: 'Status', location: 'Location', component: 'Component', date: 'Date', model: 'Model', serial_number: 'Serial number',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clean(value: unknown, max = 600) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

function labelize(key: string) {
  return FORM_FIELD_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function slug(value: string, fallback: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || fallback
}

export function getExtractionFields(extractedData: Json | null): Record<string, unknown> {
  if (!isRecord(extractedData) || !isRecord(extractedData.extraction) || !isRecord(extractedData.extraction.fields)) return {}
  return extractedData.extraction.fields
}

function textForCapture(capture: CaptureLike) {
  return `${capture.ocr_text ?? ''} ${capture.ai_summary ?? ''} ${capture.technician_note ?? ''}`.toLowerCase()
}

function getSourceDocumentFields(capture: CaptureLike) {
  const data = isRecord(capture.extracted_data) ? capture.extracted_data : {}
  const sourceDocument = isRecord(data.source_document) ? data.source_document : null
  const sections = Array.isArray(sourceDocument?.sections) ? sourceDocument.sections : []
  const fields = Array.isArray(sourceDocument?.fields) ? sourceDocument.fields : []
  return { sourceDocument, sections, fields }
}

export function scoreFormReferenceCapture(capture: CaptureLike, index = 0) {
  const text = textForCapture(capture)
  const fieldKeys = Object.keys(getExtractionFields(capture.extracted_data))
  const { sourceDocument, sections, fields } = getSourceDocumentFields(capture)
  const keywordHits = FORM_SECTION_KEYWORDS.filter((keyword) => text.includes(keyword)).length
  const layoutHits = FORM_LAYOUT_TERMS.filter((term) => text.includes(term)).length
  let score = 0
  if (sourceDocument) score += 5
  if (capture.media_kind === 'document') score += 4
  if (index === 0) score += 2
  if (/form|sheet|checklist|inspection|work order|field service|report/.test(text)) score += 3
  score += Math.min(fieldKeys.length, 8) * 0.7
  score += Math.min(sections.length + fields.length, 8) * 0.8
  score += Math.min(keywordHits, 8) * 0.8
  score += Math.min(layoutHits, 5) * 0.4
  if (capture.media_kind === 'image' && keywordHits >= 2 && (fieldKeys.length >= 2 || layoutHits >= 2)) score += 2
  if (/photo of|damage|leak|rust|broken|vehicle exterior|equipment photo/.test(text) && keywordHits < 2 && fieldKeys.length < 3) score -= 3
  return score
}

export function isFormReferenceCapture(capture: CaptureLike, index = 0) {
  return scoreFormReferenceCapture(capture, index) >= (index === 0 ? 4.2 : 5.2)
}

export function selectPrimaryFormCaptures(captures: CaptureLike[]) {
  const scored = captures
    .map((capture, index) => ({ capture, index, score: scoreFormReferenceCapture(capture, index) }))
    .filter((item) => item.score >= (item.index === 0 ? 4.2 : 5.2))
    .sort((a, b) => a.index - b.index || b.score - a.score)
  if (scored.length === 0) return []
  const primary = scored[0]
  return [primary.capture, ...scored.filter((item) => item.index !== primary.index && item.score > primary.score + 2).map((item) => item.capture)].slice(0, 2)
}

export function fieldRowsFromCapture(capture: CaptureLike): NormalizedFormField[] {
  return Object.entries(getExtractionFields(capture.extracted_data))
    .map(([key, value]) => ({ key, label: labelize(key), value: clean(value), source_capture_id: capture.id }))
    .filter((field) => field.value)
    .slice(0, 40)
}


function normalizeStructuredItems(value: Json | null | undefined): StructuredReportItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): StructuredReportItem[] => {
    if (!isRecord(item)) return []
    return [{
      source_capture_id: clean(item.source_capture_id, 120) || undefined,
      label: clean(item.label, 160) || undefined,
      component: clean(item.component, 160) || undefined,
      location: clean(item.location, 160) || undefined,
      value: clean(item.value, 160) || undefined,
      unit: clean(item.unit, 80) || undefined,
      status: clean(item.status, 160) || undefined,
      title: clean(item.title, 180) || undefined,
      condition: clean(item.condition, 1000) || undefined,
      severity: clean(item.severity, 160) || undefined,
      recommendation: clean(item.recommendation, 1000) || undefined,
      notes: clean(item.notes, 1000) || undefined,
    }]
  })
}

function formatMeasurement(item: StructuredReportItem) {
  const subject = [item.label, item.component, item.location].filter(Boolean).join(' — ') || 'Measurement'
  const measuredValue = [item.value, item.unit].filter(Boolean).join(' ')
  const supporting = [measuredValue, item.status, item.notes].filter(Boolean).join(' · ')
  return supporting ? `${subject}: ${supporting}` : subject
}

function formatFinding(item: StructuredReportItem) {
  const title = [item.title, item.component, item.location].filter(Boolean).join(' — ') || 'Observed condition'
  const details = [item.condition, item.severity, item.notes].filter(Boolean).join(' · ')
  return details ? `${title}: ${details}` : title
}

function labelRowsFromText(capture: CaptureLike): NormalizedFormField[] {
  const labels = Array.from(new Set((capture.ocr_text ?? '').split(/\n| {2,}|\t|\|/)
    .map((part) => clean(part.replace(/[:_\-–—]+$/g, ''), 80))
    .filter((part) => part.length >= 3 && part.length <= 60 && /[a-z]/i.test(part) && FORM_SECTION_KEYWORDS.some((keyword) => part.toLowerCase().includes(keyword)))))
  return labels.slice(0, 18).map((label, index) => ({ key: slug(label, `label_${index + 1}`), label, value: 'Not captured', source_capture_id: capture.id }))
}

function inferSectionTitle(key: string) {
  const lower = key.toLowerCase()
  if (/customer|contact|client|owner/.test(lower)) return 'Customer / contact information'
  if (/unit|equipment|vehicle|asset|vin|serial|model|odometer|hour|plate|license|licence/.test(lower)) return 'Unit / equipment information'
  if (/inspection|checklist|condition|pass|fail|defect/.test(lower)) return 'Inspection details'
  if (/travel|mileage|kilometer|odometer/.test(lower)) return 'Travel'
  if (/complaint|concern|request/.test(lower)) return 'Complaint'
  if (/cause|failure/.test(lower)) return 'Cause of failure'
  if (/correction|repair|work|technician|note/.test(lower)) return 'Work required and repairs performed'
  if (/time|hour|labou?r/.test(lower)) return 'Time card'
  if (/charge|parts|misc|total|tax|price|amount/.test(lower)) return 'Miscellaneous and charges'
  if (/sign|accept|authorization|approval/.test(lower)) return 'Acceptance / signature'
  return 'Report details'
}

export function deriveFormSectionsFromCaptures(captures: CaptureLike[]): NormalizedReportSection[] {
  const formCaptures = selectPrimaryFormCaptures(captures)
  if (formCaptures.length === 0) return []
  const buckets = new Map<string, NormalizedFormField[]>()
  for (const capture of formCaptures) {
    const rows = fieldRowsFromCapture(capture)
    const fallbackRows = rows.length > 0 ? [] : labelRowsFromText(capture)
    for (const field of [...rows, ...fallbackRows]) {
      const title = inferSectionTitle(`${field.key} ${field.label}`)
      buckets.set(title, [...(buckets.get(title) ?? []), field])
    }
  }
  return Array.from(buckets.entries()).map(([title, fields], index) => ({
    key: slug(title, `form_section_${index + 1}`),
    title,
    body: null,
    fields,
    source_capture_ids: Array.from(new Set(fields.flatMap((field) => field.source_capture_id ? [field.source_capture_id] : []))),
    related_capture_ids: [],
    source_field_group: title,
  })).slice(0, 10)
}

export function normalizeDraftSections(sections: DraftSectionLike[], captures: CaptureLike[]): NormalizedReportSection[] {
  const captureIds = new Set(captures.map((capture) => capture.id))
  return sections.map((section) => {
    const meta = isRecord(section.metadata) ? section.metadata : {}
    const fields = Array.isArray(meta.fields) ? meta.fields : []
    const sourceIds = (section.source_capture_ids ?? []).filter((id) => captureIds.has(id))
    const related = Array.isArray(meta.related_capture_ids) ? meta.related_capture_ids.filter((id): id is string => typeof id === 'string' && captureIds.has(id)) : []
    return {
      key: section.section_key,
      title: section.title,
      body: section.body,
      fields: fields.flatMap((field): NormalizedFormField[] => isRecord(field) ? [{ key: clean(field.key, 80) || clean(field.label, 80), label: clean(field.label, 120) || labelize(clean(field.key, 80)), value: clean(field.value) || 'Not captured', source_capture_id: clean(field.source_capture_id, 80) || undefined }] : []),
      source_capture_ids: sourceIds,
      related_capture_ids: Array.from(new Set([...sourceIds, ...related])),
      source_field_group: clean(meta.source_field_group, 120) || undefined,
    }
  })
}

export function buildEvidenceGroups(captures: CaptureLike[], sections: DraftSectionLike[] = [], measurements: Json | null = [], findings: Json | null = []): EvidenceGroup[] {
  const groups = new Map(captures.map((capture) => [capture.id, { capture_id: capture.id, details: [] as EvidenceDetail[], findings: [] as string[], recommendations: [] as string[] }]))
  for (const capture of captures) {
    const group = groups.get(capture.id)
    if (!group) continue
    const note = clean(capture.technician_note || capture.transcript, 1200)
    if (note) group.details.push({ label: capture.transcript ? 'Transcript' : 'Technician note', value: note })
    const summary = clean(capture.ai_summary, 800)
    if (summary) group.details.push({ label: 'Observed condition', value: summary })
    for (const field of fieldRowsFromCapture(capture).slice(0, 8)) group.details.push({ label: labelize(field.key), value: field.value })
  }
  normalizeStructuredItems(measurements).forEach((measurement) => {
    const id = measurement.source_capture_id
    const group = id ? groups.get(id) : undefined
    if (!group) return
    group.details.push({ label: 'Measurement', value: formatMeasurement(measurement) })
  })
  normalizeStructuredItems(findings).forEach((finding) => {
    const id = finding.source_capture_id
    const group = id ? groups.get(id) : undefined
    if (!group) return
    group.findings.push(formatFinding(finding))
    if (finding.recommendation) group.recommendations.push(finding.recommendation)
  })

  for (const section of sections) {
    const titleAndBody = `${section.title} ${section.body ?? ''}`
    const isRecommendation = /recommend|replace|repair|correct/i.test(titleAndBody)
    for (const id of section.source_capture_ids ?? []) {
      const group = groups.get(id)
      if (!group || !section.body) continue
      if (isRecommendation) group.recommendations.push(section.body)
      else group.findings.push(section.body)
    }
  }
  return Array.from(groups.values())
}


export function buildUnattachedStructuredDetails(captures: CaptureLike[], measurements: Json | null = [], findings: Json | null = []): EvidenceDetail[] {
  const captureIds = new Set(captures.map((capture) => capture.id))
  const details: EvidenceDetail[] = []
  for (const measurement of normalizeStructuredItems(measurements)) {
    if (measurement.source_capture_id && captureIds.has(measurement.source_capture_id)) continue
    details.push({ label: 'Measurement', value: formatMeasurement(measurement) })
  }
  for (const finding of normalizeStructuredItems(findings)) {
    if (finding.source_capture_id && captureIds.has(finding.source_capture_id)) continue
    details.push({ label: 'Observed condition', value: formatFinding(finding) })
    if (finding.recommendation) details.push({ label: 'Recommendation', value: finding.recommendation })
  }
  return details
}

export function getFormStructureSummary(reportStructure: Json | null, sections: NormalizedReportSection[]): FormStructureSummary {
  const structure = isRecord(reportStructure) ? reportStructure : {}
  const sourceCaptureIds = Array.from(new Set(sections.flatMap((section) => section.source_capture_ids)))
  const hasFormFields = sections.some((section) => section.fields.length > 0 || Boolean(section.source_field_group))
  const isFormStructured = structure.mode === 'form_structured' || hasFormFields
  return {
    isFormStructured,
    sourceCaptureIds,
    guidance: isFormStructured ? getCaptureGuidance(sections) : [],
  }
}

export function getCaptureGuidance(sections: NormalizedReportSection[]) {
  const fieldText = sections.flatMap((section) => section.fields).map((field) => `${field.key} ${field.label} ${field.value}`.toLowerCase())
  const hasValue = (pattern: RegExp) => fieldText.some((value) => pattern.test(value) && !/not captured|pending|unknown/.test(value))
  const suggestions = []
  if (!hasValue(/customer|client|owner/)) suggestions.push('Capture customer name')
  if (!hasValue(/unit|asset|vehicle|vin|serial|model|plate/)) suggestions.push('Capture unit number')
  suggestions.push('Add finding photo')
  suggestions.push('Add technician note')
  return suggestions.slice(0, 4)
}
