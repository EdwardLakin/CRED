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

const FORM_SECTION_KEYWORDS = [
  'customer', 'contact', 'unit', 'equipment', 'vehicle', 'asset', 'travel', 'work', 'repair', 'complaint',
  'cause', 'correction', 'time', 'labour', 'labor', 'charge', 'misc', 'acceptance', 'signature', 'header',
]
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

export function getExtractionFields(extractedData: Json | null): Record<string, unknown> {
  if (!isRecord(extractedData) || !isRecord(extractedData.extraction) || !isRecord(extractedData.extraction.fields)) return {}
  return extractedData.extraction.fields
}

export function isFormReferenceCapture(capture: CaptureLike, index = 0) {
  const data = isRecord(capture.extracted_data) ? capture.extracted_data : {}
  if (isRecord(data.source_document)) return true
  if (capture.media_kind === 'document') return true
  const fields = getExtractionFields(capture.extracted_data)
  const fieldKeys = Object.keys(fields)
  const hasFormTerms = FORM_SECTION_KEYWORDS.some((keyword) => `${capture.ocr_text ?? ''} ${capture.ai_summary ?? ''}`.toLowerCase().includes(keyword))
  return index === 0 && fieldKeys.length >= 4 && hasFormTerms
}

export function fieldRowsFromCapture(capture: CaptureLike): NormalizedFormField[] {
  return Object.entries(getExtractionFields(capture.extracted_data))
    .map(([key, value]) => ({ key, label: labelize(key), value: clean(value), source_capture_id: capture.id }))
    .filter((field) => field.value)
    .slice(0, 40)
}

function inferSectionTitle(key: string) {
  const lower = key.toLowerCase()
  if (/customer|contact/.test(lower)) return 'Customer / contact information'
  if (/unit|equipment|vehicle|asset|vin|serial|model|odometer|hour/.test(lower)) return 'Unit / equipment information'
  if (/travel|mileage|kilometer|odometer/.test(lower)) return 'Travel'
  if (/complaint/.test(lower)) return 'Complaint'
  if (/cause|failure/.test(lower)) return 'Cause of failure'
  if (/correction|repair|work|technician/.test(lower)) return 'Work required and repairs performed'
  if (/time|hour|labou?r/.test(lower)) return 'Time card'
  if (/charge|parts|misc|total|tax/.test(lower)) return 'Miscellaneous and charges'
  if (/sign|accept/.test(lower)) return 'Acceptance / signature'
  return 'Field Order header'
}

export function deriveFormSectionsFromCaptures(captures: CaptureLike[]): NormalizedReportSection[] {
  const formCaptures = captures.filter((capture, index) => isFormReferenceCapture(capture, index))
  if (formCaptures.length === 0) return []
  const buckets = new Map<string, NormalizedFormField[]>()
  for (const capture of formCaptures) {
    for (const field of fieldRowsFromCapture(capture)) {
      const title = inferSectionTitle(field.key)
      buckets.set(title, [...(buckets.get(title) ?? []), field])
    }
  }
  return Array.from(buckets.entries()).map(([title, fields], index) => ({
    key: title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `form_section_${index + 1}`,
    title,
    body: null,
    fields,
    source_capture_ids: Array.from(new Set(fields.flatMap((field) => field.source_capture_id ? [field.source_capture_id] : []))),
    related_capture_ids: [],
    source_field_group: title,
  }))
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
      fields: fields.flatMap((field): NormalizedFormField[] => isRecord(field) ? [{ key: clean(field.key, 80) || clean(field.label, 80), label: clean(field.label, 120) || labelize(clean(field.key, 80)), value: clean(field.value), source_capture_id: clean(field.source_capture_id, 80) || undefined }] : []),
      source_capture_ids: sourceIds,
      related_capture_ids: Array.from(new Set([...sourceIds, ...related])),
      source_field_group: clean(meta.source_field_group, 120) || undefined,
    }
  })
}

export function buildEvidenceGroups(captures: CaptureLike[], sections: DraftSectionLike[] = []): EvidenceGroup[] {
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
