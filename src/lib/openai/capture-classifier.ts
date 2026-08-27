import type { Json } from '@/lib/supabase/database.types'

export const CAPTURE_CLASSIFICATION_MODEL = 'gpt-4.1-mini'

export const CAPTURE_CLASSIFICATION_TYPES = [
  'vin_plate',
  'info_plate',
  'registration',
  'work_order',
  'inspection_sheet',
  'odometer',
  'hour_meter',
  'unit_number',
  'license_plate',
  'brake_measurement',
  'tire_tread_measurement',
  'battery_tester',
  'battery_test',
  'multimeter',
  'amp_clamp',
  'oscilloscope',
  'diagnostic_scan_report',
  'battery_condition',
  'vehicle_component',
  'corrosion',
  'fluid_leak',
  'fluid_level',
  'tire',
  'brake_component',
  'suspension_component',
  'defect_photo',
  'general_equipment_photo',
  'general_evidence',
  'supporting_photo',
  'unknown',
] as const

export type CaptureClassificationType =
  (typeof CAPTURE_CLASSIFICATION_TYPES)[number]
export type CvipRelevance = 'required' | 'supporting' | 'optional' | 'unknown'

export type CaptureClassificationResult = {
  detected_type: CaptureClassificationType
  confidence: number
  label: string
  reason: string
  cvip_relevance: CvipRelevance
}

const CVIP_RELEVANCE_VALUES: CvipRelevance[] = [
  'required',
  'supporting',
  'optional',
  'unknown',
]
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'

const CLASSIFICATION_LABELS: Record<CaptureClassificationType, string> = {
  vin_plate: 'VIN Plate',
  info_plate: 'Info Plate',
  registration: 'Registration',
  work_order: 'Work Order',
  inspection_sheet: 'Inspection Sheet',
  odometer: 'Odometer',
  hour_meter: 'Hour Meter',
  unit_number: 'Unit Number',
  license_plate: 'License Plate',
  brake_measurement: 'Brake Measurement',
  tire_tread_measurement: 'Tire Tread Measurement',
  battery_tester: 'Battery Tester',
  battery_test: 'Battery Test',
  multimeter: 'Multimeter',
  amp_clamp: 'Amp Clamp',
  oscilloscope: 'Oscilloscope',
  diagnostic_scan_report: 'Diagnostic Scan Report',
  battery_condition: 'Battery Condition',
  vehicle_component: 'Vehicle Component',
  corrosion: 'Corrosion',
  fluid_leak: 'Fluid Leak',
  fluid_level: 'Fluid Level',
  tire: 'Tire',
  brake_component: 'Brake Component',
  suspension_component: 'Suspension Component',
  defect_photo: 'Defect Photo',
  general_equipment_photo: 'General Equipment Photo',
  general_evidence: 'General Item',
  supporting_photo: 'Supporting Photo',
  unknown: 'Unknown',
}

