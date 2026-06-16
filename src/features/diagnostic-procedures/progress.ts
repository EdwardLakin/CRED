import type { Database } from '@/lib/supabase/database.types'

type AiReportDraftSection = Database['public']['Tables']['ai_report_draft_sections']['Row']
type CaptureItem = Database['public']['Tables']['capture_items']['Row']

type DiagnosticStepMetadata = {
  section_type?: string
  step_id?: string
  visible?: boolean
  required_measurements?: Array<{ key?: string; label?: string }> | unknown
  required_evidence?: Array<{ label?: string; evidence_type?: string }> | unknown
  oem_branches?: Array<{ label?: string; text?: string }> | unknown
  extraction_warnings?: string[] | unknown
  technician_status?: string
  technician_readings?: Array<{ key?: string; label?: string; value?: string | number | null }> | unknown
  technician_notes?: string | null
  technician_selected_branch?: string | null
}

export type DiagnosticStepCompleteness = {
  stepId: string
  visible: boolean
  status: string
  isComplete: boolean
  isNotTested: boolean
  isBlocked: boolean
  isNotApplicable: boolean
  missingRequiredReadings: boolean
  missingSelectedBranch: boolean
  missingRequiredEvidence: boolean
  hasExtractionWarnings: boolean
  badges: Array<'Complete' | 'Needs reading' | 'Needs branch selection' | 'Needs evidence' | 'Blocked' | 'Review warning'>
}

