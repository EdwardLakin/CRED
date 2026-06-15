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


const HEADER_FIELD_ALIASES = {
  customer: ['customer', 'customer_name', 'client', 'client_name', 'company', 'company_name', 'contact', 'owner'],
  customer_contact: ['customer_contact', 'contact', 'contact_name', 'phone', 'email'],
  work_order: ['work_order', 'work_order_number', 'repair_order', 'ro_number'],
  po_number: ['po', 'po_number', 'purchase_order', 'purchase_order_number', 'purchase order'],
  unit_number: ['unit', 'unit_number', 'unit_id', 'asset_id'],
  asset: ['asset', 'asset_label', 'equipment', 'equipment_name', 'vehicle'],
  make: ['make', 'manufacturer'],
  model: ['model'],
  serial: ['serial', 'serial_number'],
  vin: ['vin', 'vehicle_identification_number'],
  licence_plate: ['plate', 'licence_plate', 'license_plate', 'licence_number', 'license_number', 'plate_number'],
  odometer: ['odometer', 'mileage', 'kilometres', 'kilometers', 'miles'],
  hours: ['hours', 'hour_meter', 'engine_hours'],
} as const

type HeaderFieldKey = keyof typeof HEADER_FIELD_ALIASES

const HEADER_FIELD_LABELS: Record<HeaderFieldKey, string> = {
  customer: 'Customer', customer_contact: 'Customer contact', work_order: 'Work order number', po_number: 'PO number',
  unit_number: 'Unit number', asset: 'Equipment / asset name', make: 'Make', model: 'Model', serial: 'Serial number', vin: 'VIN',
  licence_plate: 'Licence plate', odometer: 'Odometer', hours: 'Hours',
}

function normalizeAliasText(value: string) {
  return value.toLowerCase().replace(/#/g, ' number ').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export function normalizeCanonicalReportField(label: string): HeaderFieldKey | null {
  const normalized = normalizeAliasText(label)
  for (const [field, aliases] of Object.entries(HEADER_FIELD_ALIASES) as Array<[HeaderFieldKey, readonly string[]]>) {
    if (aliases.some((alias) => {
      const normalizedAlias = normalizeAliasText(alias)
      return normalized === normalizedAlias || normalized.includes(`_${normalizedAlias}`) || normalized.includes(`${normalizedAlias}_`)
    })) return field
  }
  return null
}

function looksLikeFindingValue(value: string) {
  const normalized = normalizeForMatch(value)
  if (!normalized) return true
  if (/\b(corrosion present|recommend|recommended|replace|repair|requires|required|inspect|inspection|condition|finding|observed|severity|fail|failed|pass|passed|worn|wear|leak|crack|broken|damage|rust|loose|missing|defect|unsafe|attention)\b/i.test(value)) return true
  return /[.!?]/.test(value) && value.split(/\s+/).length > 4
}

function isVinLike(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-HJ-NPR-Z0-9]{11,17}$/.test(compact)
}

function isPlateLike(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z0-9]{2,10}$/.test(compact)
}

function isNumericReading(value: string) {
  return /^\d{1,7}(?:[,.]\d{1,2})?\s*(?:km|kilometres|kilometers|mi|miles|hrs?|hours?)?$/i.test(value.trim())
}

export function isValidHeaderFieldValue(fieldKey: HeaderFieldKey, label: string, value: string) {
  const cleaned = clean(value, 300)
  if (!cleaned || /^(not captured|pending|unknown|n\/a)$/i.test(cleaned)) return false
  const labelKey = normalizeCanonicalReportField(label)
  if (labelKey !== fieldKey) return false
  if (looksLikeFindingValue(cleaned)) return false
  if (fieldKey === 'vin') return isVinLike(cleaned) || /\bvin\b/i.test(label)
  if (fieldKey === 'licence_plate') return isPlateLike(cleaned) && /plate|licen[cs]e/i.test(label)
  if (fieldKey === 'odometer' || fieldKey === 'hours') return isNumericReading(cleaned)
  return true
}