const CLASSIFIER_SYSTEM_PROMPT = `You classify captured item images for CRED CVIP/commercial inspection workflows.
Return JSON only, no markdown.
Choose exactly one detected_type from the allowed list.
Treat technician_note/transcript as high-value inspection context, especially for component, location, and measurement. Do not blindly override visible content, but prefer the inspection item label when the note is specific and visually plausible.
Use unknown with low confidence if the image is too blurry, cropped, dark, or ambiguous.
Do not perform OCR extraction. Only classify the image/video still category.
Never return 0 confidence for a positive non-unknown classification.

Allowed detected_type values:
vin_plate, info_plate, registration, work_order, inspection_sheet, odometer, hour_meter, unit_number, license_plate, brake_measurement, tire_tread_measurement, battery_tester, battery_test, multimeter, amp_clamp, oscilloscope, diagnostic_scan_report, battery_condition, vehicle_component, corrosion, fluid_leak, fluid_level, tire, brake_component, suspension_component, defect_photo, general_equipment_photo, general_evidence, supporting_photo, unknown.

Definitions:
vin_plate: VIN label/plate or stamped VIN.
info_plate: manufacturer/data/compliance plate or printed equipment label showing ratings, model, serial, GVWR/GAWR, tire/loading info, etc.
registration: vehicle registration document/card.
work_order: repair order/work order/document from shop system.
inspection_sheet: CVIP/checklist/inspection form.
diagnostic_scan_report: diagnostic scanner printout, screen, fault code report, or scan tool report.

odometer: dashboard mileage/odometer.
hour_meter: engine/equipment hours display.
unit_number: fleet/unit number decal or label.
license_plate: exterior vehicle plate.
brake_measurement: brake item with pad, rotor, lining, caliper, shoe, or drum context; includes brake pad/lining thickness or mm measurements near brake components.
tire_tread_measurement: tire tread depth item, tread gauge photos, or notes about tread depth/tire measurements.
battery_tester: battery tester display/printout or item with battery voltage, CCA, state of health, or load test result.
battery_test: legacy battery tester/test reading item; prefer battery_tester for new classifications.
multimeter: digital/analog multimeter display or probes measuring voltage, resistance, continuity, or current.
amp_clamp: clamp meter/amp clamp display measuring current draw or amperage.
oscilloscope: oscilloscope screen, waveform capture, or scope lead item.
battery_condition: battery physical condition such as corrosion, terminal, battery post, hold-down, case damage, or cable issues.
fluid_leak: visible oil, coolant, fuel, hydraulic, brake fluid, or other leak item.
fluid_level: dipstick, reservoir, sight glass, leak/level item, or note about a measured fluid level.
tire: tire sidewall, tread, damage, wear, or tire assembly item that is not specifically a tread measurement.
brake_component: brake pad, rotor, lining, caliper, shoe, drum, chamber, hose, or brake assembly item without a clear measurement.
suspension_component: spring, airbag, shock, strut, bushing, axle, control arm, or suspension assembly item.
vehicle_component: identifiable vehicle/equipment component not better covered by another class.
corrosion: rust/corrosion item on terminals, frame, body, fasteners, wiring, or components.
general_equipment_photo: general equipment/vehicle photo with no more specific item type.
defect_photo: visible failed/damaged/worn/broken/leaking/unsafe condition that is not better covered by a specific measurement/test label.
general_evidence: inspection item photo with a specific vehicle/equipment context but no more specific label.
supporting_photo: context/supporting photo with no specific document/plate/measurement/defect.
unknown: unclear image.

Inspection context rules:
- If technician note/transcript mentions brake pad, rotor, lining, caliper, shoe, drum, or a mm measurement near brakes, prefer brake_measurement for measured brake items or brake_component for component photos over document/supporting/general labels when visually plausible.
- If technician note/transcript mentions tire tread, tread depth, or tire measurement, prefer tire_tread_measurement.
- If technician note/transcript mentions battery voltage, CCA, corrosion, terminal, or battery post, prefer battery_tester for tester displays/printouts, multimeter for multimeter readings, amp_clamp for current clamp readings and battery_condition for physical condition items.
- Only use registration, work_order, inspection_sheet, or info_plate when the image actually shows paperwork, forms, work orders, registrations, labels, plates, or printed documents.

Use cvip_relevance required for documentation usually required in CVIP/commercial inspection records, supporting for helpful items, optional for context-only images, and unknown when unclear.`