export type DiagnosticProcedureProgress = {
  totalVisibleSteps: number
  completedSteps: number
  notTestedSteps: number
  blockedSteps: number
  notApplicableSteps: number
  stepsMissingRequiredReadings: number
  stepsMissingSelectedBranch: number
  stepsMissingRequiredEvidence: number
  stepsWithExtractionWarnings: number
  incompleteSteps: number
  warningCount: number
  missingRequiredDocumentationCount: number
  percentComplete: number
  reportReady: boolean
  nextIncompleteStepId: string | null
  steps: DiagnosticStepCompleteness[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getDiagnosticStepMetadata(section: Pick<AiReportDraftSection, 'metadata'>): DiagnosticStepMetadata {
  return isRecord(section.metadata) ? section.metadata as DiagnosticStepMetadata : {}
}

export function asDiagnosticRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function getMetadata(section: AiReportDraftSection): DiagnosticStepMetadata {
  return getDiagnosticStepMetadata(section)
}

function hasText(value: unknown) {
  return String(value ?? '').trim().length > 0
}

export function captureMatchesDiagnosticStep(capture: CaptureItem, stepId: string) {
  return isRecord(capture.extracted_data) && isRecord(capture.extracted_data.diagnostic_step) && capture.extracted_data.diagnostic_step.step_id === stepId
}

export function getDiagnosticEvidenceRole(capture: CaptureItem) {
  if (!isRecord(capture.extracted_data) || !isRecord(capture.extracted_data.diagnostic_step)) return 'other'
  const role = capture.extracted_data.diagnostic_step.evidence_role
  return typeof role === 'string' && role.trim() ? role : 'other'
}

function hasRequiredEvidence(stepCaptures: CaptureItem[], requiredEvidence: Record<string, unknown>) {
  const requiredRole = typeof requiredEvidence.evidence_type === 'string' ? requiredEvidence.evidence_type : null
  const requiredLabel = typeof requiredEvidence.label === 'string' ? requiredEvidence.label : null
  if (!requiredRole && !requiredLabel) return stepCaptures.length > 0
  return stepCaptures.some((capture) => {
    const role = getDiagnosticEvidenceRole(capture)
    return (requiredRole && role === requiredRole) || (requiredLabel && role === requiredLabel)
  })
}

export function getDiagnosticStepCompleteness(section: AiReportDraftSection, captures: CaptureItem[]): DiagnosticStepCompleteness {
  const metadata = getMetadata(section)
  const stepId = metadata.step_id ?? section.section_key
  const visible = metadata.visible !== false
  const status = metadata.technician_status ?? 'not_tested'
  const requiredMeasurements = asDiagnosticRecordArray(metadata.required_measurements)
  const readings = asDiagnosticRecordArray(metadata.technician_readings)
  const requiredEvidence = asDiagnosticRecordArray(metadata.required_evidence)
  const branches = asDiagnosticRecordArray(metadata.oem_branches)
  const stepCaptures = captures.filter((capture) => captureMatchesDiagnosticStep(capture, stepId))
  const missingRequiredReadings = status !== 'blocked' && status !== 'not_applicable' && requiredMeasurements.some((measurement) => {
    const key = typeof measurement.key === 'string' && measurement.key.trim() ? measurement.key : null
    const label = typeof measurement.label === 'string' && measurement.label.trim() ? measurement.label : key
    return !readings.some((reading) => ((key && reading.key === key) || (label && reading.label === label)) && hasText(reading.value))
  })
  const missingSelectedBranch = status !== 'blocked' && status !== 'not_applicable' && branches.length > 0 && !hasText(metadata.technician_selected_branch)
  const missingRequiredEvidence = status !== 'blocked' && status !== 'not_applicable' && requiredEvidence.some((evidence) => !hasRequiredEvidence(stepCaptures, evidence))
  const isBlocked = status === 'blocked'
  const blockedWithoutNote = isBlocked && !hasText(metadata.technician_notes)
  const isNotApplicable = status === 'not_applicable'
  const isNotTested = status === 'not_tested' || !hasText(status)
  const hasExtractionWarnings = Array.isArray(metadata.extraction_warnings) && metadata.extraction_warnings.length > 0
  const isComplete = visible && !isNotTested && !missingRequiredReadings && !missingSelectedBranch && !missingRequiredEvidence && !blockedWithoutNote
  const badges: DiagnosticStepCompleteness['badges'] = []
  if (isComplete) badges.push('Complete')
  if (missingRequiredReadings) badges.push('Needs reading')
  if (missingSelectedBranch) badges.push('Needs branch selection')
  if (missingRequiredEvidence) badges.push('Needs evidence')
  if (isBlocked) badges.push('Blocked')
  if (hasExtractionWarnings) badges.push('Review warning')
  return { stepId, visible, status, isComplete, isNotTested, isBlocked, isNotApplicable, missingRequiredReadings, missingSelectedBranch, missingRequiredEvidence, hasExtractionWarnings, badges }
}

export function getDiagnosticProcedureProgress(sections: AiReportDraftSection[], captures: CaptureItem[]): DiagnosticProcedureProgress {
  const steps = sections.filter((section) => getMetadata(section).section_type === 'diagnostic_procedure_step').map((section) => getDiagnosticStepCompleteness(section, captures)).filter((step) => step.visible)
  const completedSteps = steps.filter((step) => step.isComplete).length
  const totalVisibleSteps = steps.length
  const stepsMissingRequiredReadings = steps.filter((step) => step.missingRequiredReadings).length
  const stepsMissingSelectedBranch = steps.filter((step) => step.missingSelectedBranch).length
  const stepsMissingRequiredEvidence = steps.filter((step) => step.missingRequiredEvidence).length
  const stepsWithExtractionWarnings = steps.filter((step) => step.hasExtractionWarnings).length
  const incompleteSteps = steps.filter((step) => !step.isComplete).length
  return {
    totalVisibleSteps,
    completedSteps,
    notTestedSteps: steps.filter((step) => step.isNotTested).length,
    blockedSteps: steps.filter((step) => step.isBlocked).length,
    notApplicableSteps: steps.filter((step) => step.isNotApplicable).length,
    stepsMissingRequiredReadings,
    stepsMissingSelectedBranch,
    stepsMissingRequiredEvidence,
    stepsWithExtractionWarnings,
    incompleteSteps,
    warningCount: stepsWithExtractionWarnings,
    missingRequiredDocumentationCount: stepsMissingRequiredReadings + stepsMissingSelectedBranch + stepsMissingRequiredEvidence,
    percentComplete: totalVisibleSteps > 0 ? Math.round((completedSteps / totalVisibleSteps) * 100) : 0,
    reportReady: totalVisibleSteps > 0 && incompleteSteps === 0 && stepsWithExtractionWarnings === 0,
    nextIncompleteStepId: steps.find((step) => !step.isComplete)?.stepId ?? null,
    steps,
  }
}
