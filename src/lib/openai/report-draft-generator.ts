import type { Json } from '@/lib/supabase/database.types'

export const AI_REPORT_DRAFT_MODEL = 'gpt-4.1-mini'
export const AI_REPORT_DRAFT_PROMPT_VERSION = 'form-evidence-report-v3'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const MAX_SECTIONS = 24
const MAX_ARRAY_ITEMS = 60
const SECTION_STATUSES = ['pass', 'fail', 'recommended', 'na', 'needs_review', 'informational'] as const

const SOURCE_DOCUMENT_IDENTITY_FIELDS = new Set([
  'vin',
  'unit_number',
  'asset_label',
  'odometer',
  'hour_meter',
  'plate_number',
  'work_order_number',
  'purchase_order_number',
  'job_number',
  'customer_name',
  'licence_number',
  'year',
  'make',
  'equipment_make',
  'equipment_model',
  'equipment_serial_number',
  'engine_make',
  'engine_model',
  'engine_serial_number',
  'generator_make',
  'generator_model',
  'generator_serial_number',
  'transmission_make',
  'transmission_model',
  'transmission_serial_number',
  'registration_number',
  'registered_owner',
  'manufacturer',
  'model',
  'serial_number',
  'gvwr',
  'jurisdiction',
  'ratings_capacity',
  'date',
  'gawr_front',
  'gawr_rear',
  'tire_size',
  'tire_pressure',
  'document_type',
  'inspection_date',
])

const SOURCE_DOCUMENT_INCLUDE_PATTERNS = [
  /\buse\s+(this|document|line|item|note|comment)\s+as\s+(a\s+)?finding\b/i,
  /\binclude\s+(this|document|line|item|note|comment|finding|recommendation|complaint|correction)\b/i,
  /\badd\s+(this|document|line|item|note|comment)\s+to\s+(the\s+)?(report|findings|recommendations)\b/i,
  /\btreat\s+(this|document|line|item|note|comment)\s+as\s+(a\s+)?finding\b/i,
]

type SectionStatus = (typeof SECTION_STATUSES)[number]

export type ReportDraftCaptureContext = {
  id: string
  type: string | null
  media_kind: string | null
  captured_at: string | null
  ai_status: string | null
  ai_summary: string | null
  ocr_text: string | null
  technician_note: string | null
  transcript: string | null
  extracted_data: Json | null
}

export type GenerateReportDraftInput = {
  reportContext: {
    name: string | null
    description: string | null
    template_type: string | null
    sections: Json | null
    fields: Json | null
    required_evidence: Json | null
    recommended_evidence: Json | null
    signature_requirements: Json | null
  } | null
  session: {
    id: string
    title: string
    session_type: string
    asset_label: string | null
    vin: string | null
    odometer: string | null
    unit_number: string | null
    customer_name: string | null
    suggested_details: Json | null
    field_service_details: Json | null
  }
  captures: ReportDraftCaptureContext[]
  signatures: {
    id: string
    signature_type: string
    signer_name: string
    signed_at: string
  }[]
}

export type GeneratedReportDraftSection = {
  section_key: string
  title: string
  body: string | null
  status: SectionStatus | null
  confidence: number
  source_capture_ids: string[]
  sort_order: number
  metadata: Json
}

export type GeneratedReportDraft = {
  title: string | null
  summary: string | null
  header_fields: Json
  measurements: Json
  findings: Json
  coverage: Json
  unmapped_evidence: Json
  confidence: number
  sections: GeneratedReportDraftSection[]
}

const REPORT_DRAFT_SYSTEM_PROMPT = `You generate editable drafts for CRED evidence-first, form-structured reports.
Return JSON only, no markdown.
If a captured source document/form exists, use that captured form as the report structure. Extract or infer its sections, labels, and field groups generically from the captured document; do not require or invent a form type selection. Use any selected context only as secondary terminology.
Technicians capture evidence naturally; synthesize technician-captured evidence into a professional, human-reviewable draft instead of dumping captures.
Do not invent unsupported facts.
Prioritize draft inputs in this order: 1) technician notes on evidence captures, 2) evidence photos/videos, 3) extracted measurements/findings from evidence captures, 4) source document identity fields, 5) selected Form Profile/report context.
Source documents/forms provide the report skeleton, field labels, and filled values. Do not convert prior work-order lines into findings unless technician evidence explicitly supports them.
Each section should include metadata for form/evidence rendering when available: section_type ('form_section' or 'evidence_group'), source_field_group, fields [{key,label,value,source_capture_id}], related_capture_ids, observations, findings, recommendations. Attach findings/recommendations to the evidence capture IDs that support them.
Every finding or section based on evidence must reference source_capture_ids from supplied non-source evidence captures or explicitly requested source-document captures.
Use needs_review when uncertain or when evidence is incomplete.
Organize around captured form sections first when a form is present, then supporting evidence. When no form is present, organize as evidence groups that keep each photo/file/text/voice note together with its note, details, findings, and recommendations.
Do not claim official CVIP/compliance completion, automatic compliance, or final inspection approval.
If unmentioned items are assumed pass, clearly mark them as assumptions requiring review.
Prefer technician notes/transcripts over visual guesswork for location, component, measurement, and recommendation.
Preserve original technician wording where useful.
Include unmapped_evidence for captures that do not fit a section.
AI Drafts require human review before delivery.`

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() ?? ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampConfidence(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(numberValue)) return 0
  return Math.min(1, Math.max(0, numberValue))
}

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function sanitizeKey(value: unknown, fallback: string) {
  const text = sanitizeText(value, 80)?.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return text || fallback
}