const CLASSIFIER_USER_TEXT = `Classify this image for a CVIP/commercial inspection documentation workflow.
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

function normalizeClassificationConfidence(
  detectedType: CaptureClassificationType,
  confidence: number,
) {
  if (detectedType === 'unknown') {
    return confidence > 0 ? confidence : 0.15
  }

  return confidence > 0 ? confidence : 0.35
}

function isCaptureClassificationType(
  value: unknown,
): value is CaptureClassificationType {
  return (
    typeof value === 'string' &&
    CAPTURE_CLASSIFICATION_TYPES.includes(value as CaptureClassificationType)
  )
}

function isCvipRelevance(value: unknown): value is CvipRelevance {
  return (
    typeof value === 'string' &&
    CVIP_RELEVANCE_VALUES.includes(value as CvipRelevance)
  )
}

function sanitizeShortText(value: unknown, fallback: string, maxLength = 180) {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed ? trimmed.slice(0, maxLength) : fallback
}

function noteMatches(note: string | null | undefined, pattern: RegExp) {
  return typeof note === 'string' && pattern.test(note)
}

function getContextClassificationFromNote(
  note?: string | null,
): CaptureClassificationResult | null {
  if (
    noteMatches(
      note,
      /\bbrake\b(?=.*\b(?:pad|pads|rotor|rotors|lining|linings|caliper|calipers|shoe|shoes|drum|drums|\d+(?:\.\d+)?\s*mm)\b)|\b(?:pad|pads|rotor|rotors|lining|linings|caliper|calipers|shoe|shoes|drum|drums)\b(?=.*\bbrake\b)|\b(?:pad|pads|lining|linings)\b(?=.*\b\d+(?:\.\d+)?\s*mm\b)/i,
    )
  ) {
    return {
      detected_type: 'brake_measurement',
      confidence: 0.82,
      label: CLASSIFICATION_LABELS.brake_measurement,
      reason:
        'Technician note/transcript identifies a brake component measurement item.',
      cvip_relevance: 'required',
    }
  }

  if (
    noteMatches(
      note,
      /\b(?:tire|tyre)\b(?=.*\b(?:tread|depth|measurement|measure|mm|32nds?|\/32)\b)|\btread\s+depth\b/i,
    )
  ) {
    return {
      detected_type: 'tire_tread_measurement',
      confidence: 0.82,
      label: CLASSIFICATION_LABELS.tire_tread_measurement,
      reason:
        'Technician note/transcript identifies a tire tread measurement item.',
      cvip_relevance: 'required',
    }
  }

  if (
    noteMatches(
      note,
      /\b(?:battery|batteries)\b(?=.*\b(?:voltage|volt|volts|cca|cold\s+cranking|load\s+test|test(?:ed|er|ing)?|state\s+of\s+health|soh)\b)|\b(?:cca|cold\s+cranking\s+amps?)\b/i,
    )
  ) {
    return {
      detected_type: 'battery_test',
      confidence: 0.78,
      label: CLASSIFICATION_LABELS.battery_test,
      reason: 'Technician note/transcript identifies a battery test item.',
      cvip_relevance: 'supporting',
    }
  }

  if (
    noteMatches(
      note,
      /\b(?:battery|batteries)\b(?=.*\b(?:corrosion|corroded|terminal|terminals|post|posts|cable|hold-down|case|leak)\b)/i,
    )
  ) {
    return {
      detected_type: 'battery_condition',
      confidence: 0.78,
      label: CLASSIFICATION_LABELS.battery_condition,
      reason:
        'Technician note/transcript identifies a battery condition item.',
      cvip_relevance: 'supporting',
    }
  }

  return null
}

function applyInspectionContextClassification(
  classification: CaptureClassificationResult,
  note?: string | null,
): CaptureClassificationResult {
  const contextClassification = getContextClassificationFromNote(note)

  if (!contextClassification) {
    return classification
  }

  if (
    classification.detected_type === contextClassification.detected_type ||
    ['unknown', 'general_evidence', 'supporting_photo'].includes(
      classification.detected_type,
    )
  ) {
    return {
      ...contextClassification,
      confidence: Math.max(
        classification.confidence,
        contextClassification.confidence,
      ),
    }
  }

  return classification
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

export function getUnknownClassificationResult(
  reason = 'Classification could not be completed.',
): CaptureClassificationResult {
  return {
    detected_type: 'unknown',
    confidence: 0.15,
    label: CLASSIFICATION_LABELS.unknown,
    reason,
    cvip_relevance: 'unknown',
  }
}

export function validateCaptureClassification(
  value: unknown,
): CaptureClassificationResult {
  if (!isRecord(value)) {
    return getUnknownClassificationResult(
      'Classifier response was not valid JSON.',
    )
  }

  const detectedType = isCaptureClassificationType(value.detected_type)
    ? value.detected_type
    : 'unknown'
  const confidence = normalizeClassificationConfidence(
    detectedType,
    clampConfidence(value.confidence),
  )
  const label = sanitizeShortText(
    value.label,
    CLASSIFICATION_LABELS[detectedType],
    80,
  )
  const reason = sanitizeShortText(
    value.reason,
    'Image classified from visible content.',
  )
  const cvipRelevance = isCvipRelevance(value.cvip_relevance)
    ? value.cvip_relevance
    : 'unknown'

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

export function getCaptureClassificationSummary(
  classification: CaptureClassificationResult,
) {
  return `${classification.label} (${Math.round(classification.confidence * 100)}% confidence): ${classification.reason}`
}

export type CaptureGuidanceContext = {
  workflow: string
  step: string
  label: string
}

function getGuidancePrompt(
  guidance?: CaptureGuidanceContext | null,
  note?: string | null,
) {
  const notePrompt = note
    ? `\nTechnician note/transcript: "${note.slice(0, 700)}". Treat this as useful context, not absolute truth.`
    : ''

  if (!guidance) {
    return `${CLASSIFIER_USER_TEXT}${notePrompt}`
  }

  return `${CLASSIFIER_USER_TEXT}

The user captured this image while on the suggested step "${guidance.label}" in the ${guidance.workflow} workflow. Use this only as weak context. Do not blindly trust it; classify based on image content.${notePrompt}`
}

export async function classifyCaptureImage(
  signedImageUrl: string,
  guidance?: CaptureGuidanceContext | null,
  note?: string | null,
): Promise<CaptureClassificationResult> {
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
            { type: 'input_text', text: getGuidancePrompt(guidance, note) },
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
              detected_type: {
                type: 'string',
                enum: CAPTURE_CLASSIFICATION_TYPES,
              },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              label: { type: 'string' },
              reason: { type: 'string' },
              cvip_relevance: { type: 'string', enum: CVIP_RELEVANCE_VALUES },
            },
            required: [
              'detected_type',
              'confidence',
              'label',
              'reason',
              'cvip_relevance',
            ],
          },
        },
      },
      max_output_tokens: 300,
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
    return applyInspectionContextClassification(
      getUnknownClassificationResult('Classifier response was empty.'),
      note,
    )
  }

  try {
    return applyInspectionContextClassification(
      validateCaptureClassification(JSON.parse(outputText)),
      note,
    )
  } catch {
    return applyInspectionContextClassification(
      getUnknownClassificationResult(
        'Classifier response could not be parsed.',
      ),
      note,
    )
  }
}
