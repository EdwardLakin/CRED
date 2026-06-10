import type { Json } from '@/lib/supabase/database.types'

import { type CaptureClassificationType } from './capture-classifier'

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
  'customer_name',
  'registration_number',
  'registered_owner',
  'manufacturer',
  'model',
  'serial_number',
  'gvwr',
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

const EXTRACTION_SYSTEM_PROMPT = `You extract cautious structured text from CRED classified captures for commercial vehicle/equipment documentation.
Return JSON only, no markdown.
Use null for any field that is not visible, unclear, or supported by technician context. Technician note/transcript is high-value context for location, component, measurement, condition, recommendation, and severity, but do not blindly override image evidence.
Do not invent values. Preserve exact VIN, plate, unit, serial, and reference strings as shown.
VIN values must be exactly 17 characters after removing spaces. If a possible VIN is not exactly 17 characters or is uncertain, put it in notes instead of vin.
For unit number, extract fleet/unit decals or obvious unit identifiers.
For work orders, extract work order number and customer/unit/VIN only if clearly visible.
For hour meters, put the hour reading in hour_meter; the app may suggest it to the odometer/session reading if no hour field exists.
Keep summary brief and human readable. Example note 'left front brake pads at wear limit of 2mm' should extract component brake pads, location left front, measurement 2mm, condition at wear limit, severity red, recommendation replace front brake pads when visually plausible.`

const TARGET_INSTRUCTIONS: Partial<Record<CaptureClassificationType, string>> = {
  unit_number: 'Focus on fleet/unit number decals or labels. Return unit_number and asset_label when the same visible value identifies the asset.',
  vin_plate: 'Focus on VIN labels, stamped VINs, and vehicle certification labels. Return vin only when exactly 17 characters and clearly readable.',
  info_plate:
    'Focus on manufacturer/data/compliance plate values including possible VIN, manufacturer, model, serial number, GVWR, GAWR, tire size, tire pressure/loading, and compliance text. Put long compliance/tire-loading text in notes if it does not fit a field.',
  work_order: 'Focus on work order/repair order number, customer name, unit number, and VIN if clearly visible.',
  registration: 'Focus on VIN, plate number, registered owner/customer, and registration number. Return registered_owner when the registration owner is clearly visible, and customer_name only when a customer/account name is clearly indicated.',
  license_plate: 'Focus on the exact license plate number only.',
  odometer: 'Focus on the mileage/odometer reading exactly as displayed.',
  hour_meter: 'Focus on the hour meter reading exactly as displayed.',
  inspection_sheet: 'Focus on inspection/checklist title, visible date, inspector, and form type. Put inspector/checklist title in notes if no direct field fits.',
  other_document: 'Focus on document title/type and obvious reference numbers. Put reference numbers in notes if no direct field fits.',
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

  return {
    ...existingObject,
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
  detectedType: CaptureClassificationType,
  note?: string | null,
): Promise<CaptureExtractionResult> {
  const apiKey = getOpenAiApiKey()

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY_MISSING')
  }

  const targetInstruction = TARGET_INSTRUCTIONS[detectedType] ?? 'Extract only clearly visible useful document or asset details.'

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
              text: `Classified capture type: ${detectedType}. ${targetInstruction}${note ? `\nTechnician note/transcript: "${note.slice(0, 1000)}". Use it as strong context while checking visual consistency.` : ''}\nReturn exactly the JSON schema fields.`,
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
      max_output_tokens: 900,
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