function sanitizeJsonObject(value: unknown): Json {
  return isRecord(value) ? (value as Json) : {}
}

function sanitizeJsonArray(value: unknown): Json {
  return Array.isArray(value) ? (value.slice(0, MAX_ARRAY_ITEMS) as Json) : []
}

function extractOutputText(response: unknown) {
  if (!isRecord(response)) return null
  if (typeof response.output_text === 'string') return response.output_text

  const output = Array.isArray(response.output) ? response.output : []
  const textParts = output.flatMap((item) => {
    if (!isRecord(item) || !Array.isArray(item.content)) return []
    return item.content.flatMap((contentItem) => {
      if (!isRecord(contentItem)) return []
      return typeof contentItem.text === 'string' ? [contentItem.text] : []
    })
  })

  return textParts.length > 0 ? textParts.join('\n') : null
}

function technicianExplicitlyIncludesSourceFinding(note?: string | null) {
  if (!note) return false
  return SOURCE_DOCUMENT_INCLUDE_PATTERNS.some((pattern) => pattern.test(note))
}

function getExtractionFields(capture: ReportDraftCaptureContext) {
  const extractedData = isRecord(capture.extracted_data) ? capture.extracted_data : {}
  const extraction = isRecord(extractedData.extraction) ? extractedData.extraction : {}
  return isRecord(extraction.fields) ? extraction.fields : {}
}

function getSourceDocumentContext(capture: ReportDraftCaptureContext) {
  const extractedData = isRecord(capture.extracted_data) ? capture.extracted_data : {}
  return isRecord(extractedData.source_document) ? extractedData.source_document : null
}

function buildSourceDocumentDraftContext(capture: ReportDraftCaptureContext) {
  const fields = getExtractionFields(capture)
  const identityFields = Object.fromEntries(
    Object.entries(fields).filter(([key, value]) => SOURCE_DOCUMENT_IDENTITY_FIELDS.has(key) && value),
  )
  const sourceDocument = getSourceDocumentContext(capture)

  return {
    capture_id: capture.id,
    type: capture.type,
    media_kind: capture.media_kind,
    captured_at: capture.captured_at,
    source_document: sourceDocument,
    technician_note: capture.technician_note,
    identity_fields: identityFields,
  }
}

function buildEvidenceDraftContext(capture: ReportDraftCaptureContext) {
  return {
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
  }
}

function sanitizeStatus(value: unknown): SectionStatus | null {
  return typeof value === 'string' && SECTION_STATUSES.includes(value as SectionStatus)
    ? (value as SectionStatus)
    : null
}

function sanitizeSourceCaptureIds(value: unknown, allowedCaptureIds: Set<string>) {
  if (!Array.isArray(value)) return []
  return value
    .filter((id): id is string => typeof id === 'string' && allowedCaptureIds.has(id))
    .slice(0, 20)
}

