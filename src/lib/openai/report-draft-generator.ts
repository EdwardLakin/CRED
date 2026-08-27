import type { Json } from '@/lib/supabase/database.types'

export const AI_REPORT_DRAFT_MODEL = 'gpt-4.1-mini'
export const AI_REPORT_DRAFT_PROMPT_VERSION = 'form-evidence-report-v6'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const MAX_SECTIONS = 24
const MAX_ARRAY_ITEMS = 60
const SECTION_STATUSES = ['pass', 'fail', 'recommended', 'na', 'needs_review', 'informational'] as const

const NULLABLE_STRING_FIELD = { type: ['string', 'null'] } as const
const MEASUREMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: NULLABLE_STRING_FIELD,
    component: NULLABLE_STRING_FIELD,
    location: NULLABLE_STRING_FIELD,
    value: NULLABLE_STRING_FIELD,
    unit: NULLABLE_STRING_FIELD,
    status: NULLABLE_STRING_FIELD,
    source_capture_id: NULLABLE_STRING_FIELD,
    notes: NULLABLE_STRING_FIELD,
  },
  required: ['label', 'component', 'location', 'value', 'unit', 'status', 'source_capture_id', 'notes'],
} as const
const FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: NULLABLE_STRING_FIELD,
    component: NULLABLE_STRING_FIELD,
    location: NULLABLE_STRING_FIELD,
    condition: NULLABLE_STRING_FIELD,
    severity: NULLABLE_STRING_FIELD,
    recommendation: NULLABLE_STRING_FIELD,
    source_capture_id: NULLABLE_STRING_FIELD,
    notes: NULLABLE_STRING_FIELD,
  },
  required: ['title', 'component', 'location', 'condition', 'severity', 'recommendation', 'source_capture_id', 'notes'],
} as const
const UNMAPPED_EVIDENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    source_capture_id: NULLABLE_STRING_FIELD,
    label: NULLABLE_STRING_FIELD,
    summary: NULLABLE_STRING_FIELD,
    evidence_type: NULLABLE_STRING_FIELD,
    notes: NULLABLE_STRING_FIELD,
    suggested_section: NULLABLE_STRING_FIELD,
  },
  required: ['source_capture_id', 'label', 'summary', 'evidence_type', 'notes', 'suggested_section'],
} as const

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

