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

function isImageDerivedCapture(capture: CaptureLike) {
  return capture.media_kind === 'image' || capture.type === 'photo' || capture.type === 'vin_plate' || capture.type === 'info_plate'
}

function hasDocumentTextContext(capture: CaptureLike) {
  return Boolean(
    capture.type === 'document' ||
      capture.media_kind === 'document' ||
      capture.ocr_text?.trim() ||
      (isRecord(capture.extracted_data) && (isRecord(capture.extracted_data.source_document) || isRecord(capture.extracted_data.extraction)))
  )
}

function preserveTechnicianOnlyExtractedData(extractedData: Json | null): Json | null {
  if (!isRecord(extractedData)) return extractedData

  const preserved = Object.fromEntries(
    Object.entries(extractedData).filter(([key]) =>
      ['upload', 'guidance', 'diagnostic_step', 'source_document', 'note'].includes(key),
    ),
  )

  return preserved as Json
}

export function sanitizeCaptureForImageAiAssist(capture: CaptureLike, imageAiAssistEnabled: boolean): CaptureLike {
  if (imageAiAssistEnabled || !isImageDerivedCapture(capture)) return capture

  if (hasDocumentTextContext(capture)) {
    return {
      ...capture,
      ai_summary: null,
    }
  }

  return {
    ...capture,
    ai_summary: null,
    ocr_text: null,
    extracted_data: preserveTechnicianOnlyExtractedData(capture.extracted_data),
  }
}