export function classifyReferenceDocumentTitle(capture: CaptureLike) {
  if (!isDocumentCapture(capture) || isNoteCapture(capture)) return 'Reference Document'
  const text = documentTextForCapture(capture)
  if (/work[_\s-]?order|repair[_\s-]?order|\bro\s*(?:number|#)?\b/.test(text)) return 'Work Order'
  if (/licen[cs]e\s*plate|plate\s*(?:number|#)|registration plate/.test(text)) return 'Licence Plate'
  if (/\bvin\b|manufacturer|data[_\s-]?plate|info[_\s-]?plate|serial plate/.test(text)) return 'VIN / Manufacturer Plate'
  if (/registration/.test(text)) return 'Registration'
  if (/compliance|certificate|certification/.test(text)) return 'Compliance Document'
  if (/manual|manufacturer|specification/.test(text)) return 'Manufacturer Document'
  if (/form|sheet|checklist/.test(text)) return 'Captured Form'
  return 'Reference Document'
}

export function hasMeaningfulSectionContent(values: Array<string | null | undefined>) {
  return values.some((value) => {
    const cleaned = clean(value, 1000)
    return cleaned && !/^(not captured|pending|unknown|no .* captured|standalone text and voice notes\.?|work orders, plates, forms, and documents captured for context\.?)$/i.test(cleaned)
  })
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
  severity: 'Severity', location: 'Location', component: 'Component', date: 'Date', model: 'Model', serial_number: 'Serial number',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function stripConfidenceText(value: string) {
  return value
    .replace(/\s*\(\s*\d{1,3}%\s+confidence\s*\)\s*/gi, ' ')
    .replace(/\b(?:confidence|extracted|classification|OCR|AI draft|processing|workflow|template)\b:?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function clean(value: unknown, max = 600) {
  return typeof value === 'string' ? stripConfidenceText(value.replace(/\s+/g, ' ').trim()).slice(0, max) : ''
}

export function normalizeUserFacingLabel(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (/document_type|detected_type|source_document|classification|confidence|ocr|workflow|template/.test(normalized)) return ''
  return FORM_FIELD_LABELS[normalized] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function labelize(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (/^(tech|technician)_notes?$|^notes?$|^caption$/.test(normalized)) return 'Technician note'
  if (/location|position/.test(normalized)) return 'Location'
  if (/severity/.test(normalized)) return 'Severity'
  if (/measurement|reading|value/.test(normalized)) return 'Measurement'
  if (/condition|finding|observed/.test(normalized)) return 'Observed condition'
  if (/recommend/.test(normalized)) return 'Recommendation'
  return normalizeUserFacingLabel(key)
}

function slug(value: string, fallback: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || fallback
}

export function getExtractionFields(extractedData: Json | null): Record<string, unknown> {
  if (!isRecord(extractedData) || !isRecord(extractedData.extraction) || !isRecord(extractedData.extraction.fields)) return {}
  return extractedData.extraction.fields
}

function textForCapture(capture: CaptureLike) {
  return `${capture.ocr_text ?? ''} ${capture.ai_summary ?? ''} ${capture.technician_note ?? ''} ${capture.transcript ?? ''} ${JSON.stringify(capture.extracted_data ?? {})}`.toLowerCase()
}

function documentTextForCapture(capture: CaptureLike) {
  return `${capture.ocr_text ?? ''} ${capture.ai_summary ?? ''} ${JSON.stringify(capture.extracted_data ?? {})}`.toLowerCase()
}

function isNoteCapture(capture: CaptureLike) {
  return capture.type === 'text_note' || capture.media_kind === 'note' || capture.media_kind === 'audio' || capture.type === 'voice_note'
}

function isDocumentCapture(capture: CaptureLike) {
  return capture.media_kind === 'document' || Boolean(capture.ocr_text?.trim()) || Boolean(isRecord(capture.extracted_data) && (isRecord(capture.extracted_data.source_document) || isRecord(capture.extracted_data.extraction)))
}

function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function textClearlyMatchesCapture(text: string, capture: CaptureLike) {
  const source = normalizeForMatch(textForCapture(capture))
  const target = normalizeForMatch(text)
  if (!source || !target) return false
  const targetTerms = Array.from(new Set(target.split(' ').filter((term) => term.length >= 4 && !/^(this|that|with|from|should|recommendation|recommend|replace|repair|condition|observed|general|global)$/.test(term))))
  return targetTerms.some((term) => source.includes(term))
}


const COMPONENT_GROUPS: Record<string, string[]> = {
  brakes: ['brake', 'brakes', 'pad', 'pads', 'rotor'],
  battery: ['battery', 'terminal', 'post', 'corrosion'],
  tires: ['tire', 'tyre', 'tread'],
  wheel: ['wheel', 'bearing'],
  axle: ['axle', 'seal'],
  engine: ['engine', 'coolant', 'oil', 'leak'],
  documentation: ['vin', 'plate', 'license', 'licence', 'work order'],
}

const INTERNAL_DETAIL_LABEL = /^(document type|source document|confidence|classification|ocr|ai summary|transcript status|detected type|workflow|template)$/i

function componentHits(text: string) {
  const normalized = normalizeForMatch(text)
  return Object.entries(COMPONENT_GROUPS)
    .filter(([, terms]) => terms.some((term) => normalized.includes(normalizeForMatch(term))))
    .map(([group]) => group)
}

export function isGlobalRecommendation(text: string) {
  const normalized = normalizeForMatch(text)
  if (!normalized) return false
  const hits = componentHits(normalized).filter((term) => term !== 'documentation')
  if (hits.length >= 2) return true
  return /\b(all|multiple|overall|general|global|complete inspection|entire vehicle|vehicle maintenance|recommended services)\b/i.test(text)
}

export function belongsToCapture(text: string, capture: CaptureLike) {
  const cleanedText = clean(text, 1200)
  if (!cleanedText) return false
  if (isGlobalRecommendation(cleanedText)) return false
  return textClearlyMatchesCapture(cleanedText, capture)
}

export function splitRecommendationByEvidence(text: string, capture: CaptureLike) {
  const cleanedText = clean(text, 1200)
  if (!cleanedText) return ''
  const sentences = cleanedText.split(/(?<=[.!?])\s+|;|\n+/).map((sentence) => clean(sentence, 400)).filter(Boolean)
  const relevant = sentences.filter((sentence) => belongsToCapture(sentence, capture))
  if (relevant.length > 0) return relevant.join(' ')
  return isGlobalRecommendation(cleanedText) ? '' : (belongsToCapture(cleanedText, capture) ? cleanedText : '')
}

export function shouldRenderDetail(label: string, value: string, existingRenderedText: string[] = []) {
  const normalizedLabel = labelize(label)
  const cleanedValue = clean(value, 1200)
  if (!normalizedLabel || !cleanedValue || INTERNAL_DETAIL_LABEL.test(normalizedLabel)) return false
  const normalizedValue = normalizeForMatch(cleanedValue)
  if (!normalizedValue || /^(not captured|pending|unknown)$/i.test(cleanedValue)) return false
  return !existingRenderedText.some((existing) => {
    const normalizedExisting = normalizeForMatch(existing)
    return normalizedExisting === normalizedValue || normalizedExisting.includes(normalizedValue) || normalizedValue.includes(normalizedExisting)
  })
}

export function dedupeEvidenceDetails(details: EvidenceDetail[]) {
  const rendered: string[] = []
  const result: EvidenceDetail[] = []
  for (const detail of details) {
    const label = labelize(detail.label)
    const value = clean(detail.value, 1200)
    if (!shouldRenderDetail(label, value, rendered)) continue
    rendered.push(value)
    result.push({ label, value })
  }
  return result
}

function pushUnique(list: string[], value: string) {
  const cleaned = clean(value, 1200)
  if (!cleaned) return
  if (!list.some((item) => normalizeForMatch(item) === normalizeForMatch(cleaned))) list.push(cleaned)
}

function pushUniqueDetail(list: EvidenceDetail[], detail: EvidenceDetail) {
  const label = labelize(detail.label)
  const value = clean(detail.value, 1200)
  if (!label || !value) return
  if (!list.some((item) => labelize(item.label) === label && normalizeForMatch(item.value) === normalizeForMatch(value))) list.push({ label, value })
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
    .filter((field) => field.label && field.value && !/^work_order$/i.test(field.value))
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
      fields: fields.flatMap((field): NormalizedFormField[] => {
        if (!isRecord(field)) return []
        const key = clean(field.key, 80) || clean(field.label, 80)
        const label = clean(field.label, 120) || labelize(key)
        const value = clean(field.value) || 'Not captured'
        return label ? [{ key, label, value, source_capture_id: clean(field.source_capture_id, 80) || undefined }] : []
      }),
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
    if (note) pushUniqueDetail(group.details, { label: 'Technician note', value: note })
    const summary = clean(capture.ai_summary, 800)
    if (summary) pushUniqueDetail(group.details, { label: 'Observed condition', value: summary })
    for (const field of fieldRowsFromCapture(capture).slice(0, 8)) pushUniqueDetail(group.details, { label: labelize(field.key), value: field.value })
  }
  normalizeStructuredItems(measurements).forEach((measurement) => {
    const id = measurement.source_capture_id
    const group = id ? groups.get(id) : undefined
    if (!group) return
    pushUniqueDetail(group.details, { label: 'Measurement', value: formatMeasurement(measurement) })
  })
  normalizeStructuredItems(findings).forEach((finding) => {
    const id = finding.source_capture_id
    const group = id ? groups.get(id) : undefined
    if (!group) return
    pushUnique(group.findings, formatFinding(finding))
    if (finding.recommendation) {
      const recommendation = splitRecommendationByEvidence(finding.recommendation, captures.find((capture) => capture.id === id) ?? ({ id: id ?? '', type: null, media_kind: null, extracted_data: null } as CaptureLike))
      if (recommendation) pushUnique(group.recommendations, recommendation)
    }
  })

  for (const section of sections) {
    const titleAndBody = `${section.title} ${section.body ?? ''}`
    const isRecommendation = /recommend|replace|repair|correct/i.test(titleAndBody)
    const sectionSourceIds = section.source_capture_ids ?? []
    for (const id of sectionSourceIds) {
      const group = groups.get(id)
      const capture = captures.find((candidate) => candidate.id === id)
      if (!group || !capture || !section.body) continue
      // Draft sections can contain broad/global source_capture_ids. Only attach
      // section copy to a card when it is uniquely sourced or clearly matches
      // that capture's own extracted text, note, transcript, or summary.
      if (sectionSourceIds.length > 1 && !belongsToCapture(titleAndBody, capture)) continue
      if (isRecommendation) {
        const recommendation = splitRecommendationByEvidence(section.body, capture)
        if (recommendation) pushUnique(group.recommendations, recommendation)
      } else if (belongsToCapture(section.body, capture)) pushUnique(group.findings, section.body)
    }
  }
  return Array.from(groups.values()).map((group) => ({ ...group, details: dedupeEvidenceDetails(group.details) }))
}


export function buildUnattachedStructuredDetails(captures: CaptureLike[], measurements: Json | null = [], findings: Json | null = []): EvidenceDetail[] {
  const captureIds = new Set(captures.map((capture) => capture.id))
  const details: EvidenceDetail[] = []
  for (const measurement of normalizeStructuredItems(measurements)) {
    if (measurement.source_capture_id && captureIds.has(measurement.source_capture_id)) continue
    pushUniqueDetail(details, { label: 'Measurement', value: formatMeasurement(measurement) })
  }
  for (const finding of normalizeStructuredItems(findings)) {
    if (finding.source_capture_id && captureIds.has(finding.source_capture_id)) continue
    pushUniqueDetail(details, { label: 'Observed condition', value: formatFinding(finding) })
    if (finding.recommendation) pushUniqueDetail(details, { label: 'Recommendation', value: finding.recommendation })
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


export type EvidencePurpose = 'finding' | 'reference_document' | 'additional_note' | 'supporting_evidence'

export function classifyEvidencePurpose(capture: CaptureLike, group?: EvidenceGroup): EvidencePurpose {
  const text = textForCapture(capture)
  const typeText = `${capture.type ?? ''} ${capture.media_kind ?? ''} ${text}`.toLowerCase()
  if (isNoteCapture(capture)) return 'additional_note'
  if (isDocumentCapture(capture) && /work[_\s-]?order|vin|licen[cs]e|plate|registration|info[_\s-]?plate|data[_\s-]?plate|manufacturer|document|form|sheet/.test(typeText)) {
    return 'reference_document'
  }
  if ((group?.findings.length ?? 0) > 0 || (group?.recommendations.length ?? 0) > 0 || /\b(\d+(?:\.\d+)?\s?(?:mm|in|psi|volt|v)|red|attention|required|corrosion|wear|leak|crack|broken|replace|repair)\b/i.test(typeText)) {
    return 'finding'
  }
  return 'supporting_evidence'
}

export type ReviewEvidenceItem<TCapture = CaptureLike> = {
  capture: TCapture
  group: EvidenceGroup
  purpose: EvidencePurpose
}

export type ReviewDocument<TCapture = CaptureLike> = {
  sections: NormalizedReportSection[]
  findings: ReviewEvidenceItem<TCapture>[]
  referenceDocuments: ReviewEvidenceItem<TCapture>[]
  additionalNotes: ReviewEvidenceItem<TCapture>[]
  supportingEvidence: ReviewEvidenceItem<TCapture>[]
  renderedCaptureIds: string[]
  unattachedDetails: EvidenceDetail[]
}

export function buildNonDuplicatedReviewDocument<TCapture extends CaptureLike>({
  captures,
  sections,
  draftSections = [],
  measurements = [],
  findings = [],
}: {
  captures: TCapture[]
  sections: NormalizedReportSection[]
  draftSections?: DraftSectionLike[]
  measurements?: Json | null
  findings?: Json | null
}): ReviewDocument<TCapture> {
  const groups = buildEvidenceGroups(captures, draftSections, measurements, findings)
  const groupsById = new Map(groups.map((group) => [group.capture_id, group]))
  const rendered = new Set<string>()
  const result: ReviewDocument<TCapture> = { sections, findings: [], referenceDocuments: [], additionalNotes: [], supportingEvidence: [], renderedCaptureIds: [], unattachedDetails: buildUnattachedStructuredDetails(captures, measurements, findings) }
  for (const section of draftSections) {
    if (!section.body) continue
    const sourceIds = section.source_capture_ids ?? []
    const matchingCaptures = sourceIds
      .map((id) => captures.find((capture) => capture.id === id))
      .filter((capture): capture is TCapture => Boolean(capture))
      .filter((capture) => belongsToCapture(`${section.title} ${section.body ?? ''}`, capture))
    if (sourceIds.length <= 1 || matchingCaptures.length > 0) continue
    if (/recommend|replace|repair|correct/i.test(`${section.title} ${section.body}`)) continue
    pushUniqueDetail(result.unattachedDetails, {
      label: /recommend|replace|repair|correct/i.test(`${section.title} ${section.body}`) ? 'Recommendation' : 'Observed condition',
      value: section.body,
    })
  }
  for (const capture of captures) {
    if (rendered.has(capture.id)) continue
    const group = groupsById.get(capture.id) ?? { capture_id: capture.id, details: [], findings: [], recommendations: [] }
    const item = { capture, group, purpose: classifyEvidencePurpose(capture, group) }
    if (item.purpose === 'finding') result.findings.push(item)
    else if (item.purpose === 'reference_document') result.referenceDocuments.push(item)
    else if (item.purpose === 'additional_note') result.additionalNotes.push(item)
    else result.supportingEvidence.push(item)
    rendered.add(capture.id)
    result.renderedCaptureIds.push(capture.id)
  }
  return result
}


export function splitRecommendationText(value: string) {
  const cleaned = clean(value, 1600)
  if (!cleaned) return []
  const parts = cleaned
    .replace(/\s*(?:^|\n)\s*\d+[.)]\s+/g, '\n')
    .split(/\n+|;|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((item) => clean(item.replace(/^[-*•]\s*/, ''), 500))
    .filter(Boolean)
  const source = parts.length > 1 ? parts : [cleaned]
  const seen = new Set<string>()
  return source.filter((item) => {
    const key = normalizeForMatch(item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}


export function buildCustomerAssetRows(sections: NormalizedReportSection[], session: Record<string, unknown> = {}) {
  const rows: EvidenceDetail[] = []
  const source = sections.flatMap((section) => section.fields)
  const sessionAliases: Partial<Record<HeaderFieldKey, string[]>> = {
    customer: ['customer_name'], unit_number: ['unit_number'], asset: ['asset_label'], vin: ['vin'], odometer: ['odometer'],
  }
  for (const fieldKey of Object.keys(HEADER_FIELD_ALIASES) as HeaderFieldKey[]) {
    const sessionValue = (sessionAliases[fieldKey] ?? [])
      .map((key) => session[key])
      .find((value) => typeof value === 'string' && value.trim())
    const matchedField = source.find((item) => isValidHeaderFieldValue(fieldKey, `${item.key} ${item.label}`, item.value))
    const label = HEADER_FIELD_LABELS[fieldKey]
    const candidateValue = clean(sessionValue || matchedField?.value, 300)
    const candidateLabel = sessionValue ? (HEADER_FIELD_ALIASES[fieldKey][0] ?? fieldKey) : `${matchedField?.key ?? ''} ${matchedField?.label ?? ''}`
    if (isValidHeaderFieldValue(fieldKey, candidateLabel, candidateValue) || (sessionValue && !looksLikeFindingValue(candidateValue))) {
      pushUniqueDetail(rows, { label, value: candidateValue })
    }
  }
  return rows
}

export function isCustomerAssetSection(section: NormalizedReportSection) {
  return /customer|contact|unit|equipment|vehicle|asset|vin|serial|model|odometer|hour|plate|license|licence/i.test(`${section.key} ${section.title}`)
}
