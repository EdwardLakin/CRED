import type { Json } from '@/lib/supabase/database.types'
import type { CaptureItem } from './types'

export const WORKFLOW_LABELS: Record<string, string> = {
  cvip: 'CVIP / Commercial Inspection',
  general_inspection: 'General Inspection',
  default: 'Field Evidence',
}

export type GuidedEvidenceStep = {
  key: string
  shortLabel: string
  label: string
  instruction: string
  examples: string[]
  acceptedTypes: string[]
}

export type StepStatus = 'Missing' | 'Captured' | 'Needs review' | 'Extracted'

const CVIP_STEPS: GuidedEvidenceStep[] = [
  {
    key: 'registration',
    shortLabel: 'Registration',
    label: 'Registration',
    instruction: 'Capture the registration document or permit details for the vehicle record.',
    examples: ['registration card', 'permit document', 'owner/vehicle registration'],
    acceptedTypes: ['registration'],
  },
  {
    key: 'vin_plate',
    shortLabel: 'VIN',
    label: 'VIN plate',
    instruction: 'Get a clear close-up of the VIN label, plate, or stamped VIN.',
    examples: ['door jamb VIN label', 'frame VIN stamp', 'dash VIN plate'],
    acceptedTypes: ['vin_plate'],
  },
  {
    key: 'license_plate',
    shortLabel: 'Licence Plate',
    label: 'Licence plate',
    instruction: 'Capture the exterior plate so the unit can be matched to the inspection file.',
    examples: ['front plate', 'rear plate', 'plate sticker'],
    acceptedTypes: ['license_plate'],
  },
  {
    key: 'unit_number',
    shortLabel: 'Unit #',
    label: 'Unit number',
    instruction: 'Capture fleet, asset, or internal unit identifiers.',
    examples: ['cab decal', 'trailer unit number', 'asset label'],
    acceptedTypes: ['unit_number'],
  },
  {
    key: 'odometer_hour_meter',
    shortLabel: 'Odometer',
    label: 'Odometer / hour meter',
    instruction: 'Capture mileage or equipment hours with the digits readable.',
    examples: ['dashboard odometer', 'hour meter display', 'cluster reading'],
    acceptedTypes: ['odometer', 'hour_meter'],
  },
  {
    key: 'inspection_sheet',
    shortLabel: 'Work Order',
    label: 'Inspection sheet / CVIP form',
    instruction: 'Capture inspection forms, CVIP sheets, or shop work orders connected to the inspection.',
    examples: ['CVIP form', 'inspection sheet', 'work order'],
    acceptedTypes: ['inspection_sheet', 'work_order'],
  },
  {
    key: 'info_plate',
    shortLabel: 'Data Plate',
    label: 'Info/data/tire label',
    instruction: 'Capture manufacturer, tire/loading, rating, or data plates.',
    examples: ['manufacturer plate', 'tire/loading label', 'GVWR/GAWR data tag'],
    acceptedTypes: ['info_plate'],
  },
  {
    key: 'defect_repair_photos',
    shortLabel: 'Defects',
    label: 'Defect or repair photos',
    instruction: 'Capture visible defects, repair areas, failed parts, leaks, wear, or corrective work.',
    examples: ['damaged component', 'leak', 'repair before/after'],
    acceptedTypes: ['damage_or_defect'],
  },
  {
    key: 'supporting_evidence',
    shortLabel: 'Supporting Photos',
    label: 'General supporting evidence',
    instruction: 'Add context photos that help explain the condition or inspection location.',
    examples: ['full vehicle view', 'work area', 'supporting field photo'],
    acceptedTypes: ['general_field_photo', 'unknown'],
  },
]