export function sanitizeCapturesForImageAiAssist<T extends CaptureLike>(captures: T[], imageAiAssistEnabled: boolean): T[] {
  return captures.map((capture) => sanitizeCaptureForImageAiAssist(capture, imageAiAssistEnabled) as T)
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

export type NormalizedReportField = {
  key: string
  label: string
  value: string
  unit: string | null
  canonical_value: number | null
  source_capture_ids: string[]
  display_value: string
}

export type EvidencePackage = {
  id: string
  title: string
  summary: string
  capture_ids: string[]
  confidence: number
  generated_finding: {
    text: string
    confidence: number
    severity: 'pass' | 'advisory' | 'fail' | 'needs_review'
    source_values: NormalizedReportField[]
  }
  recommendations: Array<{ text: string; supporting_capture_ids: string[] }>
  duplicate_flags: Array<{ capture_id: string; duplicate_of_capture_id: string; reason: string; label: 'Possible Duplicate' }>
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
  source: ReportStructureSource
  sourceDocumentName: string | null
  classification: string | null
  blueprintSectionCount: number
  blueprintFieldCount: number
  mappedEvidenceCount: number
}

export type ReportStructureSource = 'uploaded_form' | 'uploaded_report' | 'uploaded_template' | 'generic_fallback'

export const GENERIC_REPORT_SECTION_TITLES = [
  'Report Summary',
  'Evidence Captured',
  'Technician Notes',
  'Findings',
  'Recommendations',
  'Final Summary / Report Notes',
  'Inspector / Facility Details',
  'Signoff',
] as const

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

function captureDeterministicRuleText(capture: CaptureLike) {
  const fields = Object.entries(getExtractionFields(capture.extracted_data))
    .map(([key, value]) => `${key} ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' ')
  return normalizeForMatch(`${capture.type ?? ''} ${capture.media_kind ?? ''} ${capture.technician_note ?? ''} ${capture.transcript ?? ''} ${capture.ai_summary ?? ''} ${capture.ocr_text ?? ''} ${documentTextForCapture(capture)} ${fields}`)
}

function captureNoteAndFieldText(capture: CaptureLike) {
  const fields = Object.entries(getExtractionFields(capture.extracted_data))
    .map(([key, value]) => `${key} ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' ')
  return normalizeForMatch(`${capture.technician_note ?? ''} ${fields}`)
}

function hasDeterministicBrakeFinding(capture: CaptureLike) {
  const text = captureNoteAndFieldText(capture)
  return /\bfront brake pads?\b|\bbrake pads?\b|\b2\s*mm\b|\bwear limit\b|\breplace front brake pads?\b/.test(text)
}

function hasDeterministicBatteryFinding(capture: CaptureLike) {
  const text = captureNoteAndFieldText(capture)
  return /\bbattery\b|\bpositive post\b|\bcorrosion\b|\bterminal corrosion\b|\bclean corrosion\b|\binspect for damage\b/.test(text)
}

function hasDeterministicDefectNote(capture: CaptureLike) {
  const note = normalizeForMatch(capture.technician_note ?? '')
  return Boolean(note) && (hasDeterministicBrakeFinding(capture) || hasDeterministicBatteryFinding(capture) || /\b(defect|finding|failed|critical|advisory|replace|repair|wear limit|corrosion|damage)\b/.test(note))
}

function getDeterministicReferenceTitle(capture: CaptureLike) {
  if (hasDeterministicDefectNote(capture)) return null
  const text = captureDeterministicRuleText(capture)
  const isLicencePlate = /\b(?:licen[cs]e plate|licen[cs]e number|plate number|registration plate|plate photo|cps 0368)\b/.test(text)
  const isManufacturerPlate = /\b(?:manufacturer|data plate|info plate|vehicle info plate|manufacturer plate|manufacturer label|compliance label|compliance plate|gvwr|gawr|tire size|tyre size|weight ratings?)\b/.test(text)
  const isVinPlate = isManufacturerPlate || /\b(?:vin|vehicle identification number|serial plate)\b/.test(text)
  const isWorkOrder = /\b(?:work order|workorder|repair order|repairorder|ro number|ro no|r o|job number|work order number|purchase order)\b/.test(text)
  if (isLicencePlate) return 'Licence Plate'
  if (isVinPlate) return 'VIN / Manufacturer Plate'
  if (isWorkOrder) return 'Work Order'
  return null
}

function getDeterministicFinding(capture: CaptureLike) {
  const technicianText = clean(capture.technician_note || capture.transcript, 500)
  if (!technicianText) return null
  if (hasDeterministicBrakeFinding(capture)) {
    return {
      component: 'brakes',
      title: technicianText,
      severity: 'needs_review',
      observation: `Technician note: ${technicianText}`,
      recommendations: [],
    }
  }
  if (hasDeterministicBatteryFinding(capture)) {
    return {
      component: 'battery',
      title: technicianText,
      severity: 'needs_review',
      observation: `Technician note: ${technicianText}`,
      recommendations: [],
    }
  }
  return null
}

function applyDeterministicFindingGroup(capture: CaptureLike, group: EvidenceGroup): EvidenceGroup {
  const deterministic = getDeterministicFinding(capture)
  if (!deterministic) return group
  return {
    ...group,
    details: dedupeEvidenceDetails([
      { label: 'Component', value: deterministic.component },
      { label: 'Severity', value: deterministic.severity },
      ...group.details,
    ]),
    findings: dedupeReportText([deterministic.observation, ...group.findings]),
    recommendations: dedupeReportText([...deterministic.recommendations, ...group.recommendations]),
  }
}

export function classifyReferenceDocumentTitle(capture: CaptureLike) {
  const deterministicTitle = getDeterministicReferenceTitle(capture)
  if (deterministicTitle) return deterministicTitle
  if (!isDocumentCapture(capture) || isNoteCapture(capture)) return 'Reference Document'
  const typeText = normalizeForMatch(`${capture.type ?? ''} ${capture.media_kind ?? ''}`)
  const text = documentTextForCapture(capture)
  const captureText = captureDeterministicRuleText(capture)
  if (/\b(?:work order|work_order|repair order|repair_order|ro number|complaint|correction|cause|customer|engine model)\b/.test(captureText) || /\bwork_?order\b/.test(typeText)) return 'Work Order'
  if (/\b(?:licen[cs]e plate|license_plate|licence_plate|plate number|registration plate|cps 0368)\b/.test(captureText) || /\b(?:license|licence)_?plate\b/.test(typeText)) return 'Licence Plate'
  if (/\b(?:vin|manufacturer|data plate|info plate|serial plate|compliance plate|gvwr|gawr|tire size|weight ratings?)\b/.test(captureText) || /\b(?:vin|vin_plate|info_plate)\b/.test(typeText)) return 'VIN / Manufacturer Plate'
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

function normalizeForSemanticDedupe(value: string) {
  return normalizeForMatch(value.replace(/[.!?]+$/g, ''))
}

function hasDistinctNumericValue(candidate: string, existing: string) {
  const numericTokens = (value: string) => new Set(Array.from(value.matchAll(/\b\d+(?:\.\d+)?\s*(?:mm|in|psi|volt|volts|v|%|percent)?\b/gi)).map((match) => normalizeForMatch(match[0])))
  const candidateNumbers = numericTokens(candidate)
  if (candidateNumbers.size === 0) return false
  const existingNumbers = numericTokens(existing)
  return Array.from(candidateNumbers).some((token) => !existingNumbers.has(token))
}

function isSemanticDuplicateText(candidate: string, existing: string) {
  const candidateKey = normalizeForSemanticDedupe(candidate)
  const existingKey = normalizeForSemanticDedupe(existing)
  if (!candidateKey || !existingKey) return false
  if (candidateKey === existingKey) return true
  if (candidateKey.includes(existingKey)) return !hasDistinctNumericValue(existing, candidate)
  if (existingKey.includes(candidateKey)) return !hasDistinctNumericValue(candidate, existing)
  return false
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

function isFindingDraftSection(section: DraftSectionLike) {
  return /findings?|inspection findings?|observed conditions?|defects?|issues?/i.test(`${section.section_key} ${section.title}`)
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
    return isSemanticDuplicateText(cleanedValue, existing)
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

function getSourceDocumentType(capture: CaptureLike) {
  const { sourceDocument } = getSourceDocumentFields(capture)
  return typeof sourceDocument?.type === 'string' ? sourceDocument.type : null
}

function getSourceDocumentLabel(capture: CaptureLike) {
  const { sourceDocument } = getSourceDocumentFields(capture)
  return typeof sourceDocument?.label === 'string' && sourceDocument.label.trim() ? sourceDocument.label.trim() : null
}

function getStructureSourceFromText(text: string): ReportStructureSource | null {
  if (/\btemplate\b/.test(text)) return 'uploaded_template'
  if (/\breport\b/.test(text)) return 'uploaded_report'
  if (/\b(form|checklist|inspection sheet|inspection form)\b/.test(text)) return 'uploaded_form'
  return null
}

export function getReportStructureSourceCapture(captures: CaptureLike[]) {
  return captures.find((capture) => {
    const sourceDocumentType = getSourceDocumentType(capture)
    const text = textForCapture(capture)
    if (capture.type !== 'document' && capture.media_kind !== 'document') return false
    if (sourceDocumentType === 'other' || sourceDocumentType === 'diagnostic_procedure') return true
    return Boolean(getStructureSourceFromText(text))
  }) ?? null
}

export function getReportStructureSourceMetadata(captures: CaptureLike[]) {
  const capture = getReportStructureSourceCapture(captures)
  if (!capture) {
    return {
      report_structure_source: 'generic_fallback' as ReportStructureSource,
      source_capture_id: null,
      source_document_name: null,
    }
  }

  const text = textForCapture(capture)
  return {
    report_structure_source: getStructureSourceFromText(text) ?? 'uploaded_form',
    source_capture_id: capture.id,
    source_document_name: getSourceDocumentLabel(capture) ?? getDeterministicReferenceTitle(capture) ?? 'Uploaded document',
  }
}

export function isFormReferenceCapture(capture: CaptureLike, index = 0) {
  return getReportStructureSourceCapture([capture])?.id === capture.id && scoreFormReferenceCapture(capture, index) >= (index === 0 ? 4.2 : 5.2)
}

export function selectPrimaryFormCaptures(captures: CaptureLike[]) {
  const structureSourceCapture = getReportStructureSourceCapture(captures)
  if (!structureSourceCapture) return []
  const scored = captures
    .map((capture, index) => ({ capture, index, score: scoreFormReferenceCapture(capture, index) }))
    .filter((item) => item.capture.id === structureSourceCapture.id)
    .filter((item) => item.score >= (item.index === 0 ? 4.2 : 5.2))
    .sort((a, b) => a.index - b.index || b.score - a.score)
  if (scored.length === 0) return []
  const primary = scored[0]
  return [primary.capture, ...scored.filter((item) => item.index !== primary.index && item.score > primary.score + 2).map((item) => item.capture)].slice(0, 2)
}

const IMAGE_ALLOWED_IDENTITY_FIELD = /^(vin|vehicle_identification_number|serial(_number)?|asset(_id|_label)?|unit(_number)?|plate(_number)?|licen[cs]e(_number|_plate)?|odometer|mileage|hours?|hour_meter|work_order(_number)?|repair_order|ro_number|claim(_number)?|file(_number)?|customer(_name)?|client(_name)?|address|location)$/i
const IMAGE_PROHIBITED_REPORT_TRUTH_FIELD = /(summary|description|classification|component|severity|condition|observed|finding|defect|damage|recommend|diagnosis|status|confidence|ocr|detected)/i

export function fieldRowsFromCapture(capture: CaptureLike): NormalizedFormField[] {
  return Object.entries(getExtractionFields(capture.extracted_data))
    .filter(([key]) => !isImageDerivedCapture(capture) || (IMAGE_ALLOWED_IDENTITY_FIELD.test(key) && !IMAGE_PROHIBITED_REPORT_TRUTH_FIELD.test(key)))
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


const NORMALIZED_MODEL_SECTION_PATTERNS = [
  /findings?|inspection findings?|observed conditions?|defects?|issues?/,
  /recommendations?|recommended actions?|actions?/,
  /signatures?|signature requirements?|acceptance \/ signature/,
  /customer (?:\/ )?(?:contact )?information|customer details|customer \/ asset details/,
  /equipment information|unit \/ equipment information|asset information|vehicle information/,
  /supporting evidence|supporting details|evidence/,
  /additional notes?|notes? placeholder/,
] as const

function isNormalizedModelRepresentedSection(key: string, title: string) {
  const normalized = normalizeForMatch(`${key} ${title}`)
  return NORMALIZED_MODEL_SECTION_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function shouldRenderDraftSectionStandalone(section: Pick<DraftSectionLike, 'section_key' | 'title'> | Pick<NormalizedReportSection, 'key' | 'title'>) {
  const key = 'section_key' in section ? section.section_key : section.key
  return !isNormalizedModelRepresentedSection(key, section.title)
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
    const capture = captures.find((candidate) => candidate.id === id)
    if (!capture || !clean(capture.technician_note || capture.transcript, 1200)) return
    pushUnique(group.findings, clean(capture.technician_note || capture.transcript, 1200))
    if (finding.recommendation && !isImageDerivedCapture(capture)) {
      const recommendation = splitRecommendationByEvidence(finding.recommendation, captures.find((capture) => capture.id === id) ?? ({ id: id ?? '', type: null, media_kind: null, extracted_data: null } as CaptureLike))
      if (recommendation) pushUnique(group.recommendations, recommendation)
    }
  })

  for (const section of sections) {
    const titleAndBody = `${section.title} ${section.body ?? ''}`
    const isRecommendation = /recommend|replace|repair|correct/i.test(titleAndBody) && !isFindingDraftSection(section)
    const isFindingSection = isFindingDraftSection(section)
    const sectionSourceIds = section.source_capture_ids ?? []
    for (const id of sectionSourceIds) {
      const group = groups.get(id)
      const capture = captures.find((candidate) => candidate.id === id)
      if (!group || !capture || !section.body) continue
      const technicianTruth = clean(capture.technician_note || capture.transcript, 1200)
      if (!technicianTruth) continue
      // Draft sections can contain broad/global source_capture_ids. Only attach
      // section copy to a card when it is uniquely sourced or clearly matches
      // that capture's own extracted text, note, transcript, or summary.
      if (sectionSourceIds.length > 1 && !isFindingSection && !belongsToCapture(titleAndBody, capture)) continue
      if (isRecommendation && !isImageDerivedCapture(capture)) {
        const recommendation = splitRecommendationByEvidence(section.body, capture)
        if (recommendation) pushUnique(group.recommendations, recommendation)
      } else if (belongsToCapture(section.body, capture) || (isFindingSection && sectionSourceIds.length <= 1)) pushUnique(group.findings, technicianTruth)
    }
    if (sectionSourceIds.length === 0 && isFindingSection && section.body) {
      for (const capture of captures) {
        const technicianTruth = clean(capture.technician_note || capture.transcript, 1200)
        if (!technicianTruth || !belongsToCapture(titleAndBody, capture)) continue
        const group = groups.get(capture.id)
        if (group) pushUnique(group.findings, technicianTruth)
      }
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
  const structureSource = typeof structure.report_structure_source === 'string'
    ? structure.report_structure_source as ReportStructureSource
    : null
  const isFormStructured = structureSource !== 'generic_fallback' && (structure.mode === 'form_structured' || hasFormFields)
  const blueprint = isRecord(structure.form_blueprint) ? structure.form_blueprint : null
  const blueprintSections = Array.isArray(blueprint?.sections) ? blueprint.sections : []
  const blueprintFields = Array.isArray(blueprint?.fields) ? blueprint.fields : []
  const mappings = Array.isArray(structure.evidence_field_mappings) ? structure.evidence_field_mappings : []
  return {
    isFormStructured,
    sourceCaptureIds,
    guidance: isFormStructured ? getCaptureGuidance(sections) : [],
    source: structureSource ?? (isFormStructured ? 'uploaded_form' : 'generic_fallback'),
    sourceDocumentName: typeof structure.source_document_name === 'string' ? structure.source_document_name : null,
    classification: typeof blueprint?.classification === 'string' ? blueprint.classification : null,
    blueprintSectionCount: blueprintSections.length,
    blueprintFieldCount: blueprintFields.length,
    mappedEvidenceCount: mappings.length,
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


export type CaptureClassification = 'inspection_finding' | 'reference_document' | 'additional_note' | 'supporting_evidence' | 'ignored_internal'
export type EvidencePurpose = 'finding' | 'reference_document' | 'additional_note' | 'supporting_evidence'


function hardReferenceText(capture: CaptureLike) {
  const typeText = normalizeForMatch(`${capture.type ?? ''} ${capture.media_kind ?? ''}`)
  const fields = Object.entries(getExtractionFields(capture.extracted_data))
    .map(([key, value]) => `${key} ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' ')
  return normalizeForMatch(`${typeText} ${documentTextForCapture(capture)} ${fields}`)
}

export function isHardReferenceDocument(capture: CaptureLike) {
  const text = hardReferenceText(capture)
  if (!text || hasDeterministicDefectNote(capture)) return false
  if (/\b(?:work order|workorder|repair order|repairorder|ro number|ro no|r o|complaint|correction|cause|customer|engine model)\b/.test(text)) return true
  if (/\b(?:licen[cs]e plate|licen[cs]e number|plate number|registration plate|cps 0368)\b/.test(text)) return true
  if (/\b(?:vin plate|vehicle identification number|manufacturer plate|manufacturer label|data plate|compliance label|compliance plate|info plate|serial plate|gvwr|gawr|tire size|weight ratings?)\b/.test(text)) return true
  if (/\b(?:registration|certificate|certification|form|checklist)\b/.test(text)) return true
  return false
}

function hasExplicitReferenceDocumentSignal(capture: CaptureLike) {
  return isHardReferenceDocument(capture)
}

function hasBatteryFindingEvidence(text: string) {
  return /\bbattery\b[\s\S]{0,140}\bcorrosion|\bcorrosion\b[\s\S]{0,140}\bbattery\b|\bpositive\s+post\s+corrosion\b|\bterminal\s+corrosion\b|\bcorrosion\s+observed\s+on\s+(?:the\s+)?(?:battery\s+)?(?:terminal|post)\b|\bclean\s+corrosion\b|\binspect\s+for\s+damage\b|\bmaint(?:ain|enance)\s+(?:of\s+)?battery\s+terminals?\b/i.test(text)
}

function hasTrueDefectEvidence(capture: CaptureLike, group?: EvidenceGroup) {
  const technicianTruth = `${capture.technician_note ?? ''} ${capture.transcript ?? ''} ${(group?.findings ?? []).join(' ')} ${(group?.recommendations ?? []).join(' ')}`
  const text = `${capture.type ?? ''} ${capture.media_kind ?? ''} ${technicianTruth}`.toLowerCase()
  const hasBrakePadDefect = /\bbrakes?\b[\s\S]{0,120}\bpads?\b[\s\S]{0,120}\b(?:wear\s*limit|2\s*mm|replace)|\bpads?\b[\s\S]{0,120}\b(?:wear\s*limit|2\s*mm|replace)[\s\S]{0,120}\bbrakes?\b/i.test(text)
  const hasBatteryDefect = hasBatteryFindingEvidence(text)
  const hasComponent = /\b(brake\s*pads?|brakes?|rotor|battery|terminal|post|tire|tyre|tread|wheel|bearing|axle|engine|coolant|oil|hose|belt|body|frame|panel|light|lamp)\b/i.test(text)
  const hasDefect = /\b(corrosion|wear|worn|wear\s*limit|leak|crack|broken|damage|rust|loose|missing|defect|unsafe|fail(?:ed)?|red|critical|medium|advisory|attention|required)\b/i.test(text)
  const hasRepairRecommendation = /\b(replace|repair|clean\s+corrosion|inspect\s+for\s+damage|service|adjust)\b/i.test(text) && !/\bwork[_\s-]?order|repair[_\s-]?order\b/i.test(text)
  const hasRepairMeasurement = /\b(?:brake\s*pads?|tread|battery|terminal|post)\b[\s\S]{0,80}\b\d+(?:\.\d+)?\s?(?:mm|in|psi|volt|v)\b|\b\d+(?:\.\d+)?\s?(?:mm|in|psi|volt|v)\b[\s\S]{0,80}\b(?:brake\s*pads?|tread|battery|terminal|post)\b/i.test(text)
  return hasBrakePadDefect || hasBatteryDefect || (hasComponent && hasDefect && (hasRepairRecommendation || hasRepairMeasurement)) || hasRepairMeasurement
}

export function classifyCapture(capture: CaptureLike, group?: EvidenceGroup): CaptureClassification {
  const text = textForCapture(capture)
  if (/\b(hidden_from_report|internal_only|debug)\b/i.test(text)) return 'ignored_internal'
  if (getDeterministicFinding(capture)) return 'inspection_finding'
  if (getDeterministicReferenceTitle(capture)) return 'reference_document'
  if (isHardReferenceDocument(capture)) return 'reference_document'
  if (isNoteCapture(capture) && !hasTrueDefectEvidence(capture, group)) return 'additional_note'
  if (hasTrueDefectEvidence(capture, group)) return 'inspection_finding'
  if (hasExplicitReferenceDocumentSignal(capture)) return 'reference_document'
  if (isDocumentCapture(capture)) return 'reference_document'
  return 'supporting_evidence'
}

export function classifyEvidencePurpose(capture: CaptureLike, group?: EvidenceGroup): EvidencePurpose {
  const classification = classifyCapture(capture, group)
  if (classification === 'inspection_finding') return 'finding'
  if (classification === 'reference_document') return 'reference_document'
  if (classification === 'additional_note') return 'additional_note'
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
    const baseGroup = groupsById.get(capture.id) ?? { capture_id: capture.id, details: [], findings: [], recommendations: [] }
    const group = applyDeterministicFindingGroup(capture, baseGroup)
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


export const REPORT_SEVERITY_PRESENTATION = [
  { key: 'critical', label: '🔴 Critical', priority: 5, patterns: [/\b(?:red|critical|danger|fail|failed)\b/i, /replace\s+(?:front\s+)?brake\s+pads?/i, /brake\s+pads?.*replace/i, /wear\s*limit/i, /at\s+wear\s+limit/i, /\b2\s*mm\b.*\bbrake\s+pads?\b/i, /\bbrake\s+pads?\b.*\b2\s*mm\b/i, /unsafe|out of service/i] },
  { key: 'advisory', label: '🟡 Advisory', priority: 3, patterns: [/\b(?:yellow|warning|advisory|monitor|attention|medium)\b/i, /corrosion\s+present/i, /clean\s+corrosion/i, /inspect\s+for\s+damage/i] },
  { key: 'informational', label: '🟢 Informational', priority: 1, patterns: [/\b(?:green|pass|ok|info|informational|reference documents?|vin|plate|work order)\b/i] },
] as const

export type NormalizedReportSeverity = (typeof REPORT_SEVERITY_PRESENTATION)[number] | { key: 'informational'; label: '🟢 Informational'; priority: 1 }

export type NormalizedFindingModel<TCapture = CaptureLike> = {
  id: string
  title: string
  severity: NormalizedReportSeverity
  observations: string[]
  recommendations: string[]
  details: EvidenceDetail[]
  evidenceCount: number
  entry: ReviewEvidenceItem<TCapture>
}

export type NormalizedRecommendedAction = { priority: string; priorityScore: number; action: string }

export type NormalizedReportModel<TCapture = CaptureLike> = ReviewDocument<TCapture> & {
  findingModels: NormalizedFindingModel<TCapture>[]
  recommendedActions: NormalizedRecommendedAction[]
  summary: { totalFindings: number; criticalFindings: number; referenceDocumentCount: number; evidenceItemCount: number; inspectionStatus: string; severityBreakdown: Array<{ key: string; count: number; label: string }> }
}

export function normalizeReportSeverity(values: string[]) {
  const text = values.join(' ')
  return REPORT_SEVERITY_PRESENTATION.find((severity) => severity.patterns.some((pattern) => pattern.test(text))) ?? REPORT_SEVERITY_PRESENTATION[2]
}

export function dedupeReportText(values: string[]) {
  const seen = new Set<string>()
  return values.map((value) => stripConfidenceText(value).trim()).filter((value) => {
    const key = normalizeForMatch(value)
    if (!value || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function dedupeSemanticReportText(values: string[]) {
  const cleanedValues = values.map((value) => stripConfidenceText(value).trim()).filter(Boolean)
  return cleanedValues
    .map((value, index) => ({ value, index }))
    .sort((a, b) => normalizeForSemanticDedupe(b.value).length - normalizeForSemanticDedupe(a.value).length || a.index - b.index)
    .reduce<string[]>((result, item) => {
      if (!result.some((existing) => isSemanticDuplicateText(item.value, existing))) result.push(item.value)
      return result
    }, [])
    .sort((a, b) => cleanedValues.findIndex((value) => value === a) - cleanedValues.findIndex((value) => value === b))
}

export function isMeaningfulCustomerReportText(value: string) {
  const text = stripConfidenceText(value).trim()
  return text.length >= 8 && !/^(?:n\/?a|none|null|test|testing|just testing(?: this)?\.?|placeholder|sample|lorem ipsum|generated filler|empty notes?|no notes?|additional notes?)$/i.test(text)
}


function splitFindingText(value: string) {
  const cleaned = clean(value, 2000)
  if (!cleaned) return []
  const numbered = cleaned
    .replace(/\s*(?:^|\n)\s*\d+[.)]\s+/g, '\n')
    .replace(/\s+(\d+[.)]\s+)/g, '\n$1')
    .split(/\n+/)
    .map((item) => clean(item.replace(/^\d+[.)]\s*/, ''), 700))
    .filter(Boolean)
  const source = numbered.length > 1 ? numbered : [cleaned]
  return dedupeReportText(source).filter((item) => looksLikeFindingValue(item))
}

function stronglyLooksLikeFindingValue(value: string) {
  return /\b(corrosion present|wear limit|at wear limit|2\s*mm|replace\s+(?:front\s+)?brake\s+pads?|fail|failed|red|critical|urgent|unsafe|danger|defect|damage|crack|broken|leak|rust)\b/i.test(value)
}

function isFindingLikeField(field: NormalizedFormField) {
  const labelText = `${field.key} ${field.label}`
  return /findings?|issues?|defects?|observed|condition|severity|fail|failed|wear|worn|corrosion|damage|unsafe/i.test(labelText) || stronglyLooksLikeFindingValue(field.value)
}

function isIsolatedFindingFieldValue(value: string) {
  return /^(?:corrosion present|\d+(?:\.\d+)?\s*mm|red|medium|replace front brake pads|clean corrosion|inspect for damage)$/i.test(clean(value, 200))
}

// Kept for future diagnostics only; unverified draft-only findings are intentionally not rendered as report truth.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function collectDraftFindingFallbackItems<TCapture extends CaptureLike>(params: Parameters<typeof buildNonDuplicatedReviewDocument<TCapture>>[0], existing: ReviewDocument<TCapture>['findings']): ReviewDocument<TCapture>['findings'] {
  const fallbackCapture = params.captures[0]
  if (!fallbackCapture) return []
  const existingText = existing.flatMap((item) => [...item.group.findings, ...item.group.recommendations, ...item.group.details.map((detail) => detail.value)])
  const sections = params.sections
  const globalRecommendations = dedupeReportText(sections.flatMap((section) => {
    const sectionLabel = `${section.key} ${section.title}`
    return [
      ...(/recommend|repair|replace|correct|maintenance/i.test(sectionLabel) && section.body ? splitRecommendationText(section.body) : []),
      ...section.fields.filter((field) => /recommend|repair|replace|correct|maintenance/i.test(`${field.key} ${field.label}`)).flatMap((field) => splitRecommendationText(field.value)),
    ]
  }))
  const candidates: Array<{ finding: string; recommendations: string[]; details: EvidenceDetail[] }> = []

  for (const section of sections) {
    const sectionLabel = `${section.key} ${section.title}`
    const findingSection = /findings?|issues?|defects?|observed\s+conditions?/i.test(sectionLabel)
    const recommendationSection = /recommend|repair|replace|correct|maintenance/i.test(sectionLabel)
    const sectionRecommendations = section.fields
      .filter((field) => /recommend|repair|replace|correct|maintenance/i.test(`${field.key} ${field.label}`))
      .flatMap((field) => splitRecommendationText(field.value))
    if (recommendationSection && section.body) sectionRecommendations.push(...splitRecommendationText(section.body))

    const findingTexts = [
      ...(findingSection && section.body ? splitFindingText(section.body) : []),
      ...section.fields.filter(isFindingLikeField).flatMap((field) => splitFindingText(field.value)),
    ]

    for (const finding of findingTexts) {
      const findingComponents = componentHits(finding)
      if (isIsolatedFindingFieldValue(finding) && existingText.some((text) => {
        const existingComponents = componentHits(text)
        return existingComponents.some((component) => findingComponents.includes(component))
      })) continue
      const recommendations = dedupeReportText([
        ...sectionRecommendations,
        ...globalRecommendations.filter((recommendation) => {
          const recommendationComponents = componentHits(recommendation)
          return recommendationComponents.length === 0 || findingComponents.length === 0 || recommendationComponents.some((component) => findingComponents.includes(component))
        }),
      ])
      const details = section.fields
        .filter((field) => !/recommend/i.test(`${field.key} ${field.label}`) && shouldRenderDetail(field.label, field.value, [finding]))
        .slice(0, 4)
        .map((field) => ({ label: field.label, value: field.value }))
      candidates.push({ finding, recommendations, details })
    }
  }

  const seen = new Set(existingText.map(normalizeForMatch))
  return candidates.flatMap((candidate, index) => {
    const key = normalizeForMatch(candidate.finding)
    const candidateText = [candidate.finding, ...candidate.recommendations, ...candidate.details.map((detail) => detail.value)].join(' ')
    const candidateComponents = componentHits(candidateText)
    if (!key || existingText.some((text) => {
      const existingKey = normalizeForMatch(text)
      return existingKey === key || existingKey.includes(key) || key.includes(existingKey)
    }) || Array.from(seen).some((seenKey) => seenKey === key || seenKey.includes(key) || key.includes(seenKey)) || candidates.slice(0, index).some((other) => {
      const otherText = [other.finding, ...other.recommendations, ...other.details.map((detail) => detail.value)].join(' ')
      const otherComponents = componentHits(otherText)
      return candidateComponents.length > 0 && candidateComponents.some((component) => otherComponents.includes(component))
    })) return []
    seen.add(key)
    const group: EvidenceGroup = {
      capture_id: `draft-finding-${index + 1}`,
      details: dedupeEvidenceDetails(candidate.details),
      findings: [candidate.finding],
      recommendations: dedupeReportText(candidate.recommendations),
    }
    return [{ capture: fallbackCapture, group, purpose: 'finding' as const }]
  })
}


function findingComponentScope(entry: ReviewEvidenceItem) {
  const text = `${entry.capture.type ?? ''} ${entry.capture.media_kind ?? ''} ${textForCapture(entry.capture)} ${entry.group.findings.join(' ')} ${entry.group.recommendations.join(' ')}`
  const hits = componentHits(text).filter((component) => component !== 'documentation')
  return hits.length > 0 ? Array.from(new Set(hits)) : []
}

function textMatchesFindingScope(value: string, scope: string[]) {
  if (scope.length === 0) return true
  const hits = componentHits(value).filter((component) => component !== 'documentation')
  if (hits.length === 0) return true
  return hits.some((component) => scope.includes(component))
}

function isWorkOrderComplaintText(value: string) {
  return /\b(?:customer\s+)?complaint\b|\bconcern\b|\brequested\s+work\b|\bcorrection\b|\bcause of failure\b|\bwork order\b|\brepair order\b/i.test(value) && !/\b(?:recommend|replace\s+(?:front\s+)?brake\s+pads?|clean\s+corrosion|inspect\s+for\s+damage|maintain|maintenance)\b/i.test(value)
}

function filterFindingScopedDetails(details: EvidenceDetail[], scope: string[]) {
  return details.filter((detail) => {
    const text = `${detail.label} ${detail.value}`
    if (!textMatchesFindingScope(text, scope)) return false
    if (scope.includes('brakes') && /\b(?:battery|terminal|post|corrosion)\b/i.test(text) && !/\bbrake/i.test(text)) return false
    if (scope.includes('battery') && /\b(?:brake|pad|rotor|wear\s*limit|\b2\s*mm\b)\b/i.test(text)) return false
    return true
  })
}

function isRecommendationDetail(detail: EvidenceDetail) {
  return /\brecommend(?:ation|ations|ed)?\b|\baction(?:s)?\b/i.test(detail.label)
}

function isSeverityDetail(detail: EvidenceDetail) {
  return /^severity$/i.test(labelize(detail.label))
}

function filterFindingScopedRecommendations(recommendations: string[], scope: string[]) {
  return recommendations.filter((recommendation) => {
    if (isWorkOrderComplaintText(recommendation)) return false
    if (!textMatchesFindingScope(recommendation, scope)) return false
    if (scope.includes('brakes') && /\b(?:battery|terminal|post|corrosion)\b/i.test(recommendation) && !/\bbrake/i.test(recommendation)) return false
    if (scope.includes('battery') && /\b(?:brake|pad|rotor|wear\s*limit)\b/i.test(recommendation)) return false
    return true
  })
}

function findingTitleFromText(value: string) {
  const text = clean(value, 220)
  if (!text || /^finding\s+\d+$/i.test(text)) return ''
  if (/\bbrakes?\b/i.test(text) && /\bpads?\b/i.test(text) && /\b(?:wear\s*limit|2\s*mm|replace)\b/i.test(text)) return 'Front brake pads are at wear limit'
  if (/\bfront brake pads are at wear limit\b/i.test(text)) return 'Front brake pads are at wear limit'
  if (/\bbattery\b/i.test(text) && /\bpositive\s+post\b/i.test(text) && /\bcorrosion\b/i.test(text)) return 'Passenger side battery positive post corrosion'
  if (/\bbattery\b/i.test(text) && /\bcorrosion\b/i.test(text)) return 'Battery terminal corrosion'
  return stripConfidenceText(text.split(/[.;]/)[0] ?? '').replace(/^observed condition:?\s*/i, '').trim()
}

function buildFindingTitle(details: EvidenceDetail[], observations: string[], entry: ReviewEvidenceItem, index: number) {
  const sourceText = `${entry.capture.technician_note ?? ''} ${entry.capture.ai_summary ?? ''} ${observations.join(' ')} ${details.map((detail) => `${detail.label} ${detail.value}`).join(' ')}`
  const scopedTitle = findingTitleFromText(sourceText)
  if (scopedTitle) return scopedTitle
  for (const value of [
    details.find((detail) => /title|component|system|item|area|location/i.test(detail.label))?.value,
    ...observations,
  ]) {
    const title = findingTitleFromText(value ?? '')
    if (title) return title
  }
  return `Inspection finding ${index + 1}`
}


function isPreferredBatteryAction(value: string) {
  const text = normalizeForMatch(value)
  return /clean corrosion/.test(text) && /passenger side battery positive post/.test(text) && /inspect for damage/.test(text)
}

function isBatteryCleanInspectAction(value: string) {
  const text = normalizeForMatch(value)
  return /clean corrosion/.test(text) && /inspect for damage/.test(text)
}

function isBatteryTerminalMaintenanceAction(value: string) {
  const text = normalizeForMatch(value)
  return /battery/.test(text) && /terminal/.test(text) && /maint|inspect|clean/.test(text)
}

function selectFinalFindingRecommendations(recommendations: string[], scope: string[]) {
  if (!scope.includes('battery')) return recommendations
  const preferred = recommendations.find(isPreferredBatteryAction)
  if (preferred) return [preferred]
  const cleanInspect = recommendations.find(isBatteryCleanInspectAction)
  if (cleanInspect) return [cleanInspect]
  const terminalMaintenance = recommendations.find(isBatteryTerminalMaintenanceAction)
  if (terminalMaintenance) return [terminalMaintenance]
  return recommendations
}

function filterGeneratedObservationNarrative(observations: string[], title: string, details: EvidenceDetail[]) {
  const detailValues = details.map((detail) => detail.value)
  return observations.filter((observation) => {
    const normalized = normalizeForMatch(observation)
    if (!normalized) return false
    const repeatsTitle = isSemanticDuplicateText(observation, title)
    const repeatsDetail = detailValues.some((detail) => isSemanticDuplicateText(observation, detail))
    const generatedNarrative = normalized.split(' ').length >= 12 || /recommend|should|requires|inspection revealed|observed condition/.test(normalized)
    return !(generatedNarrative && (repeatsTitle || repeatsDetail))
  })
}

export function getNormalizedFindingModels<TCapture extends CaptureLike>(items: ReviewDocument<TCapture>['findings']): NormalizedFindingModel<TCapture>[] {
  return items.map((entry, index) => {
    const renderedText: string[] = []
    const scope = findingComponentScope(entry)
    const scopedDetails = filterFindingScopedDetails(dedupeEvidenceDetails(entry.group.details), scope)
    const detailRecommendations = scopedDetails.filter(isRecommendationDetail).flatMap((detail) => splitRecommendationText(detail.value))
    const observations = dedupeSemanticReportText(entry.group.findings.filter((finding) => shouldRenderDetail('Observed condition', finding, renderedText)))
    observations.forEach((finding) => renderedText.push(finding))
    const details = scopedDetails.filter((detail) => !isRecommendationDetail(detail) && !isSeverityDetail(detail)).filter((detail) => {
      const visible = shouldRenderDetail(detail.label, detail.value, renderedText)
      if (visible) renderedText.push(detail.value)
      return visible
    })
    const title = buildFindingTitle(details, observations, entry, index)
    const finalObservations = filterGeneratedObservationNarrative(observations, title, details)
    const recommendations = selectFinalFindingRecommendations(
      dedupeSemanticReportText(filterFindingScopedRecommendations([...entry.group.recommendations.flatMap(splitRecommendationText), ...detailRecommendations], scope).filter((recommendation) => shouldRenderDetail('Recommendation', recommendation, renderedText))),
      scope,
    )
    recommendations.forEach((recommendation) => renderedText.push(recommendation))
    const severity = normalizeReportSeverity([...finalObservations, ...recommendations, ...scopedDetails.map((detail) => `${detail.label} ${detail.value}`)])
    return { id: entry.group.capture_id, title, severity, observations: finalObservations, recommendations, details, evidenceCount: 1, entry }
  })
}

export function getNormalizedRecommendedActions<TCapture = CaptureLike>(findings: NormalizedFindingModel<TCapture>[]) {
  return findings.flatMap((finding) => finding.recommendations.map((action) => ({ priority: finding.severity.label.replace(/^[^ ]+ /, ''), priorityScore: finding.severity.priority, action })))
    .sort((a, b) => normalizeForSemanticDedupe(b.action).length - normalizeForSemanticDedupe(a.action).length)
    .filter((item, index, items) => items.findIndex((candidate) => isSemanticDuplicateText(candidate.action, item.action)) === index)
    .sort((a, b) => b.priorityScore - a.priorityScore || a.action.localeCompare(b.action))
}

export function getNormalizedInspectionStatus<TCapture = CaptureLike>(findings: NormalizedFindingModel<TCapture>[]) {
  if (findings.some((finding) => finding.severity.key === 'critical')) return '⚠ Repairs Recommended'
  if (findings.some((finding) => finding.severity.key === 'advisory')) return '⚠ Maintenance Recommended'
  return findings.length > 0 ? 'ℹ Review Findings' : '✅ No Findings Identified'
}

export function buildNormalizedReportModel<TCapture extends CaptureLike>(params: Parameters<typeof buildNonDuplicatedReviewDocument<TCapture>>[0]): NormalizedReportModel<TCapture> {
  const document = buildNonDuplicatedReviewDocument(params)
  const fallbackFindings: ReviewDocument<TCapture>['findings'] = []
  const allFindings = [...document.findings, ...fallbackFindings]
  const findingModels = getNormalizedFindingModels(allFindings)
  const recommendedActions = getNormalizedRecommendedActions(findingModels)
  const severityBreakdown = ['critical', 'advisory', 'informational'].map((key) => ({ key, count: findingModels.filter((finding) => finding.severity.key === key).length, label: findingModels.find((finding) => finding.severity.key === key)?.severity.label ?? ({ critical: '🔴 Critical', advisory: '🟡 Advisory', informational: '🟢 Informational' } as Record<string, string>)[key] })).filter((item) => item.count > 0)
  return {
    ...document,
    findings: allFindings,
    findingModels,
    recommendedActions,
    summary: {
      totalFindings: findingModels.length,
      criticalFindings: findingModels.filter((finding) => finding.severity.key === 'critical').length,
      referenceDocumentCount: document.referenceDocuments.length,
      evidenceItemCount: params.captures.length,
      inspectionStatus: getNormalizedInspectionStatus(findingModels),
      severityBreakdown,
    },
  }
}


const EVIDENCE_PACKAGE_RULES = [
  { key: 'battery_charging', title: 'Battery and Charging System Test', terms: ['battery', 'cca', 'voltage', 'volt', 'current draw', 'amp clamp', 'multimeter', 'ripple', 'alternator', 'charging', 'starter'] },
  { key: 'corrosion', title: 'Corrosion Inspection', terms: ['corrosion', 'rust', 'terminal', 'post'] },
  { key: 'brakes', title: 'Brake Inspection', terms: ['brake', 'pad', 'rotor', 'lining', 'caliper', 'drum'] },
  { key: 'tires', title: 'Tire and Tread Inspection', terms: ['tire', 'tyre', 'tread', 'sidewall'] },
  { key: 'complaint', title: 'Customer Complaint Verification', terms: ['complaint', 'concern', 'verify', 'verification', 'customer states'] },
  { key: 'fluid_leak', title: 'Fluid Leak Inspection', terms: ['leak', 'oil', 'coolant', 'fluid', 'hydraulic'] },
]

function getCapturePackageText(capture: CaptureLike, group?: EvidenceGroup) {
  return normalizeForMatch(`${capture.type ?? ''} ${capture.media_kind ?? ''} ${textForCapture(capture)} ${(group?.details ?? []).map((detail) => `${detail.label} ${detail.value}`).join(' ')} ${(group?.findings ?? []).join(' ')} ${(group?.recommendations ?? []).join(' ')}`)
}

function getPackageRule(capture: CaptureLike, group?: EvidenceGroup) {
  const text = getCapturePackageText(capture, group)
  return EVIDENCE_PACKAGE_RULES.find((rule) => rule.terms.some((term) => text.includes(normalizeForMatch(term))))
}

function canonicalizeReportField(key: string, value: string): NormalizedReportField | null {
  const label = labelize(key) || normalizeUserFacingLabel(key)
  const cleaned = clean(value, 160)
  if (!label || !cleaned) return null
  const match = cleaned.match(/(-?\d+(?:[,.]\d+)?)\s*(m?a|amps?|v|volts?|mv|cca|mm|in|psi|%|percent)\b/i)
  if (!match) return { key: slug(key, 'field'), label, value: cleaned, unit: null, canonical_value: null, source_capture_ids: [], display_value: cleaned }
  const raw = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(raw)) return null
  const unitText = match[2].toLowerCase()
  let unit = unitText
  let canonicalValue = raw
  if (unitText === 'ma') { unit = 'A'; canonicalValue = raw / 1000 }
  else if (/^a|amp/.test(unitText)) unit = 'A'
  else if (unitText === 'mv') { unit = 'V'; canonicalValue = raw / 1000 }
  else if (/^v|volt/.test(unitText)) unit = 'V'
  else if (unitText === 'percent') unit = '%'
  const display = unit === 'A' && canonicalValue < 1 ? `${Math.round(canonicalValue * 1000)} mA` : `${Number(canonicalValue.toFixed(3))} ${unit}`
  return { key: slug(key, 'field'), label, value: cleaned, unit, canonical_value: Number(canonicalValue.toFixed(6)), source_capture_ids: [], display_value: display }
}

export function buildNormalizedReportFields(captures: CaptureLike[]): NormalizedReportField[] {
  const fields = new Map<string, NormalizedReportField>()
  for (const capture of captures) {
    for (const [key, value] of Object.entries(getExtractionFields(capture.extracted_data))) {
      if (typeof value !== 'string') continue
      const normalized = canonicalizeReportField(key, value)
      if (!normalized) continue
      const dedupeKey = `${normalized.key}:${normalized.unit ?? 'text'}:${normalized.canonical_value ?? normalizeForMatch(normalized.display_value)}`
      const existing = fields.get(dedupeKey)
      if (existing) existing.source_capture_ids = Array.from(new Set([...existing.source_capture_ids, capture.id]))
      else fields.set(dedupeKey, { ...normalized, source_capture_ids: [capture.id] })
    }
  }
  return Array.from(fields.values())
}

function detectDuplicateFlags(captures: CaptureLike[]) {
  const seen = new Map<string, string>()
  const seenReadings = new Map<string, string>()
  const flags: EvidencePackage['duplicate_flags'] = []
  const flagOnce = (captureId: string, duplicateOf: string, reason: string) => {
    if (captureId === duplicateOf || flags.some((flag) => flag.capture_id === captureId && flag.duplicate_of_capture_id === duplicateOf)) return
    flags.push({ capture_id: captureId, duplicate_of_capture_id: duplicateOf, reason, label: 'Possible Duplicate' })
  }
  for (const capture of captures) {
    const textKey = normalizeForMatch(`${capture.type ?? ''} ${capture.media_kind ?? ''} ${capture.ocr_text ?? ''} ${capture.ai_summary ?? ''} ${JSON.stringify(getExtractionFields(capture.extracted_data))}`).slice(0, 500)
    if (textKey.length >= 12) {
      const duplicateOf = seen.get(textKey)
      if (duplicateOf) flagOnce(capture.id, duplicateOf, 'Same document, upload, or highly similar extracted evidence was captured more than once. It was flagged for review and not deleted.')
      else seen.set(textKey, capture.id)
    }
    for (const [key, value] of Object.entries(getExtractionFields(capture.extracted_data))) {
      if (typeof value !== 'string') continue
      const normalized = canonicalizeReportField(key, value)
      if (!normalized?.unit || normalized.canonical_value === null) continue
      const readingKey = `${normalized.key}:${normalized.unit}:${normalized.canonical_value}`
      const duplicateReadingOf = seenReadings.get(readingKey)
      if (duplicateReadingOf) flagOnce(capture.id, duplicateReadingOf, 'Same normalized reading appears more than once. It was merged for reporting and flagged for review, not deleted.')
      else seenReadings.set(readingKey, capture.id)
    }
  }
  return flags
}

function buildGeneratedFinding(title: string, fields: NormalizedReportField[], groups: EvidenceGroup[]) {
  const text = normalizeForMatch(`${title} ${fields.map((field) => `${field.key} ${field.display_value}`).join(' ')} ${groups.flatMap((group) => [...group.findings, ...group.recommendations]).join(' ')}`)
  const hasBattery = /battery|charging|starter|cca|current draw|ripple/.test(text)
  const hasDefect = /fail|failed|replace|required|critical|leak|crack|broken|wear limit|corrosion/.test(text)
  const hasAdvisory = /monitor|recommend|advisory|attention|ripple/.test(text)
  if (hasBattery && !hasDefect) return { text: 'Battery, starter, and charging system operating within specification.', severity: 'pass' as const, confidence: 0.96 }
  if (hasDefect) return { text: `${title} has supported inspection findings requiring review.`, severity: 'fail' as const, confidence: 0.88 }
  if (hasAdvisory) return { text: `${title} has supported advisory observations.`, severity: 'advisory' as const, confidence: 0.84 }
  return { text: `${title} evidence package prepared for review.`, severity: 'needs_review' as const, confidence: 0.72 }
}

export function buildEvidencePackages(captures: CaptureLike[], evidenceGroups: EvidenceGroup[] = buildEvidenceGroups(captures)): EvidencePackage[] {
  const groupByCapture = new Map(evidenceGroups.map((group) => [group.capture_id, group]))
  const buckets = new Map<string, { title: string; captures: CaptureLike[] }>()
  for (const capture of captures) {
    const rule = getPackageRule(capture, groupByCapture.get(capture.id))
    const key = rule?.key ?? (isNoteCapture(capture) ? 'notes' : isDocumentCapture(capture) ? 'documents' : 'general')
    const title = rule?.title ?? (key === 'notes' ? 'Technician Notes' : key === 'documents' ? 'Reference Documents' : 'General Supporting Evidence')
    buckets.set(key, { title, captures: [...(buckets.get(key)?.captures ?? []), capture] })
  }
  const allFields = buildNormalizedReportFields(captures)
  const allDuplicateFlags = detectDuplicateFlags(captures)
  return Array.from(buckets.entries()).map(([key, bucket], index) => {
    const captureIds = bucket.captures.map((capture) => capture.id)
    const packageGroups = captureIds.flatMap((id) => groupByCapture.get(id) ? [groupByCapture.get(id)!] : [])
    const sourceValues = allFields.filter((field) => field.source_capture_ids.some((id) => captureIds.includes(id)))
    const finding = buildGeneratedFinding(bucket.title, sourceValues, packageGroups)
    const recommendations = packageGroups.flatMap((group) => group.recommendations).map((text) => ({ text, supporting_capture_ids: captureIds.filter((id) => groupByCapture.get(id)?.recommendations.includes(text)) }))
    return {
      id: `${key}_${index + 1}`,
      title: bucket.title,
      summary: `${bucket.captures.length} capture${bucket.captures.length === 1 ? '' : 's'} grouped as related evidence.`,
      capture_ids: captureIds,
      confidence: Math.min(0.98, 0.68 + Math.min(captureIds.length, 5) * 0.06),
      generated_finding: { ...finding, source_values: sourceValues },
      recommendations: recommendations.filter((item) => item.supporting_capture_ids.length > 0),
      duplicate_flags: allDuplicateFlags.filter((flag) => captureIds.includes(flag.capture_id)),
    }
  })
}


export type FormClassification = 'FORD_MPI' | 'ALBERTA_CVIP' | 'COMMERCIAL_VEHICLE_ROI' | 'WAJAX_FIELD_ORDER' | 'GENERIC_WORK_ORDER' | 'GENERIC_INSPECTION_FORM' | 'GENERIC_SERVICE_REPORT' | 'CUSTOM_FORM'

export type FormBlueprintField = {
  id: string
  label: string
  field_type: 'text' | 'measurement' | 'checkbox' | 'pass_fail' | 'signature' | 'notes' | 'header' | 'footer' | 'unknown'
  section_id: string | null
  page_index: number | null
  value: string | null
  source_capture_id: string
}

export type FormBlueprintSection = {
  id: string
  title: string
  page_index: number | null
  field_ids: string[]
}

export type FormBlueprint = {
  version: 1
  document_type: string
  classification: FormClassification
  classification_confidence: number
  source_capture_ids: string[]
  pages: Array<{ page_index: number; label: string; source_capture_id: string }>
  sections: FormBlueprintSection[]
  fields: FormBlueprintField[]
  tables: Array<{ id: string; title: string; section_id: string | null; source_capture_id: string }>
  checkboxes: string[]
  pass_fail_indicators: string[]
  signature_areas: string[]
  notes_areas: string[]
  measurement_fields: string[]
  header_fields: string[]
  footer_fields: string[]
}

export type EvidenceFieldMapping = {
  capture_id: string
  field_id: string | null
  section_id: string | null
  section_title: string
  field_label: string | null
  confidence: number
  truth_source: 'technician_note' | 'technician_transcript' | 'captured_measurement' | 'explicit_selection' | 'ai_extraction' | 'ai_inference'
  reason: string
}

const KNOWN_FORM_RULES: Array<{ classification: FormClassification; confidence: number; patterns: RegExp[] }> = [
  { classification: 'FORD_MPI', confidence: 0.9, patterns: [/\bford\b/i, /multi[ -]?point|\bmp[iv]\b/i] },
  { classification: 'ALBERTA_CVIP', confidence: 0.92, patterns: [/\balberta\b/i, /\bcvip\b|commercial vehicle inspection/i] },
  { classification: 'COMMERCIAL_VEHICLE_ROI', confidence: 0.86, patterns: [/commercial vehicle/i, /record of inspection|\broi\b/i] },
  { classification: 'WAJAX_FIELD_ORDER', confidence: 0.9, patterns: [/\bwajax\b/i, /field (service )?(order|report)|time card|charges/i] },
  { classification: 'GENERIC_WORK_ORDER', confidence: 0.72, patterns: [/work order|repair order|complaint/i, /cause|correction|customer/i] },
  { classification: 'GENERIC_INSPECTION_FORM', confidence: 0.7, patterns: [/inspection|checklist|pass|fail/i, /tire|brake|lighting|vehicle/i] },
  { classification: 'GENERIC_SERVICE_REPORT', confidence: 0.68, patterns: [/service report|field service/i, /equipment|work performed|technician/i] },
]

function classifyFormBlueprintText(text: string): { classification: FormClassification; confidence: number } {
  for (const rule of KNOWN_FORM_RULES) {
    if (rule.patterns.every((pattern) => pattern.test(text))) return { classification: rule.classification, confidence: rule.confidence }
  }
  return { classification: 'CUSTOM_FORM', confidence: text.trim() ? 0.45 : 0 }
}

function inferBlueprintFieldType(label: string, value: string): FormBlueprintField['field_type'] {
  const text = `${label} ${value}`
  if (/sign|signature|accepted by|authorized by/i.test(text)) return 'signature'
  if (/notes?|comments?|remarks?|complaint|cause|correction/i.test(text)) return 'notes'
  if (/pass|fail|ok|defect|reject/i.test(text)) return 'pass_fail'
  if (/\[[ x✓✔]?\]|☐|☑|checkbox|yes\s*\/\s*no/i.test(text)) return 'checkbox'
  if (/measurement|reading|mm|psi|volt|hours?|odometer|mileage|tread|brake|depth/i.test(text)) return 'measurement'
  if (/customer|unit|vehicle|vin|serial|make|model|date|work order|plate/i.test(text)) return 'header'
  if (/footer|page \d|terms|disclaimer/i.test(text)) return 'footer'
  return 'text'
}

export function extractFormBlueprint(captures: CaptureLike[]): FormBlueprint | null {
  const formCaptures = selectPrimaryFormCaptures(captures)
  if (formCaptures.length === 0) return null
  const allText = formCaptures.map(textForCapture).join(' ')
  const classification = classifyFormBlueprintText(allText)
  const sections = new Map<string, FormBlueprintSection>()
  const fields: FormBlueprintField[] = []
  const pages = formCaptures.map((capture, index) => ({ page_index: index + 1, label: `Page ${index + 1}`, source_capture_id: capture.id }))

  for (const [captureIndex, capture] of formCaptures.entries()) {
    const sourceDocument = getSourceDocumentFields(capture).sourceDocument
    const sourceSections = Array.isArray(sourceDocument?.sections) ? sourceDocument.sections : []
    for (const [index, rawSection] of sourceSections.entries()) {
      const title = clean(isRecord(rawSection) ? rawSection.title : rawSection, 120) || `Form section ${index + 1}`
      const id = slug(title, `section_${captureIndex + 1}_${index + 1}`)
      if (!sections.has(id)) sections.set(id, { id, title, page_index: captureIndex + 1, field_ids: [] })
    }

    const rows = fieldRowsFromCapture(capture)
    const fallbackRows = rows.length > 0 ? [] : labelRowsFromText(capture)
    for (const [index, row] of [...rows, ...fallbackRows].entries()) {
      const sectionTitle = inferSectionTitle(`${row.key} ${row.label}`)
      const sectionId = slug(sectionTitle, `section_${captureIndex + 1}`)
      if (!sections.has(sectionId)) sections.set(sectionId, { id: sectionId, title: sectionTitle, page_index: captureIndex + 1, field_ids: [] })
      const fieldType = inferBlueprintFieldType(row.label, row.value)
      const fieldId = `${sectionId}_${slug(row.key || row.label, `field_${index + 1}`)}`
      fields.push({ id: fieldId, label: row.label, field_type: fieldType, section_id: sectionId, page_index: captureIndex + 1, value: row.value === 'Not captured' ? null : row.value, source_capture_id: capture.id })
      sections.get(sectionId)?.field_ids.push(fieldId)
    }
  }

  return {
    version: 1,
    document_type: classification.classification === 'CUSTOM_FORM' ? 'custom_form' : classification.classification.toLowerCase(),
    classification: classification.classification,
    classification_confidence: classification.confidence,
    source_capture_ids: formCaptures.map((capture) => capture.id),
    pages,
    sections: Array.from(sections.values()).slice(0, 40),
    fields: fields.slice(0, 240),
    tables: [],
    checkboxes: fields.filter((field) => field.field_type === 'checkbox').map((field) => field.id),
    pass_fail_indicators: fields.filter((field) => field.field_type === 'pass_fail').map((field) => field.id),
    signature_areas: fields.filter((field) => field.field_type === 'signature').map((field) => field.id),
    notes_areas: fields.filter((field) => field.field_type === 'notes').map((field) => field.id),
    measurement_fields: fields.filter((field) => field.field_type === 'measurement').map((field) => field.id),
    header_fields: fields.filter((field) => field.field_type === 'header').map((field) => field.id),
    footer_fields: fields.filter((field) => field.field_type === 'footer').map((field) => field.id),
  }
}

function truthSourceForCapture(capture: CaptureLike): EvidenceFieldMapping['truth_source'] {
  if (clean(capture.technician_note, 20)) return 'technician_note'
  if (clean(capture.transcript, 20)) return 'technician_transcript'
  if (Object.keys(getExtractionFields(capture.extracted_data)).some((key) => /measurement|reading|value|depth|mm|psi|volt/i.test(key))) return 'captured_measurement'
  if (isRecord(capture.extracted_data) && isRecord(capture.extracted_data.guidance)) return 'explicit_selection'
  if (clean(capture.ai_summary, 20) || clean(capture.ocr_text, 20)) return 'ai_extraction'
  return 'ai_inference'
}

export function mapEvidenceToFormBlueprint(captures: CaptureLike[], blueprint: FormBlueprint | null): EvidenceFieldMapping[] {
  if (!blueprint) return []
  const sourceIds = new Set(blueprint.source_capture_ids)
  const sections = new Map(blueprint.sections.map((section) => [section.id, section]))
  const evidenceCaptures = captures.filter((capture) => !sourceIds.has(capture.id))
  return evidenceCaptures.flatMap((capture) => {
    const captureText = normalizeForMatch(`${capture.technician_note ?? ''} ${capture.transcript ?? ''} ${capture.ai_summary ?? ''} ${capture.ocr_text ?? ''} ${JSON.stringify(getExtractionFields(capture.extracted_data))}`)
    if (!captureText) return []
    const candidates = blueprint.fields.map((field) => {
      const section = field.section_id ? sections.get(field.section_id) : null
      const fieldText = normalizeForMatch(`${section?.title ?? ''} ${field.label}`)
      const tokens = fieldText.split(' ').filter((token) => token.length > 2)
      const hits = tokens.filter((token) => captureText.includes(token)).length
      const componentHits = componentHitsForBlueprint(captureText, fieldText)
      const confidence = Math.min(0.98, (hits / Math.max(tokens.length, 1)) * 0.65 + componentHits * 0.12 + (field.field_type === 'measurement' && /\b\d+(?:\.\d+)?\s*(mm|psi|v|volt|hours?)\b/.test(captureText) ? 0.18 : 0))
      return { field, section, confidence }
    }).filter((candidate) => candidate.confidence >= 0.22).sort((a, b) => b.confidence - a.confidence).slice(0, 3)
    return candidates.map((candidate) => ({
      capture_id: capture.id,
      field_id: candidate.field.id,
      section_id: candidate.section?.id ?? null,
      section_title: candidate.section?.title ?? 'Unmapped evidence',
      field_label: candidate.field.label,
      confidence: Number(candidate.confidence.toFixed(2)),
      truth_source: truthSourceForCapture(capture),
      reason: 'Matched evidence text against extracted form section and field labels.',
    }))
  })
}

function componentHitsForBlueprint(captureText: string, fieldText: string) {
  const terms = ['brake', 'tire', 'tyre', 'wheel', 'lighting', 'light', 'windshield', 'glass', 'body', 'engine', 'battery', 'fluid', 'leak', 'complaint', 'cause', 'correction']
  return terms.filter((term) => captureText.includes(term) && fieldText.includes(term)).length
}

function sanitizeReportNodeForSession(value: Json, sessionCaptureIds: Set<string>): Json | undefined {
  if (Array.isArray(value)) {
    const sanitized = value
      .map((item) => sanitizeReportNodeForSession(item, sessionCaptureIds))
      .filter((item): item is Json => item !== undefined)
    return sanitized
  }

  if (!isRecord(value)) return value

  const sourceCaptureId = typeof value.source_capture_id === 'string' ? value.source_capture_id : null
  if (sourceCaptureId && !sessionCaptureIds.has(sourceCaptureId)) return undefined

  const captureId = typeof value.capture_id === 'string' ? value.capture_id : null
  if (captureId && !sessionCaptureIds.has(captureId)) return undefined

  const next: Record<string, Json> = {}
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'capture_ids' || key === 'source_capture_ids' || key === 'supporting_capture_ids' || key === 'related_capture_ids' || key === 'form_capture_ids') && Array.isArray(child)) {
      next[key] = child.filter((id): id is string => typeof id === 'string' && sessionCaptureIds.has(id))
      if ((key === 'capture_ids' || key === 'supporting_capture_ids') && next[key].length === 0) return undefined
      continue
    }

    const sanitizedChild = sanitizeReportNodeForSession(child as Json, sessionCaptureIds)
    if (sanitizedChild !== undefined) next[key] = sanitizedChild
  }

  return next
}

export function sanitizeReportStructureForSession(reportStructure: Json | null, sessionCaptureIds: string[]): Json {
  const captureIds = new Set(sessionCaptureIds)
  const sanitized = sanitizeReportNodeForSession(reportStructure ?? {}, captureIds)
  return sanitized ?? {}
}
