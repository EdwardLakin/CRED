import type { Json } from '@/lib/supabase/database.types'

export const CAPTURE_CLASSIFICATION_MODEL = 'gpt-4.1-mini'

export const CAPTURE_CLASSIFICATION_TYPES = [
  'registration',
  'vin_plate',
  'license_plate',
  'unit_number',
  'inspection_sheet',
  'work_order',
  'odometer',
  'hour_meter',
  'info_plate',
  'damage_or_defect',
  'general_field_photo',
  'other_document',
  'unknown',
] as const

export type CaptureClassificationType = (typeof CAPTURE_CLASSIFICATION_TYPES)[number]
export type CvipRelevance = 'required' | 'supporting' | 'optional' | 'unknown'

export type CaptureClassificationResult = {
  detected_type: CaptureClassificationType
  confidence: number
  label: string
  reason: string
  cvip_relevance: CvipRelevance
}

const CVIP_RELEVANCE_VALUES: CvipRelevance[] = ['required', 'supporting', 'optional', 'unknown']
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'

const CLASSIFICATION_LABELS: Record<CaptureClassificationType, string> = {
  registration: 'Registration',
  vin_plate: 'VIN Plate',
  license_plate: 'Licence Plate',
  unit_number: 'Unit Number',
  inspection_sheet: 'Inspection Sheet',
  work_order: 'Work Order',
  odometer: 'Odometer',
  hour_meter: 'Hour Meter',
  info_plate: 'Info Plate',
  damage_or_defect: 'Damage or Defect',
  general_field_photo: 'General Field Photo',
  other_document: 'Other Document',
  unknown: 'Unknown',
}

const CLASSIFIER_SYSTEM_PROMPT = `You classify captured evidence images for CRED CVIP/commercial inspection workflows.
Return JSON only, no markdown.
Choose exactly one detected_type from the allowed list.
Use unknown if the image is too blurry, cropped, dark, or ambiguous.
Do not perform OCR extraction. Only classify the image category.

Allowed detected_type values:
registration, vin_plate, license_plate, unit_number, inspection_sheet, work_order, odometer, hour_meter, info_plate, damage_or_defect, general_field_photo, other_document, unknown.

Definitions:
registration: vehicle registration document/card.
vin_plate: VIN label/plate or stamped VIN.
license_plate: exterior vehicle plate.
unit_number: fleet/unit number decal or label.
inspection_sheet: CVIP/checklist/inspection form.
work_order: repair order/work order/document from shop system.
odometer: dashboard mileage/odometer.
hour_meter: engine/equipment hours display.
info_plate: manufacturer/data/compliance plate showing ratings, model, serial, GVWR/GAWR, tire/loading info, etc.
damage_or_defect: visible failed/damaged/worn/broken/leaking/unsafe condition.
general_field_photo: context/supporting photo with no specific document/plate/defect.
other_document: document that is not clearly registration, inspection sheet, or work order.
unknown: unclear image.

Use cvip_relevance required for evidence usually required in CVIP/commercial inspection records, supporting for helpful evidence, optional for context-only images, and unknown when unclear.`

const CLASSIFIER_USER_TEXT = `Classify this image for a CVIP/commercial inspection evidence workflow.
Return exactly this JSON shape:
{"detected_type":"...","confidence":0.0,"label":"...","reason":"...","cvip_relevance":"required|supporting|optional|unknown"}`

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

function isCaptureClassificationType(value: unknown): value is CaptureClassificationType {
  return typeof value === 'string' && CAPTURE_CLASSIFICATION_TYPES.includes(value as CaptureClassificationType)
}

function isCvipRelevance(value: unknown): value is CvipRelevance {
  return typeof value === 'string' && CVIP_RELEVANCE_VALUES.includes(value as CvipRelevance)
}

function sanitizeShortText(value: unknown, fallback: string, maxLength = 180) {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed ? trimmed.slice(0, maxLength) : fallback
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

      if (typeof contentItem.text === 'string') {
        return [contentItem.text]
      }

      return []
    })
  })

  return textParts.length > 0 ? textParts.join('\n') : null
}

export function getUnknownClassificationResult(reason = 'Classification could not be completed.'): CaptureClassificationResult {
  return {
    detected_type: 'unknown',
    confidence: 0,
    label: CLASSIFICATION_LABELS.unknown,
    reason,
    cvip_relevance: 'unknown',
  }
}

export function validateCaptureClassification(value: unknown): CaptureClassificationResult {
  if (!isRecord(value)) {
    return getUnknownClassificationResult('Classifier response was not valid JSON.')
  }

  const detectedType = isCaptureClassificationType(value.detected_type) ? value.detected_type : 'unknown'
  const confidence = clampConfidence(value.confidence)
  const label = sanitizeShortText(value.label, CLASSIFICATION_LABELS[detectedType], 80)
  const reason = sanitizeShortText(value.reason, 'Image classified from visual evidence.')
  const cvipRelevance = isCvipRelevance(value.cvip_relevance) ? value.cvip_relevance : 'unknown'

  return {
    detected_type: detectedType,
    confidence,
    label,
    reason,
    cvip_relevance: cvipRelevance,
  }
}

export function buildClassifiedImageData(
  existingData: Json | null,
  classification: CaptureClassificationResult,
  status: 'classified' | 'needs_review',
): Json {
  const existingObject = isRecord(existingData) ? existingData : {}

  return {
    ...existingObject,
    kind: 'classified_image',
    classification: {
      status,
      detected_type: classification.detected_type,
      confidence: classification.confidence,
      label: classification.label,
      reason: classification.reason,
      cvip_relevance: classification.cvip_relevance,
    },
    extraction: {
      status: 'not_started',
    },
  }
}

export function getCaptureClassificationSummary(classification: CaptureClassificationResult) {
  return `${classification.label} (${Math.round(classification.confidence * 100)}% confidence): ${classification.reason}`
}

export async function classifyCaptureImage(signedImageUrl: string): Promise<CaptureClassificationResult> {
  const apiKey = getOpenAiApiKey()

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY_MISSING')
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CAPTURE_CLASSIFICATION_MODEL,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: CLASSIFIER_SYSTEM_PROMPT }],
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: CLASSIFIER_USER_TEXT },
            { type: 'input_image', image_url: signedImageUrl },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'capture_image_classification',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              detected_type: { type: 'string', enum: CAPTURE_CLASSIFICATION_TYPES },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              label: { type: 'string' },
              reason: { type: 'string' },
              cvip_relevance: { type: 'string', enum: CVIP_RELEVANCE_VALUES },
            },
            required: ['detected_type', 'confidence', 'label', 'reason', 'cvip_relevance'],
          },
        },
      },
      max_output_tokens: 300,
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
    return getUnknownClassificationResult('Classifier response was empty.')
  }

  try {
    return validateCaptureClassification(JSON.parse(outputText))
  } catch {
    return getUnknownClassificationResult('Classifier response could not be parsed.')
  }
}
