import type { Json } from '@/lib/supabase/database.types'

import { type CaptureClassificationType } from './capture-classifier'

type ExtractionTargetType = CaptureClassificationType | 'other'
type SourceDocumentContext = { type: string; label: string; status: string } | null

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
] as const

export type CaptureExtractionField = (typeof CAPTURE_EXTRACTION_FIELDS)[number]
export type CaptureExtractionFields = Record<CaptureExtractionField, string | null>

export type CaptureExtractionResult = {
  summary: string
  confidence: number
  fields: CaptureExtractionFields
  notes: string[]
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const MAX_NOTES = 6

const EMPTY_FIELDS = Object.fromEntries(CAPTURE_EXTRACTION_FIELDS.map((field) => [field, null])) as CaptureExtractionFields

const EXTRACTION_SYSTEM_PROMPT = `You extract cautious structured text from CRED classified captures for commercial vehicle/equipment documentation and field service reports.
Return JSON only, no markdown.
Use null for any field that is not visible, unclear, or supported by technician context. Technician note/transcript is high-value context for location, component, measurement, condition, recommendation, and severity, but do not blindly override image evidence.
Do not invent values. Preserve exact VIN, plate, unit, serial, and reference strings as shown.
VIN values must be exactly 17 characters after removing spaces. If a possible VIN is not exactly 17 characters or is uncertain, put it in notes instead of vin.
For unit number, extract fleet/unit decals or obvious unit identifiers.
For field order photos, work order screenshots, data plates, odometer photos, handwritten/typed notes, and voice transcript context, extract service-report details when clearly visible or directly stated: complaint, cause of failure, correction, work order number, purchase order number, customer name, unit number, licence number, equipment serial/VIN, hours/kms, odometer, technician findings, and recommendations. For work orders, extract work order number and customer/unit/VIN only if clearly visible.
For hour meters, put the hour reading in hour_meter; the app may suggest it to the odometer/session reading if no hour field exists.
Keep summary brief and human readable. For brake_measurement, always populate component, location, measurement, condition, recommendation, and severity when visible or supported by technician context. Example note 'left front brake pads at wear limit of 2mm' should extract component brake pads, location left front, measurement 2mm, condition at wear limit, severity red, recommendation replace front brake pads when visually plausible.`

const TARGET_INSTRUCTIONS: Partial<Record<ExtractionTargetType, string>> = {
  unit_number: 'Source Document: Unit Number. Prioritize unit_number and asset_label from fleet/unit decals or labels.',
  vin_plate: 'Source Document: VIN Plate. Prioritize vin, year, make/model when visible, manufacturer, GVWR, and GAWR. Return vin only when exactly 17 characters and clearly readable.',
  info_plate:
    'Source Document: Data Plate. Prioritize manufacturer, model, serial_number, unit_number, ratings/capacity, possible VIN, GVWR, GAWR, tire size, tire pressure/loading, and compliance text. Put long compliance/tire-loading text in notes if it does not fit a field.',
  work_order: 'Source Document: Work Order. Prioritize work_order_number, customer_name, unit_number, asset_label, complaint, job number, and date when clearly visible. Also capture VIN/serial, hours/kms, odometer, and typed or handwritten service notes when clear.',
  registration: 'Source Document: Registration. Prioritize registered_owner, plate_number, vin, year/make/model if visible, registration_number, and GVWR if present. Return customer_name only when a customer/account name is clearly indicated.',
  license_plate: 'Source Document: Licence Plate. Prioritize exact plate_number and jurisdiction if visible. Use null or notes for uncertain characters.',
  odometer: 'Source Document: Odometer. Prioritize odometer and hour_meter if present. Extract the reading exactly as displayed.',
  hour_meter: 'Focus on the hour meter reading exactly as displayed.',
  inspection_sheet: 'Focus on inspection/checklist title, visible date, inspector, and form type. Put inspector/checklist title in notes if no direct field fits.',
  brake_measurement: 'Extract brake component, location, exact measurement, condition, recommendation, and severity. Use technician note/transcript as strong context for brake pad/rotor/lining/caliper/shoe/drum measurements when visually plausible.',
  tire_tread_measurement: 'Extract tire location, tread measurement, condition, recommendation, and severity when present.',
  battery_test: 'Extract battery test result details including voltage/CCA/state of health in measurement or condition, plus recommendation and severity when present.',
  battery_condition: 'Extract physical battery condition details such as corrosion, terminal/post/cable issues, condition, recommendation, and severity.',
  fluid_level: 'Extract fluid type/component, location, level or measurement, condition, recommendation, and severity.',
  defect_photo: 'Extract visible defect component, location, condition, recommendation, and severity.',
  general_evidence: 'Extract only useful inspection details that are visible or strongly supported by technician context.',
  supporting_photo: 'Extract only clearly useful context details; leave unsupported fields null.',
  other: 'Source Document: Other. Extract any useful report/session fields cautiously. Use null for unclear values and needs_review language in notes for uncertainty.',
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

function sanitizeFields(value: unknown): CaptureExtractionFields {
  const record = isRecord(value) ? value : {}
  const fields = { ...EMPTY_FIELDS }

  for (const field of CAPTURE_EXTRACTION_FIELDS) {
    fields[field] = field === 'vin' ? sanitizeVin(record[field]) : sanitizeText(record[field], 180)
  }

  return fields
}

export function validateCaptureExtraction(value: unknown): CaptureExtractionResult {
  if (!isRecord(value)) {
    return {
      summary: 'No readable details extracted.',
      confidence: 0,
      fields: { ...EMPTY_FIELDS },
      notes: ['Extractor response was not valid JSON.'],
    }
  }

  const notes = Array.isArray(value.notes)
    ? value.notes.map((note) => sanitizeText(note, 220)).filter((note): note is string => Boolean(note)).slice(0, MAX_NOTES)
    : []

  return {
    summary: sanitizeText(value.summary, 180) ?? 'Extraction completed.',
    confidence: clampConfidence(value.confidence),
    fields: sanitizeFields(value.fields),
    notes,
  }
}

export function buildExtractedCaptureData(existingData: Json | null, extraction: CaptureExtractionResult, status: 'extracted' | 'needs_review'): Json {
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
    },
  }
}

