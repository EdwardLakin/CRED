import type { Json } from '@/lib/supabase/database.types'

export const DIAGNOSTIC_PROCEDURE_EXTRACTION_MODEL = 'gpt-4.1-mini'
export const DIAGNOSTIC_PROCEDURE_PROMPT_VERSION = 'diagnostic-procedure-branching-v2'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const MAX_STEPS = 80
const MAX_WARNINGS = 12
const MAX_BRANCHES = 12
const MAX_REFERENCES = 12
const MAX_OUTCOMES = 8

export type DiagnosticProcedureDocumentType =
  | 'pinpoint_test'
  | 'oem_service_procedure'
  | 'tsb'
  | 'wiring_test_procedure'
  | 'warranty_diagnostic_checklist'
  | 'scan_tool_test_procedure'
  | 'unknown'

export type DiagnosticRequiredMeasurement = {
  key: string
  label: string
  measurement_point: string | null
  unit: string | null
  expected_text: string | null
  expected_min: string | null
  expected_max: string | null
}

export type DiagnosticRequiredEvidence = {
  label: string
  evidence_type: 'photo' | 'file' | 'scan_screenshot' | 'meter_reading' | 'note' | 'other'
}

export type DiagnosticBranch = {
  branch_id: string
  condition_label: string
  condition_type: 'yes' | 'no' | 'dtc' | 'value_range' | 'pass' | 'fail' | 'other'
  condition_text: string
  target_step_id: string | null
  target_step_number: string | null
  reference_text: string | null
  is_terminal: boolean
  terminal_outcome: string | null
}

export type DiagnosticExternalReference = {
  label: string
  reference_text: string
}

export type DiagnosticTerminalOutcome = {
  label: string
  outcome_text: string
}

export type DiagnosticProcedureStep = {
  step_id: string
  step_number: string | null
  step_key: string
  title: string | null
  notes_preconditions: string[]
  technician_actions: string[]
  instruction: string
  required_measurements: DiagnosticRequiredMeasurement[]
  required_evidence: DiagnosticRequiredEvidence[]
  decision_question: string | null
  branches: DiagnosticBranch[]
  dtc_branches: DiagnosticBranch[]
  external_references: DiagnosticExternalReference[]
  terminal_outcomes: DiagnosticTerminalOutcome[]
  oem_flow_text: string | null
  extraction_warnings: string[]
}

export type DiagnosticProcedureExtractionResult = {
  title: string | null
  manufacturer: string | null
  document_type: DiagnosticProcedureDocumentType
  source_summary: string | null
  steps: DiagnosticProcedureStep[]
  extraction_warnings: string[]
}

type JsonSchemaObject = {
  type?: string | readonly string[]
  additionalProperties?: boolean
  properties?: Record<string, JsonSchemaObject>
  required?: readonly string[]
  items?: JsonSchemaObject
  enum?: readonly string[]
  [key: string]: unknown
}

const NULLABLE_STRING = { type: ['string', 'null'] } as const
const STRING_ARRAY = { type: 'array', items: { type: 'string' } } as const
const BRANCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    branch_id: { type: 'string' },
    condition_label: { type: 'string' },
    condition_type: { type: 'string', enum: ['yes', 'no', 'dtc', 'value_range', 'pass', 'fail', 'other'] },
    condition_text: { type: 'string' },
    target_step_id: NULLABLE_STRING,
    target_step_number: NULLABLE_STRING,
    reference_text: NULLABLE_STRING,
    is_terminal: { type: 'boolean' },
    terminal_outcome: NULLABLE_STRING,
  },
  required: ['branch_id', 'condition_label', 'condition_type', 'condition_text', 'target_step_id', 'target_step_number', 'reference_text', 'is_terminal', 'terminal_outcome'],
} as const