const GENERAL_INSPECTION_STEPS: GuidedEvidenceStep[] = [
  {
    key: 'asset_id_vin',
    shortLabel: 'VIN',
    label: 'VIN plate or asset ID',
    instruction: 'Capture the VIN, serial, asset, or unit identifier that ties evidence to the asset.',
    examples: ['VIN plate', 'asset tag', 'unit label'],
    acceptedTypes: ['vin_plate', 'unit_number'],
  },
  {
    key: 'info_plate',
    shortLabel: 'Data Plate',
    label: 'Info/data plate',
    instruction: 'Capture manufacturer, model, rating, serial, or data plates.',
    examples: ['data plate', 'serial plate', 'equipment tag'],
    acceptedTypes: ['info_plate'],
  },
  {
    key: 'odometer_hour_meter',
    shortLabel: 'Odometer',
    label: 'Odometer / hour meter',
    instruction: 'Capture mileage or hours when relevant to the inspection.',
    examples: ['odometer', 'hour meter', 'equipment hours'],
    acceptedTypes: ['odometer', 'hour_meter'],
  },
  {
    key: 'work_order_inspection_sheet',
    shortLabel: 'Work Order',
    label: 'Work order / inspection sheet',
    instruction: 'Capture job paperwork or source documents that add report context.',
    examples: ['work order', 'inspection sheet', 'source document'],
    acceptedTypes: ['work_order', 'inspection_sheet'],
  },
  {
    key: 'concern_area',
    shortLabel: 'Concern Area',
    label: 'Concern area',
    instruction: 'Capture the area the customer, inspector, or technician is concerned about.',
    examples: ['reported concern', 'area overview', 'component context'],
    acceptedTypes: ['general_field_photo', 'damage_or_defect'],
  },
  {
    key: 'defect_photos',
    shortLabel: 'Defects',
    label: 'Defect photos',
    instruction: 'Capture failed, damaged, worn, unsafe, or leaking conditions clearly.',
    examples: ['damage', 'wear', 'leak', 'broken component'],
    acceptedTypes: ['damage_or_defect'],
  },
  {
    key: 'supporting_evidence',
    shortLabel: 'Supporting Photos',
    label: 'Supporting evidence',
    instruction: 'Add any other helpful photos or documents for review.',
    examples: ['field context', 'supporting document', 'overview photo'],
    acceptedTypes: ['general_field_photo', 'other_document', 'unknown'],
  },
]

const DEFAULT_STEPS: GuidedEvidenceStep[] = [
  {
    key: 'asset_id_vin_unit_label',
    shortLabel: 'VIN / Asset ID',
    label: 'Asset ID / VIN / unit label',
    instruction: 'Capture the clearest identifier available for the asset or record.',
    examples: ['asset tag', 'VIN label', 'unit number'],
    acceptedTypes: ['vin_plate', 'unit_number'],
  },
  {
    key: 'documents',
    shortLabel: 'Documents',
    label: 'Documents',
    instruction: 'Capture documents that explain the job, record, or inspection.',
    examples: ['registration', 'work order', 'inspection sheet'],
    acceptedTypes: ['registration', 'work_order', 'inspection_sheet', 'other_document'],
  },
  {
    key: 'info_data_plates',
    shortLabel: 'Data Plates',
    label: 'Info/data plates',
    instruction: 'Capture tags or plates with manufacturer, serial, model, or rating information.',
    examples: ['data plate', 'serial tag', 'rating label'],
    acceptedTypes: ['info_plate'],
  },
  {
    key: 'field_condition_photos',
    shortLabel: 'Defects',
    label: 'Field condition photos',
    instruction: 'Capture current condition, defects, or areas needing attention.',
    examples: ['condition overview', 'damage', 'concern area'],
    acceptedTypes: ['damage_or_defect', 'general_field_photo'],
  },
  {
    key: 'supporting_evidence',
    shortLabel: 'Supporting Photos',
    label: 'Supporting evidence',
    instruction: 'Add anything else useful for the evidence record.',
    examples: ['context photo', 'additional label', 'unknown supporting image'],
    acceptedTypes: ['general_field_photo', 'unknown'],
  },
]

export function getWorkflow(sessionType: string) {
  const normalized = sessionType.toLowerCase()

  if (normalized.includes('cvip') || (normalized.includes('commercial') && normalized.includes('inspection'))) {
    return 'cvip'
  }

  if (normalized.includes('inspection')) {
    return 'general_inspection'
  }

  return 'default'
}