export function getCaptureExtractionSummary(extraction: CaptureExtractionResult) {
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

  const targetInstruction = TARGET_INSTRUCTIONS[detectedType] ?? 'Extract only clearly visible useful inspection, document, asset, or evidence details.'
  const sourceDocumentContext = sourceDocument
    ? `\nSource document tag selected by technician: ${sourceDocument.label} (${sourceDocument.type}). Prioritize identity/session fields for this source document, but do not force extraction if unclear. Use null for unsupported fields and notes for values that need review.`
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
              text: `Classified capture type: ${detectedType}. ${targetInstruction}${sourceDocumentContext}${note ? `\nTechnician note/transcript: "${note.slice(0, 1000)}". Use it as strong context while checking visual consistency.` : ''}\nReturn exactly the JSON schema fields.`,
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
                  CAPTURE_EXTRACTION_FIELDS.map((field) => [field, { type: ['string', 'null'] }]),
                ),
                required: CAPTURE_EXTRACTION_FIELDS,
              },
              notes: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['summary', 'confidence', 'fields', 'notes'],
          },
        },
      },
      max_output_tokens: 1400,
    }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message = isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
      ? body.error.message
      : `OpenAI request failed with status ${response.status}`
    const code = isRecord(body) && isRecord(body.error) && typeof body.error.code === 'string' ? body.error.code : undefined
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
    return validateCaptureExtraction(JSON.parse(outputText))
  } catch {
    return validateCaptureExtraction(null)
  }
}