export const DIAGNOSTIC_PROCEDURE_EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: NULLABLE_STRING,
    manufacturer: NULLABLE_STRING,
    document_type: {
      type: 'string',
      enum: ['pinpoint_test', 'oem_service_procedure', 'tsb', 'wiring_test_procedure', 'warranty_diagnostic_checklist', 'scan_tool_test_procedure', 'unknown'],
    },
    source_summary: NULLABLE_STRING,
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          step_id: { type: 'string' },
          step_number: NULLABLE_STRING,
          step_key: { type: 'string' },
          title: NULLABLE_STRING,
          notes_preconditions: STRING_ARRAY,
          technician_actions: STRING_ARRAY,
          instruction: { type: 'string' },
          required_measurements: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                key: { type: 'string' },
                label: { type: 'string' },
                measurement_point: NULLABLE_STRING,
                unit: NULLABLE_STRING,
                expected_text: NULLABLE_STRING,
                expected_min: NULLABLE_STRING,
                expected_max: NULLABLE_STRING,
              },
              required: ['key', 'label', 'measurement_point', 'unit', 'expected_text', 'expected_min', 'expected_max'],
            },
          },
          required_evidence: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string' },
                evidence_type: { type: 'string', enum: ['photo', 'file', 'scan_screenshot', 'meter_reading', 'note', 'other'] },
              },
              required: ['label', 'evidence_type'],
            },
          },
          decision_question: NULLABLE_STRING,
          branches: { type: 'array', items: BRANCH_SCHEMA },
          dtc_branches: { type: 'array', items: BRANCH_SCHEMA },
          external_references: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: { label: { type: 'string' }, reference_text: { type: 'string' } },
              required: ['label', 'reference_text'],
            },
          },
          terminal_outcomes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: { label: { type: 'string' }, outcome_text: { type: 'string' } },
              required: ['label', 'outcome_text'],
            },
          },
          oem_flow_text: NULLABLE_STRING,
          extraction_warnings: STRING_ARRAY,
        },
        required: ['step_id', 'step_number', 'step_key', 'title', 'notes_preconditions', 'technician_actions', 'instruction', 'required_measurements', 'required_evidence', 'decision_question', 'branches', 'dtc_branches', 'external_references', 'terminal_outcomes', 'oem_flow_text', 'extraction_warnings'],
      },
    },
    extraction_warnings: STRING_ARRAY,
  },
  required: ['title', 'manufacturer', 'document_type', 'source_summary', 'steps', 'extraction_warnings'],
} as const satisfies JsonSchemaObject

const SYSTEM_PROMPT = `You extract branching workflow structure from an uploaded OEM/manufacturer diagnostic procedure for CRED's Diagnostic Procedure Workspace.
This is documentation support only. Follow OEM procedure. Technician owns all conclusions.
Hard rules:
- Do not diagnose the vehicle.
- Do not determine root cause.
- Do not recommend replacing parts.
- Do not recommend repairs or repair actions.
- Do not identify a failed component.
- Do not override OEM flow logic.
- Do not tell the technician what repair to perform or what branch applies.
- Do not choose the next step. The technician must select the result/branch.
Extract only OEM procedure structure: step IDs such as QA1/QA2/QA3, step titles, notes/preconditions, technician actions, measurement points, expected values/ranges as written by OEM, decision questions, Yes/No branches, DTC-specific branches, external references, terminal outcomes, OEM instruction text, and extraction warnings.
Represent branches as reference text only. Use branches like "Yes → Go to QA4", "No → Go to QA7", "DTC P0123 → Go to QB2", or "Refer to Section 418-00". Do not decide whether a branch applies.
Never return fields named diagnosis, root_cause, repair_action, failed_component, recommendation, or generated_recommendation.
Return JSON only.`

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() ?? ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function sanitizeKey(value: unknown, fallback: string) {
  const text = sanitizeText(value, 80)?.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return text || fallback
}

function sanitizeArray<T>(value: unknown, mapper: (entry: unknown, index: number) => T | null, limit: number) {
  return (Array.isArray(value) ? value : []).map(mapper).filter((entry): entry is T => Boolean(entry)).slice(0, limit)
}

function sanitizeStringArray(value: unknown, limit: number, maxLength = 300) {
  return sanitizeArray(value, (entry) => sanitizeText(entry, maxLength), limit)
}

function extractOutputText(response: unknown) {
  if (!isRecord(response)) return null
  if (typeof response.output_text === 'string') return response.output_text
  const output = Array.isArray(response.output) ? response.output : []
  const textParts = output.flatMap((item) => {
    if (!isRecord(item) || !Array.isArray(item.content)) return []
    return item.content.flatMap((contentItem) => isRecord(contentItem) && typeof contentItem.text === 'string' ? [contentItem.text] : [])
  })
  return textParts.length > 0 ? textParts.join('\n') : null
}