export function getSteps(workflow: string) {
  if (workflow === 'cvip') {
    return CVIP_STEPS
  }

  if (workflow === 'general_inspection') {
    return GENERAL_INSPECTION_STEPS
  }

  return DEFAULT_STEPS
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getGuidance(extractedData: Json | null) {
  if (!isRecord(extractedData) || !isRecord(extractedData.guidance)) {
    return null
  }

  const step = typeof extractedData.guidance.step === 'string' ? extractedData.guidance.step : null
  const label = typeof extractedData.guidance.label === 'string' ? extractedData.guidance.label : null
  const workflow = typeof extractedData.guidance.workflow === 'string' ? extractedData.guidance.workflow : null

  return step && label && workflow ? { step, label, workflow } : null
}

function getDetectedType(extractedData: Json | null) {
  if (!isRecord(extractedData) || !isRecord(extractedData.classification)) {
    return null
  }

  return typeof extractedData.classification.detected_type === 'string' ? extractedData.classification.detected_type : null
}

function getExtractionStatus(extractedData: Json | null) {
  if (!isRecord(extractedData) || !isRecord(extractedData.extraction)) {
    return null
  }

  return typeof extractedData.extraction.status === 'string' ? extractedData.extraction.status : null
}

function captureMatchesStep(capture: CaptureItem, step: GuidedEvidenceStep) {
  const guidance = getGuidance(capture.extracted_data)
  const detectedType = getDetectedType(capture.extracted_data)

  return guidance?.step === step.key || (detectedType ? step.acceptedTypes.includes(detectedType) : false)
}

export function getStepCaptures(captures: CaptureItem[], step: GuidedEvidenceStep) {
  return captures.filter((capture) => captureMatchesStep(capture, step))
}

export function getStepStatus(stepCaptures: CaptureItem[]): StepStatus {
  if (stepCaptures.length === 0) {
    return 'Missing'
  }

  if (stepCaptures.some((capture) => capture.ai_status === 'needs_review')) {
    return 'Needs review'
  }

  if (stepCaptures.some((capture) => getExtractionStatus(capture.extracted_data) === 'extracted')) {
    return 'Extracted'
  }

  return 'Captured'
}

export function getEvidenceChecklistSummary(captures: CaptureItem[], sessionType: string) {
  const workflow = getWorkflow(sessionType)

  return getSteps(workflow).map((step) => {
    const stepCaptures = getStepCaptures(captures, step)

    return {
      step,
      count: stepCaptures.length,
      status: getStepStatus(stepCaptures),
    }
  })
}

export type RequiredEvidenceRule = {
  key: string
  label: string
  required: boolean
  matchTerms: string[]
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function getTextHaystack(capture: CaptureItem) {
  const chunks = [capture.technician_note, capture.transcript, capture.ai_summary, capture.ocr_text, JSON.stringify(capture.extracted_data ?? {})]
  return chunks.filter((chunk): chunk is string => typeof chunk === 'string').join(' ').toLowerCase()
}

function normalizeEvidenceRules(value: Json | null | undefined): RequiredEvidenceRule[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    if (typeof item === 'string') {
      return { key: normalizeKey(item), label: item, required: true, matchTerms: [item.toLowerCase()] }
    }

    if (isRecord(item)) {
      const label = typeof item.label === 'string' ? item.label : typeof item.key === 'string' ? item.key : 'Evidence'
      const terms = Array.isArray(item.matchTerms)
        ? item.matchTerms.filter((term): term is string => typeof term === 'string')
        : Array.isArray(item.match_terms)
          ? item.match_terms.filter((term): term is string => typeof term === 'string')
          : [label.toLowerCase()]
      return {
        key: typeof item.key === 'string' ? item.key : normalizeKey(label),
        label,
        required: typeof item.required === 'boolean' ? item.required : true,
        matchTerms: terms.length > 0 ? terms.map((term) => term.toLowerCase()) : [label.toLowerCase()],
      }
    }

    return null
  }).filter((item): item is RequiredEvidenceRule => Boolean(item))
}

export function getSessionEvidenceRules(sessionType: string, templateRequiredEvidence?: Json | null): RequiredEvidenceRule[] {
  const templateRules = normalizeEvidenceRules(templateRequiredEvidence)
  if (templateRules.length > 0) return templateRules

  const workflow = getWorkflow(sessionType)
  if (workflow === 'cvip') {
    return ['VIN Plate', 'Registration', 'Odometer', 'Front Brakes', 'Rear Brakes', 'Tire Tread'].map((label) => ({
      key: normalizeKey(label),
      label,
      required: true,
      matchTerms: [label.toLowerCase(), ...label.toLowerCase().split(' ')],
    }))
  }

  if (sessionType.toLowerCase().includes('field_service')) {
    return ['Unit Identification', 'Data Plate', 'Defect Photo', 'Repair Photo'].map((label) => ({
      key: normalizeKey(label),
      label,
      required: true,
      matchTerms: [label.toLowerCase(), ...label.toLowerCase().split(' ')],
    }))
  }

  return getSteps(workflow).map((step) => ({
    key: step.key,
    label: step.shortLabel,
    required: true,
    matchTerms: [step.label.toLowerCase(), step.shortLabel.toLowerCase(), ...step.acceptedTypes],
  }))
}

export function getRequiredEvidenceCompletion(captures: CaptureItem[], sessionType: string, templateRequiredEvidence?: Json | null) {
  const rules = getSessionEvidenceRules(sessionType, templateRequiredEvidence).filter((rule) => rule.required)
  const rows = rules.map((rule) => {
    const matchingCaptures = captures.filter((capture) => {
      const haystack = getTextHaystack(capture)
      const detectedType = getDetectedType(capture.extracted_data)
      const guidance = getGuidance(capture.extracted_data)
      return guidance?.step === rule.key || detectedType === rule.key || rule.matchTerms.some((term) => haystack.includes(term))
    })

    return {
      rule,
      completed: matchingCaptures.length > 0,
      count: matchingCaptures.length,
      status: matchingCaptures.length > 0 ? 'Completed' : 'Missing',
    }
  })
  return {
    rows,
    completedCount: rows.filter((row) => row.completed).length,
    totalCount: rows.length,
    missing: rows.filter((row) => !row.completed),
  }
}
