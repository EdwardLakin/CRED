import type { Json } from '@/lib/supabase/database.types'

import { type CaptureClassificationType } from './capture-classifier'

type ExtractionTargetType = CaptureClassificationType | 'other'
type SourceDocumentContext = {
  type: string
  label: string
  status: string
} | null

export const CAPTURE_EXTRACTION_MODEL = 'gpt-4.1-mini'

export const CAPTURE_EXTRACTION_FIELDS = [
  'location',
  'component',
  'measurement',
  'condition',
  'recommendation',
  'severity',
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
  'complaint',
  'cause_of_failure',
  'correction',
  'technician_notes',
  'recommendations',
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
  'voltage',
  'current_draw',
  'cca',
  'ripple_voltage',
  'meter_reading',
] as const

export type CaptureExtractionField = (typeof CAPTURE_EXTRACTION_FIELDS)[number]
export type CaptureExtractionFields = Record<
  CaptureExtractionField,
  string | null
>

export type CaptureExtractedValue = { value: string; confidence: number }

export type CaptureExtractionResult = {
  summary: string
  confidence: number
  fields: CaptureExtractionFields
  notes: string[]
  extracted_text: string | null
  extracted_values: Record<string, CaptureExtractedValue>
  generated_note: string | null
  generated_observation: string | null
  generated_recommendation: string | null
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const MAX_NOTES = 6

const EMPTY_FIELDS = Object.fromEntries(
  CAPTURE_EXTRACTION_FIELDS.map((field) => [field, null]),
) as CaptureExtractionFields

const EXTRACTION_SYSTEM_PROMPT = `You extract cautious structured text from CRED classified captures for commercial vehicle/equipment documentation and field service reports.
Return JSON only, no markdown.
Use null for any field that is not visible, unclear, or supported by technician context. Technician note/transcript is high-value context for evidence captures, but do not blindly override image evidence.
Do not invent values. Preserve exact VIN, plate, unit, serial, and reference strings as shown.
VIN values must be exactly 17 characters after removing spaces. If a possible VIN is not exactly 17 characters or is uncertain, put it in notes instead of vin.
For unit number, extract fleet/unit decals or obvious unit identifiers.
Source documents are used for identity/header context. Do not convert work order line descriptions or prior comments into findings unless the technician note explicitly asks to include them.
For source document captures such as work_order, registration, VIN plate, data plate, odometer, licence plate, and unit number, extract only identity/context fields when visible: customer/account name, VIN, unit number, asset id/label, licence plate, odometer, hours, work order number, purchase order number, job number, date, year, make, model, manufacturer, serial number, GVWR/GAWR, registered owner, and jurisdiction/province.
For source documents, do not extract complaint, cause of failure, correction, job line descriptions, labour operations, parts lines, historic notes, prior recommendations, unrelated comments, or report findings into condition/recommendation/technician note fields unless the technician note explicitly says to use the document content as a finding (for example “use this as finding” or “include line 3”).
For hour meters, put the hour reading in hour_meter; the app may suggest it to the odometer/session reading if no hour field exists.
Extract raw OCR text into extracted_text, including printed reports and handwritten notes where possible. Put numeric readings and units in extracted_values using normalized keys such as voltage, current_draw, cca, ripple_voltage, resistance, tire_tread_depth, brake_lining, odometer, hour_meter, or meter_reading. Generate a concise technician-style generated_note that describes what the evidence shows without overwriting any technician-entered note.
Keep summary brief and human readable. For brake_measurement, always populate component, location, measurement, condition, recommendation, and severity when visible or supported by technician context. Example note 'left front brake pads at wear limit of 2mm' should extract component brake pads, location left front, measurement 2mm, condition at wear limit, severity red, recommendation replace front brake pads when visually plausible.`

const TARGET_INSTRUCTIONS: Partial<Record<ExtractionTargetType, string>> = {
  unit_number:
    'Source Document: Unit Number. Prioritize unit_number and asset_label from fleet/unit decals or labels.',
  vin_plate:
    'Source Document: VIN Plate. Prioritize vin, year, make/model when visible, manufacturer, GVWR, and GAWR. Return vin only when exactly 17 characters and clearly readable.',
  info_plate:
    'Source Document: Data Plate. Prioritize manufacturer, model, serial_number, unit_number, ratings/capacity, possible VIN, GVWR, GAWR, tire size, tire pressure/loading, and compliance text. Put long compliance/tire-loading text in notes if it does not fit a field.',
  work_order:
    'Source Document: Work Order. Prioritize identity/header fields only: work_order_number, purchase_order_number, job_number, customer_name, unit_number, asset_label, VIN/serial, hours/kms, odometer, and date when clearly visible. Do not extract complaints, corrections, line descriptions, labour/parts lines, prior notes, or recommendations as findings unless the technician note explicitly asks to include them.',
  registration:
    'Source Document: Registration. Prioritize registered_owner, plate_number, vin, year/make/model if visible, registration_number, and GVWR if present. Return customer_name only when a customer/account name is clearly indicated.',
  license_plate:
    'Source Document: Licence Plate. Prioritize exact plate_number and jurisdiction if visible. Use null or notes for uncertain characters.',
  odometer:
    'Source Document: Odometer. Prioritize odometer and hour_meter if present. Extract the reading exactly as displayed.',
  hour_meter: 'Focus on the hour meter reading exactly as displayed.',
  inspection_sheet:
    'Focus on inspection/checklist title, visible date, inspector, and form type. Put inspector/checklist title in notes if no direct field fits.',
  brake_measurement:
    'Extract brake component, location, exact measurement, condition, recommendation, and severity. Use technician note/transcript as strong context for brake pad/rotor/lining/caliper/shoe/drum measurements when visually plausible.',
  tire_tread_measurement:
    'Extract tire location, tread measurement, condition, recommendation, and severity when present.',
  battery_tester:
    'Extract battery tester result details including voltage, CCA, state of health, state of charge, ripple voltage, result status, and recommendation when present.',
  battery_test:
    'Extract battery test result details including voltage/CCA/state of health in measurement or condition, plus recommendation and severity when present.',
  multimeter:
    'Extract multimeter display readings, numeric values, units, measurement mode, probe/component context, and whether the reading appears acceptable when visible.',
  amp_clamp:
    'Extract amp clamp current readings, units, key-off/current draw context, and whether the reading appears acceptable when visible.',
  oscilloscope:
    'Extract oscilloscope waveform labels, voltage/time scales, measured values, and visible signal observations when present.',
  diagnostic_scan_report:
    'Extract diagnostic scan report details including fault codes, modules, statuses, printed readings, and recommendations when clearly visible.',
  battery_condition:
    'Extract physical battery condition details such as corrosion, terminal/post/cable issues, condition, recommendation, and severity.',
  vehicle_component:
    'Extract visible component name, location, condition, observation, and recommendation when clear.',
  corrosion:
    'Extract corroded component/location, severity, condition, and cleaning/repair recommendation when clear.',
  fluid_leak:
    'Extract fluid type if identifiable, leak location, severity/condition, observation, and recommendation when clear.',
  fluid_level:
    'Extract fluid type/component, location, level or measurement, condition, recommendation, and severity.',
  tire: 'Extract tire location, visible condition, tread/sidewall observations, DOT/size if visible, and recommendation when clear.',
  brake_component:
    'Extract brake component, location, condition, visible wear/damage observations, and recommendation when clear.',
  suspension_component:
    'Extract suspension component, location, condition, visible wear/damage observations, and recommendation when clear.',
  defect_photo:
    'Extract visible defect component, location, condition, recommendation, and severity.',
  general_equipment_photo:
    'Extract only visible equipment/vehicle context and useful observations; leave unsupported fields null.',
  general_evidence:
    'Extract only useful inspection details that are visible or strongly supported by technician context.',
  supporting_photo:
    'Extract only clearly useful context details; leave unsupported fields null.',
  other:
    'Source Document: Other. Extract identity/header fields cautiously. Do not extract source document comments as report findings unless the technician note explicitly asks to include them. Use null for unclear values and needs_review language in notes for uncertainty.',
}

const SOURCE_DOCUMENT_CAPTURE_TYPES = new Set<ExtractionTargetType>([
  'unit_number',
  'vin_plate',
  'info_plate',
  'work_order',
  'registration',
  'license_plate',
  'odometer',
])

const SOURCE_DOCUMENT_FINDING_FIELDS: CaptureExtractionField[] = [
  'location',
  'component',
  'measurement',
  'condition',
  'recommendation',
  'severity',
  'complaint',
  'cause_of_failure',
  'correction',
  'technician_notes',
  'recommendations',
]

const SOURCE_DOCUMENT_INCLUDE_PATTERNS = [
  /\buse\s+(this|document|line|item|note|comment)\s+as\s+(a\s+)?finding\b/i,
  /\binclude\s+(this|document|line|item|note|comment|finding|recommendation|complaint|correction)\b/i,
  /\badd\s+(this|document|line|item|note|comment)\s+to\s+(the\s+)?(report|findings|recommendations)\b/i,
  /\btreat\s+(this|document|line|item|note|comment)\s+as\s+(a\s+)?finding\b/i,
]

function technicianExplicitlyIncludesSourceFinding(note?: string | null) {
  if (!note) {
    return false
  }

  return SOURCE_DOCUMENT_INCLUDE_PATTERNS.some((pattern) => pattern.test(note))
}

function isSourceDocumentExtraction(
  detectedType: ExtractionTargetType,
  sourceDocument?: SourceDocumentContext,
) {
  return (
    Boolean(sourceDocument) || SOURCE_DOCUMENT_CAPTURE_TYPES.has(detectedType)
  )
}

function constrainSourceDocumentExtraction(
  extraction: CaptureExtractionResult,
  detectedType: ExtractionTargetType,
  note?: string | null,
  sourceDocument?: SourceDocumentContext,
): CaptureExtractionResult {
  if (
    !isSourceDocumentExtraction(detectedType, sourceDocument) ||
    technicianExplicitlyIncludesSourceFinding(note)
  ) {
    return extraction
  }

  const fields = { ...extraction.fields }
  for (const field of SOURCE_DOCUMENT_FINDING_FIELDS) {
    fields[field] = null
  }

  return {
    ...extraction,
    fields,
    notes: [
      'Source document extraction limited to identity/header context. Work order lines, prior comments, complaints, corrections, and recommendations were not promoted to findings.',
      ...extraction.notes,
    ].slice(0, MAX_NOTES),
  }
}

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() ?? ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampConfidence(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(numberValue)) {
    return 0
  }

  return Math.min(1, Math.max(0, numberValue))
}