function fallbackExtraction(filename: string): DiagnosticProcedureExtractionResult {
  const title = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Uploaded Diagnostic Procedure'
  return {
    title,
    manufacturer: null,
    document_type: /tsb/i.test(filename) ? 'tsb' : /pinpoint|pin point/i.test(filename) ? 'pinpoint_test' : 'unknown',
    source_summary: 'Procedure structure could not be fully extracted automatically. Technician review is required before use.',
    steps: [
      {
        step_id: 'step_001',
        step_number: '1',
        step_key: 'step_001',
        title: 'Review uploaded OEM procedure',
        notes_preconditions: ['Automatic branching extraction was unavailable or incomplete.'],
        technician_actions: ['Review the uploaded OEM procedure and document the applicable steps manually.'],
        instruction: 'Review the uploaded diagnostic procedure and document technician-entered readings, notes, selected OEM branches, and evidence against the applicable OEM steps.',
        required_measurements: [],
        required_evidence: [{ label: 'Technician documentation', evidence_type: 'note' }],
        decision_question: null,
        branches: [],
        dtc_branches: [],
        external_references: [],
        terminal_outcomes: [],
        oem_flow_text: null,
        extraction_warnings: ['Automatic step extraction was unavailable or incomplete. Enter or edit documentation manually.'],
      },
    ],
    extraction_warnings: ['Automatic extraction was unavailable or incomplete. Documentation support only; follow the OEM procedure.'],
  }
}

function sanitizeBranch(value: unknown, index: number): DiagnosticBranch | null {
  if (!isRecord(value)) return null
  const conditionText = sanitizeText(value.condition_text, 400) ?? sanitizeText(value.reference_text, 400)
  if (!conditionText) return null
  const conditionType = typeof value.condition_type === 'string' && ['yes', 'no', 'dtc', 'value_range', 'pass', 'fail', 'other'].includes(value.condition_type)
    ? value.condition_type as DiagnosticBranch['condition_type']
    : 'other'
  return {
    branch_id: sanitizeKey(value.branch_id, `branch_${index + 1}`),
    condition_label: sanitizeText(value.condition_label, 120) ?? conditionType.toUpperCase(),
    condition_type: conditionType,
    condition_text: conditionText,
    target_step_id: sanitizeText(value.target_step_id, 80),
    target_step_number: sanitizeText(value.target_step_number, 80),
    reference_text: sanitizeText(value.reference_text, 500),
    is_terminal: value.is_terminal === true,
    terminal_outcome: sanitizeText(value.terminal_outcome, 500),
  }
}