const REPORT_DRAFT_SYSTEM_PROMPT = `You generate editable drafts for CRED item-first, form-structured reports.
Return JSON only, no markdown.
If a captured source document/form/report/template/checklist exists, use that uploaded document as the report structure. Extract or infer its sections, labels, and field groups generically from that document; do not require or invent a form type selection. Use any selected context only as secondary terminology.
If no structure-defining document exists, use a generic documentation report structure only. Photos, meter screenshots, component photos, videos, voice notes, text notes, and general captured items must not suggest the report title/type, findings, recommendations, severity, components, or observed conditions unless technician-authored notes/transcripts or user-verified fields explicitly provide that content.
Technicians capture items naturally; synthesize technician-captured items into a professional, human-reviewable draft instead of dumping captures.
Do not invent unsupported facts.
Customer-facing titles, headings, summaries, findings, recommendations, and labels must use Item, Items, Documentation, Source, or Sources as appropriate. Never use the word "evidence" in customer-facing report copy.
Executive summary rules are strict:
- Summarize only technician-authored notes, voice transcripts, verified user-entered fields, and explicit source-document text.
- Write one calm, objective, professional paragraph of 100–150 words that reads like a commercial inspection or property condition report.
- Start by stating what the report documents and mention the observation count when available.
- Group observations into broad documented themes instead of rewriting each defect; do not create Observation 1 / Observation 2 lists and do not use the phrase "Key issues include".
- Describe overall condition and overall impression neutrally, then direct the reader to the detailed observations.
- Do not say recommendations, repairs, replacement, monitoring, corrective actions, severity, urgency, diagnosis, conclusions, or follow-up are provided unless those ideas are explicitly present in technician-authored or verified source text.
- Do not claim that visual content independently proves, confirms, diagnoses, or establishes a condition.
- Use neutral wording such as documents, records, includes, and technician observed.
- If no technician-authored recommendation exists, the summary must describe observations only and must not mention recommendations.
Executive-summary grounding is strict:
- Do not mention captures identified as tests, samples, demos, upload checks, or non-report material.
- Do not mention that excluded test material exists.
- Do not add negative observations such as "no visible damage", "no apparent damage", "no other defects", or "otherwise normal" unless that exact meaning is explicitly technician-authored.
- Do not broaden a location. For example, a note about a ceiling must not become "ceiling and walls".
- Do not convert image appearance into a factual statement.
- Every condition and location named in the summary must be supported by technician-authored text, verified user-entered fields, or explicit source-document text.
Technician Truth precedence is mandatory: technician notes, manual captions, voice transcripts, and verified findings are primary source-of-truth observations. You may organize and summarize them, but must not replace, reinterpret, embellish, overwrite, or contradict technician-provided observations.
Prioritize draft inputs in this order: 1) technician notes/manual captions/voice transcripts/verified findings on captured items, 2) OCR/text extracted from uploaded source documents/forms/reports/images, 3) verified form fields, 4) selected Form Profile/report context. Do not create findings, recommendations, severity, components, or observed conditions from image interpretation, visual appearance, image classification, or unverified image-derived fields.
Source documents/forms provide the report skeleton, field labels, filled values, documented tester results, and neutral section summaries when OCR/text exists. OCR/text from a user-uploaded report/form/image is document truth; summarize it as documented/tester-reported, not as independent AI diagnosis. Do not convert prior work-order lines into findings unless technician-authored item notes or document text explicitly support them.
Each section should include metadata for form/item rendering when available: section_type ('form_section' or the compatibility key 'evidence_group'), source_field_group, fields [{key,label,value,source_capture_id}], related_capture_ids, observations, findings, recommendations. Attach findings/recommendations to the source item capture IDs that support them.
Every finding or recommendation must be based on technician-authored notes/transcripts, verified fields, or explicit OCR/document text and must reference those source_capture_ids. Do not invent unsupported findings/recommendations; if OCR states results such as GOOD BATTERY, STARTER SYSTEM CRANKING NORMAL, or CHARGING SYSTEM EXCESSIVE RIPPLE, phrase them as documented/tester-reported results.
Use needs_review when uncertain or when documentation is incomplete.
Organize around captured form/report/template/checklist sections first when a structure-defining document is present, then supporting items. When no structure-defining document is present, organize into the generic CRED documentation report structure: Report Summary, Items Captured, Technician Notes, Findings, Recommendations, Final Summary / Report Notes, Inspector / Facility Details, Signoff.
Do not claim official CVIP/compliance completion, automatic compliance, or final inspection approval.
Do not assume pass/fail status for unmentioned items.
Never use visual guesswork for location, component, measurement, condition, severity, finding, or recommendation.
Preserve original technician wording wherever it states an observation, finding, measurement, or recommendation.
Include the unmapped_evidence compatibility field for captures that do not fit a section, but label that content as Unmapped Items in customer-facing copy.
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
  if (isRecord(extractedData.source_document)) return extractedData.source_document
  if (capture.media_kind === 'document' || capture.type === 'document') return { type: 'uploaded_document', label: 'Uploaded document' }
  if ((capture.ocr_text?.trim() || getExtractedDocumentText(capture)) && (capture.type === 'document' || capture.media_kind === 'image')) {
    return { type: 'uploaded_image_document', label: 'Uploaded image/document OCR' }
  }
  return null
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
    ocr_text: capture.ocr_text,
    extracted_text: getExtractedDocumentText(capture),
    extracted_fields: fields,
    identity_fields: identityFields,
  }
}

function getExtractedDocumentText(capture: ReportDraftCaptureContext) {
  const extractedData = isRecord(capture.extracted_data) ? capture.extracted_data : {}
  const extraction = isRecord(extractedData.extraction) ? extractedData.extraction : {}
  const text = sanitizeText(extraction.text, 8000) ?? sanitizeText(extraction.extracted_text, 8000)
  return text
}

function isObviousTestCapture(capture: ReportDraftCaptureContext) {
  const text = [
    capture.technician_note,
    capture.transcript,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  return /\b(?:just\s+testing|test(?:ing)?\s+upload|upload\s+test(?:ing)?|sample\s+(?:image|upload|capture)|demo\s+(?:image|upload|capture))\b/i.test(
    text,
  )
}

function buildEvidenceDraftContext(capture: ReportDraftCaptureContext) {
  const hasTechnicianTruth = Boolean(capture.technician_note?.trim() || capture.transcript?.trim() || capture.type === 'text_note' || capture.media_kind === 'note' || capture.media_kind === 'audio')
  return {
    id: capture.id,
    type: capture.type,
    media_kind: capture.media_kind,
    captured_at: capture.captured_at,
    ai_status: capture.ai_status,
    technician_note: capture.technician_note,
    transcript: capture.transcript,
    extracted_data: hasTechnicianTruth ? capture.extracted_data : null,
    exclude_from_summary: isObviousTestCapture(capture),
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

function getSourceTruthText(input: GenerateReportDraftInput) {
  return input.captures
    .flatMap((capture) => [
      capture.technician_note,
      capture.transcript,
      capture.ocr_text,
      getExtractedDocumentText(capture),
    ])
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .join(' ')
}

function sourceSupportsRecommendationClaims(input: GenerateReportDraftInput) {
  const sourceText = getSourceTruthText(input)

  return /\b(?:recommend(?:ation|ations|ed|s)?|should|needs?\s+to|requires?\s+(?:repair|replacement|service|monitoring)|repair\s+(?:recommended|required)|replacement\s+(?:recommended|required)|monitoring\s+(?:recommended|required)|corrective\s+action|follow[- ]?up\s+(?:recommended|required))\b/i.test(
    sourceText,
  )
}

function sanitizeSummaryAgainstSourceTruth(
  summary: string | null,
  input: GenerateReportDraftInput,
) {
  if (!summary) return null
  if (sourceSupportsRecommendationClaims(input)) return summary

  const sentences =
    summary.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()) ??
    []

  const sourceText = getSourceTruthText(input).toLowerCase()

  const safeSentences = sentences
    .filter(
      (sentence) =>
        !/\b(?:recommendation|recommendations|recommended|repair and monitoring|repairs? (?:are|is) provided|monitoring (?:is|was|are) provided|corrective actions?|follow[- ]?up actions?)\b/i.test(
          sentence,
        ),
    )
    .filter(
      (sentence) =>
        !/\b(?:test uploads?|testing uploads?|sample uploads?|demo uploads?)\b/i.test(
          sentence,
        ),
    )
    .map((sentence) => {
      let cleaned = sentence

      if (
        !/\bno visible damage\b/i.test(sourceText)
      ) {
        cleaned = cleaned.replace(
          /\s*(?:,|;)?\s*with no visible damage\b/gi,
          '',
        )
      }

      if (
        !/\bno apparent damage\b/i.test(sourceText)
      ) {
        cleaned = cleaned.replace(
          /\s*(?:,|;)?\s*with no apparent damage\b/gi,
          '',
        )
      }

      return cleaned.replace(/\s+/g, ' ').trim()
    })
    .filter(Boolean)

  const safeSummary = safeSentences.join(' ').replace(/\s+/g, ' ').trim()
  return safeSummary || null
}

function applySourceTruthSummaryGuard(
  draft: GeneratedReportDraft,
  input: GenerateReportDraftInput,
): GeneratedReportDraft {
  return {
    ...draft,
    summary: sanitizeSummaryAgainstSourceTruth(draft.summary, input),
  }
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
      'Uploaded source documents/forms/reports/images with OCR or extracted text are report context. Use OCR/text and verified fields for title/type, report fields, neutral summaries, documented tester-reported results, findings, and recommendations only when explicitly stated. Never use visual image interpretation or image classification as factual truth.',
    report_context: input.reportContext,
    session: input.session,
    source_documents: sourceDocuments.map(buildSourceDocumentDraftContext),
    evidence: evidenceCaptures.map(buildEvidenceDraftContext),
    notes_and_transcripts: evidenceCaptures
      .filter(
        (capture) =>
          (capture.technician_note || capture.transcript) &&
          !isObviousTestCapture(capture),
      )
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
              text: `Create an editable CRED report draft from this context. Use captured form/report/template/checklist/source-document sections as the structure only when a structure-defining document is present. Otherwise use the generic documentation report structure and never infer the main layout from photos or image classifications. Keep captured items as the anchor: findings, recommendations, measurements, details, notes, and transcripts must attach to their source capture IDs where possible. Use Item, Items, Documentation, Source, or Sources in customer-facing copy; never use the word "evidence" there. Return the strict JSON shape only.\n${JSON.stringify(buildDraftContext(input)).slice(0, 70000)}`,
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
              header_fields: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  customer_name: { type: ['string', 'null'] },
                  contact_name: { type: ['string', 'null'] },
                  phone: { type: ['string', 'null'] },
                  email: { type: ['string', 'null'] },
                  unit_number: { type: ['string', 'null'] },
                  asset_label: { type: ['string', 'null'] },
                  vin: { type: ['string', 'null'] },
                  serial_number: { type: ['string', 'null'] },
                  model: { type: ['string', 'null'] },
                  work_order_number: { type: ['string', 'null'] },
                  purchase_order_number: { type: ['string', 'null'] },
                  date: { type: ['string', 'null'] },
                },
                required: ['customer_name', 'contact_name', 'phone', 'email', 'unit_number', 'asset_label', 'vin', 'serial_number', 'model', 'work_order_number', 'purchase_order_number', 'date'],
              },
              measurements: { type: 'array', items: MEASUREMENT_SCHEMA },
              findings: { type: 'array', items: FINDING_SCHEMA },
              coverage: { type: 'object', additionalProperties: false, properties: {} },
              unmapped_evidence: { type: 'array', items: UNMAPPED_EVIDENCE_SCHEMA },
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
                    metadata: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        source_field_group: { type: ['string', 'null'] },
                        related_capture_ids: { type: 'array', items: { type: 'string' } },
                        fields: {
                          type: 'array',
                          items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                              key: { type: ['string', 'null'] },
                              label: { type: ['string', 'null'] },
                              value: { type: ['string', 'null'] },
                              source_capture_id: { type: ['string', 'null'] },
                            },
                            required: ['key', 'label', 'value', 'source_capture_id'],
                          },
                        },
                      },
                      required: ['source_field_group', 'related_capture_ids', 'fields'],
                    },
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
  if (!outputText) {
    return applySourceTruthSummaryGuard(
      validateGeneratedReportDraft(null, allowedCaptureIds),
      input,
    )
  }

  try {
    return applySourceTruthSummaryGuard(
      validateGeneratedReportDraft(JSON.parse(outputText), allowedCaptureIds),
      input,
    )
  } catch {
    return applySourceTruthSummaryGuard(
      validateGeneratedReportDraft(null, allowedCaptureIds),
      input,
    )
  }
}