function sanitizeText(value: unknown, maxLength = 220) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function sanitizeVin(value: unknown) {
  const text = sanitizeText(value, 32)

  if (!text) {
    return null
  }

  const compact = text.replace(/\s+/g, '').toUpperCase()
  return compact.length === 17 ? compact : null
}

function extractOutputText(response: unknown) {
  if (!isRecord(response)) {
    return null
  }

  if (typeof response.output_text === 'string') {
    return response.output_text
  }

  const output = Array.isArray(response.output) ? response.output : []
  const textParts = output.flatMap((item) => {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      return []
    }

    return item.content.flatMap((contentItem) => {
      if (!isRecord(contentItem)) {
        return []
      }

      return typeof contentItem.text === 'string' ? [contentItem.text] : []
    })
  })

  return textParts.length > 0 ? textParts.join('\n') : null
}

function sanitizeExtractedValues(
  value: unknown,
): Record<string, CaptureExtractedValue> {
  if (!isRecord(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => {
        const normalizedKey = key
          .replace(/[^a-zA-Z0-9_]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .toLowerCase()
          .slice(0, 60)
        if (!normalizedKey) {
          return null
        }

        if (isRecord(entry)) {
          const text =
            sanitizeText(entry.value, 120) ?? sanitizeText(entry.reading, 120)
          if (!text) {
            return null
          }
          return [
            normalizedKey,
            {
              value: text,
              confidence: clampConfidence(entry.confidence) || 0.5,
            },
          ] as const
        }

        const text = sanitizeText(entry, 120)
        return text
          ? ([normalizedKey, { value: text, confidence: 0.5 }] as const)
          : null
      })
      .filter((entry): entry is readonly [string, CaptureExtractedValue] =>
        Boolean(entry),
      ),
  )
}

function sanitizeFields(value: unknown): CaptureExtractionFields {
  const record = isRecord(value) ? value : {}
  const fields = { ...EMPTY_FIELDS }

  for (const field of CAPTURE_EXTRACTION_FIELDS) {
    fields[field] =
      field === 'vin'
        ? sanitizeVin(record[field])
        : sanitizeText(record[field], 180)
  }

  return fields
}

export function validateCaptureExtraction(
  value: unknown,
): CaptureExtractionResult {
  if (!isRecord(value)) {
    return {
      summary: 'No readable details extracted.',
      confidence: 0,
      fields: { ...EMPTY_FIELDS },
      notes: ['Extractor response was not valid JSON.'],
      extracted_text: null,
      extracted_values: {},
      generated_note: null,
      generated_observation: null,
      generated_recommendation: null,
    }
  }

  const notes = Array.isArray(value.notes)
    ? value.notes
        .map((note) => sanitizeText(note, 220))
        .filter((note): note is string => Boolean(note))
        .slice(0, MAX_NOTES)
    : []

  return {
    summary: sanitizeText(value.summary, 180) ?? 'Extraction completed.',
    confidence: clampConfidence(value.confidence),
    fields: sanitizeFields(value.fields),
    notes,
    extracted_text: sanitizeText(value.extracted_text, 4000),
    extracted_values: sanitizeExtractedValues(value.extracted_values),
    generated_note: sanitizeText(value.generated_note, 600),
    generated_observation: sanitizeText(value.generated_observation, 600),
    generated_recommendation: sanitizeText(value.generated_recommendation, 600),
  }
}

export function buildExtractedCaptureData(
  existingData: Json | null,
  extraction: CaptureExtractionResult,
  status: 'extracted' | 'needs_review',
): Json {
  const existingObject = isRecord(existingData) ? existingData : {}

  const sourceDocument = isRecord(existingObject.source_document)
    ? {
        ...existingObject.source_document,
        status: status === 'extracted' ? 'extracted' : 'needs_review',
      }
    : undefined

  return {
    ...existingObject,
    ...(sourceDocument ? { source_document: sourceDocument } : {}),
    extraction: {
      status,
      fields: extraction.fields,
      summary: extraction.summary,
      confidence: extraction.confidence,
      notes: extraction.notes,
      extracted_text: extraction.extracted_text,
      extracted_values: extraction.extracted_values,
      generated_note: extraction.generated_note,
      generated_observation: extraction.generated_observation,
      generated_recommendation: extraction.generated_recommendation,
    },
    capture_ai_analysis: buildCaptureAiAnalysis(
      existingObject,
      extraction,
      status,
    ),
  }
}

export function buildCaptureAiAnalysis(
  existingData: Json | null,
  extraction: CaptureExtractionResult,
  status: 'extracted' | 'needs_review' | 'failed' | 'processing' | 'pending',
): Json {
  const existingObject = isRecord(existingData) ? existingData : {}
  const classification = isRecord(existingObject.classification)
    ? existingObject.classification
    : {}
  const detectedType =
    typeof classification.detected_type === 'string'
      ? classification.detected_type
      : null
  const classificationConfidence =
    typeof classification.confidence === 'number'
      ? classification.confidence
      : null

  return {
    classification: detectedType,
    confidence: classificationConfidence ?? extraction.confidence,
    extracted_text: extraction.extracted_text,
    extracted_values: extraction.extracted_values,
    generated_note: extraction.generated_note,
    generated_observation: extraction.generated_observation,
    generated_recommendation: extraction.generated_recommendation,
    ai_status: status,
    analyzed_at: new Date().toISOString(),
  }
}

export function getCaptureExtractionSummary(
  extraction: CaptureExtractionResult,
) {
  return `${extraction.summary} (${Math.round(extraction.confidence * 100)}% confidence)`
}

export async function extractCaptureImageDetails(
  signedImageUrl: string,
  detectedType: ExtractionTargetType,
  note?: string | null,
  sourceDocument?: SourceDocumentContext,
): Promise<CaptureExtractionResult> {
  const apiKey = getOpenAiApiKey()

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY_MISSING')
  }

  const targetInstruction =
    TARGET_INSTRUCTIONS[detectedType] ??
    'Extract only clearly visible useful inspection, document, asset, or evidence details.'
  const sourceDocumentContext = sourceDocument
    ? `\nSource document tag selected by technician: ${sourceDocument.label} (${sourceDocument.type}). Prioritize identity/session/header fields only for this source document, but do not force extraction if unclear. Do not convert work order line descriptions, complaints, corrections, prior recommendations, labour/parts lines, or historic comments into findings unless the technician note explicitly asks to include them. Use null for unsupported fields and notes for values that need review.`
    : ''

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CAPTURE_EXTRACTION_MODEL,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: EXTRACTION_SYSTEM_PROMPT }],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Classified capture type: ${detectedType}. ${targetInstruction}${sourceDocumentContext}${note ? `\nTechnician note/transcript: "${note.slice(0, 1000)}". Use it as strong context while checking visual consistency. For source documents, only use document content as findings if this note explicitly asks to include it.` : ''}\nReturn exactly the JSON schema fields.`,
            },
            { type: 'input_image', image_url: signedImageUrl },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'capture_detail_extraction',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              summary: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              fields: {
                type: 'object',
                additionalProperties: false,
                properties: Object.fromEntries(
                  CAPTURE_EXTRACTION_FIELDS.map((field) => [
                    field,
                    { type: ['string', 'null'] },
                  ]),
                ),
                required: CAPTURE_EXTRACTION_FIELDS,
              },
              notes: {
                type: 'array',
                items: { type: 'string' },
              },
              extracted_text: { type: ['string', 'null'] },
              extracted_values: {
                type: 'object',
                additionalProperties: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    value: { type: 'string' },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                  },
                  required: ['value', 'confidence'],
                },
              },
              generated_note: { type: ['string', 'null'] },
              generated_observation: { type: ['string', 'null'] },
              generated_recommendation: { type: ['string', 'null'] },
            },
            required: [
              'summary',
              'confidence',
              'fields',
              'notes',
              'extracted_text',
              'extracted_values',
              'generated_note',
              'generated_observation',
              'generated_recommendation',
            ],
          },
        },
      },
      max_output_tokens: 1400,
    }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message =
      isRecord(body) &&
      isRecord(body.error) &&
      typeof body.error.message === 'string'
        ? body.error.message
        : `OpenAI request failed with status ${response.status}`
    const code =
      isRecord(body) &&
      isRecord(body.error) &&
      typeof body.error.code === 'string'
        ? body.error.code
        : undefined
    const error = new Error(message)
    if (code) {
      error.name = code
    }
    throw error
  }

  const body = await response.json()
  const outputText = extractOutputText(body)

  if (!outputText) {
    return validateCaptureExtraction(null)
  }

  try {
    return constrainSourceDocumentExtraction(
      validateCaptureExtraction(JSON.parse(outputText)),
      detectedType,
      note,
      sourceDocument,
    )
  } catch {
    return validateCaptureExtraction(null)
  }
}