export function validateDiagnosticProcedureExtraction(value: unknown, filename = 'Uploaded Diagnostic Procedure'): DiagnosticProcedureExtractionResult {
  if (!isRecord(value)) return fallbackExtraction(filename)
  const steps = sanitizeArray(value.steps, (entry, index): DiagnosticProcedureStep | null => {
    if (!isRecord(entry)) return null
    const fallbackId = `step_${String(index + 1).padStart(3, '0')}`
    const instruction = sanitizeText(entry.instruction, 5000)
    if (!instruction) return null
    const stepId = sanitizeKey(entry.step_id, sanitizeText(entry.step_number, 80) ?? fallbackId)
    return {
      step_id: stepId,
      step_number: sanitizeText(entry.step_number, 80),
      step_key: sanitizeKey(entry.step_key, stepId),
      title: sanitizeText(entry.title, 180),
      notes_preconditions: sanitizeStringArray(entry.notes_preconditions, 12, 400),
      technician_actions: sanitizeStringArray(entry.technician_actions, 16, 500),
      instruction,
      required_measurements: sanitizeArray(entry.required_measurements, (measurement, measurementIndex): DiagnosticRequiredMeasurement | null => {
        if (!isRecord(measurement)) return null
        const label = sanitizeText(measurement.label, 140)
        if (!label) return null
        return {
          key: sanitizeKey(measurement.key, `measurement_${measurementIndex + 1}`),
          label,
          measurement_point: sanitizeText(measurement.measurement_point, 220),
          unit: sanitizeText(measurement.unit, 40),
          expected_text: sanitizeText(measurement.expected_text, 400),
          expected_min: sanitizeText(measurement.expected_min, 80),
          expected_max: sanitizeText(measurement.expected_max, 80),
        }
      }, 20),
      required_evidence: sanitizeArray(entry.required_evidence, (evidence): DiagnosticRequiredEvidence | null => {
        if (!isRecord(evidence)) return null
        const label = sanitizeText(evidence.label, 120)
        if (!label) return null
        const evidenceType = typeof evidence.evidence_type === 'string' && ['photo', 'file', 'scan_screenshot', 'meter_reading', 'note', 'other'].includes(evidence.evidence_type)
          ? evidence.evidence_type as DiagnosticRequiredEvidence['evidence_type']
          : 'other'
        return { label, evidence_type: evidenceType }
      }, 12),
      decision_question: sanitizeText(entry.decision_question, 600),
      branches: sanitizeArray(entry.branches, sanitizeBranch, MAX_BRANCHES),
      dtc_branches: sanitizeArray(entry.dtc_branches, sanitizeBranch, MAX_BRANCHES),
      external_references: sanitizeArray(entry.external_references, (reference): DiagnosticExternalReference | null => {
        if (!isRecord(reference)) return null
        const referenceText = sanitizeText(reference.reference_text, 500)
        if (!referenceText) return null
        return { label: sanitizeText(reference.label, 140) ?? 'OEM procedure reference', reference_text: referenceText }
      }, MAX_REFERENCES),
      terminal_outcomes: sanitizeArray(entry.terminal_outcomes, (outcome): DiagnosticTerminalOutcome | null => {
        if (!isRecord(outcome)) return null
        const outcomeText = sanitizeText(outcome.outcome_text, 500)
        if (!outcomeText) return null
        return { label: sanitizeText(outcome.label, 140) ?? 'Terminal outcome', outcome_text: outcomeText }
      }, MAX_OUTCOMES),
      oem_flow_text: sanitizeText(entry.oem_flow_text, 1600),
      extraction_warnings: sanitizeStringArray(entry.extraction_warnings, MAX_WARNINGS, 240),
    }
  }, MAX_STEPS)
  return {
    title: sanitizeText(value.title, 180) ?? fallbackExtraction(filename).title,
    manufacturer: sanitizeText(value.manufacturer, 120),
    document_type: typeof value.document_type === 'string' && ['pinpoint_test', 'oem_service_procedure', 'tsb', 'wiring_test_procedure', 'warranty_diagnostic_checklist', 'scan_tool_test_procedure', 'unknown'].includes(value.document_type)
      ? value.document_type as DiagnosticProcedureDocumentType
      : 'unknown',
    source_summary: sanitizeText(value.source_summary, 800),
    steps: steps.length > 0 ? steps : fallbackExtraction(filename).steps,
    extraction_warnings: sanitizeStringArray(value.extraction_warnings, MAX_WARNINGS, 240),
  }
}

export async function extractDiagnosticProcedure(input: { signedUrl: string; filename: string; mimeType: string }): Promise<DiagnosticProcedureExtractionResult> {
  const apiKey = getOpenAiApiKey()
  if (!apiKey) return fallbackExtraction(input.filename)

  const content: Array<Record<string, string>> = [
    {
      type: 'input_text',
      text: `Uploaded diagnostic procedure file: ${input.filename} (${input.mimeType}). Extract the branching OEM procedure workspace structure only. Capture step IDs like QA1/QA2, decision questions, Yes/No and DTC branches, external references, and terminal outcomes. If the file cannot be read, return one review step with extraction warnings.`,
    },
  ]

  if (input.mimeType.startsWith('image/')) {
    content.push({ type: 'input_image', image_url: input.signedUrl })
  } else {
    content.push({ type: 'input_text', text: `Private signed file URL for retrieval if supported: ${input.signedUrl}` })
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: DIAGNOSTIC_PROCEDURE_EXTRACTION_MODEL,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: SYSTEM_PROMPT }] },
        { role: 'user', content },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'diagnostic_procedure_extraction',
          strict: true,
          schema: DIAGNOSTIC_PROCEDURE_EXTRACTION_SCHEMA,
        },
      },
      max_output_tokens: 8000,
    }),
  })

  if (!response.ok) return fallbackExtraction(input.filename)
  const body = await response.json()
  const outputText = extractOutputText(body)
  if (!outputText) return fallbackExtraction(input.filename)
  try {
    return validateDiagnosticProcedureExtraction(JSON.parse(outputText), input.filename)
  } catch {
    return fallbackExtraction(input.filename)
  }
}

export function diagnosticProcedureToJson(value: DiagnosticProcedureExtractionResult): Json {
  return value as unknown as Json
}