export function validateGeneratedReportDraft(value: unknown, allowedCaptureIds = new Set<string>()): GeneratedReportDraft {
  const record = isRecord(value) ? value : {}
  const rawSections = Array.isArray(record.sections) ? record.sections : []

  const sections = rawSections.slice(0, MAX_SECTIONS).map((section, index): GeneratedReportDraftSection => {
    const sectionRecord = isRecord(section) ? section : {}
    const title = sanitizeText(sectionRecord.title, 140) ?? `Draft Section ${index + 1}`

    return {
      section_key: sanitizeKey(sectionRecord.section_key, `section_${index + 1}`),
      title,
      body: sanitizeText(sectionRecord.body, 4000),
      status: sanitizeStatus(sectionRecord.status),
      confidence: clampConfidence(sectionRecord.confidence),
      source_capture_ids: sanitizeSourceCaptureIds(sectionRecord.source_capture_ids, allowedCaptureIds),
      sort_order: Number.isInteger(sectionRecord.sort_order) ? Number(sectionRecord.sort_order) : index,
      metadata: sanitizeJsonObject(sectionRecord.metadata),
    }
  })

  return {
    title: sanitizeText(record.title, 180),
    summary: sanitizeText(record.summary, 1200),
    header_fields: sanitizeJsonObject(record.header_fields),
    measurements: sanitizeJsonArray(record.measurements),
    findings: sanitizeJsonArray(record.findings),
    coverage: sanitizeJsonObject(record.coverage),
    unmapped_evidence: sanitizeJsonArray(record.unmapped_evidence),
    confidence: clampConfidence(record.confidence),
    sections,
  }
}

function buildDraftContext(input: GenerateReportDraftInput) {
  const sourceDocuments = input.captures.filter((capture) => getSourceDocumentContext(capture))
  const evidenceCaptures = input.captures.filter(
    (capture) => !getSourceDocumentContext(capture) || technicianExplicitlyIncludesSourceFinding(capture.technician_note),
  )

  return {
    source_document_policy:
      'Source documents provide identity/header context only. Work order line descriptions, complaints, corrections, prior notes, labour/parts lines, and recommendations are not findings unless the technician note explicitly asks to include them.',
    report_context: input.reportContext,
    session: input.session,
    source_documents: sourceDocuments.map(buildSourceDocumentDraftContext),
    evidence: evidenceCaptures.map(buildEvidenceDraftContext),
    notes_and_transcripts: evidenceCaptures
      .filter((capture) => capture.technician_note || capture.transcript)
      .map((capture) => ({
        capture_id: capture.id,
        technician_note: capture.technician_note,
        transcript: capture.transcript,
      })),
    signatures: input.signatures,
  }
}

export async function generateReportDraft(input: GenerateReportDraftInput): Promise<GeneratedReportDraft> {
  const apiKey = getOpenAiApiKey()

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY_MISSING')
  }

  const allowedCaptureIds = new Set(input.captures.map((capture) => capture.id))

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_REPORT_DRAFT_MODEL,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: REPORT_DRAFT_SYSTEM_PROMPT }],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Create an editable CRED report draft from this context. Use captured form/source-document sections as the structure when present. Keep evidence as the anchor: findings, recommendations, measurements, details, notes, and transcripts must attach to their source capture IDs where possible. Return the strict JSON shape only.\n${JSON.stringify(buildDraftContext(input)).slice(0, 70000)}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'ai_report_draft',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: ['string', 'null'] },
              summary: { type: ['string', 'null'] },
              header_fields: { type: 'object', additionalProperties: true },
              measurements: { type: 'array', items: { type: 'object', additionalProperties: true } },
              findings: { type: 'array', items: { type: 'object', additionalProperties: true } },
              coverage: { type: 'object', additionalProperties: true },
              unmapped_evidence: { type: 'array', items: { type: 'object', additionalProperties: true } },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              sections: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    section_key: { type: 'string' },
                    title: { type: 'string' },
                    body: { type: ['string', 'null'] },
                    status: { type: ['string', 'null'], enum: ['pass', 'fail', 'recommended', 'na', 'needs_review', 'informational', null] },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    source_capture_ids: { type: 'array', items: { type: 'string' } },
                    sort_order: { type: 'integer' },
                    metadata: { type: 'object', additionalProperties: true },
                  },
                  required: ['section_key', 'title', 'body', 'status', 'confidence', 'source_capture_ids', 'sort_order', 'metadata'],
                },
              },
            },
            required: ['title', 'summary', 'header_fields', 'measurements', 'findings', 'coverage', 'unmapped_evidence', 'confidence', 'sections'],
          },
        },
      },
      max_output_tokens: 6000,
    }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message = isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
      ? body.error.message
      : `OpenAI request failed with status ${response.status}`
    const code = isRecord(body) && isRecord(body.error) && typeof body.error.code === 'string' ? body.error.code : undefined
    const error = new Error(message)
    if (code) error.name = code
    throw error
  }

  const body = await response.json()
  const outputText = extractOutputText(body)
  if (!outputText) return validateGeneratedReportDraft(null, allowedCaptureIds)

  try {
    return validateGeneratedReportDraft(JSON.parse(outputText), allowedCaptureIds)
  } catch {
    return validateGeneratedReportDraft(null, allowedCaptureIds)
  }
}
