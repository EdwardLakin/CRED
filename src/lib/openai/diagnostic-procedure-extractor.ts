import type { Json } from '@/lib/supabase/database.types'

export const DIAGNOSTIC_PROCEDURE_EXTRACTION_MODEL = 'gpt-4.1-mini'
export const DIAGNOSTIC_PROCEDURE_PROMPT_VERSION = 'diagnostic-procedure-structure-v1'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const MAX_STEPS = 60
const MAX_WARNINGS = 12
const MAX_SOURCE_CHUNKS = 24

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
  unit: string | null
  expected_text: string | null
}

export type DiagnosticRequiredEvidence = {
  label: string
  evidence_type: 'photo' | 'file' | 'scan_screenshot' | 'meter_reading' | 'note' | 'other'
}

export type DiagnosticProcedureStep = {
  step_id: string
  step_number: string | null
  step_key: string
  title: string | null
  instruction: string
  required_measurements: DiagnosticRequiredMeasurement[]
  required_evidence: DiagnosticRequiredEvidence[]
  oem_flow_text: string | null
  source_page_start: number | null
  source_page_end: number | null
  extraction_confidence: number | null
  extraction_warnings: string[]
}

export type DiagnosticProcedureSourceChunk = {
  page_start: number
  page_end: number
  text: string
  warnings: string[]
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
          instruction: { type: 'string' },
          required_measurements: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                key: { type: 'string' },
                label: { type: 'string' },
                unit: NULLABLE_STRING,
                expected_text: NULLABLE_STRING,
              },
              required: ['key', 'label', 'unit', 'expected_text'],
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
          oem_flow_text: NULLABLE_STRING,
          source_page_start: { type: ['number', 'null'] },
          source_page_end: { type: ['number', 'null'] },
          extraction_confidence: { type: ['number', 'null'] },
          extraction_warnings: { type: 'array', items: { type: 'string' } },
        },
        required: ['step_id', 'step_number', 'step_key', 'title', 'instruction', 'required_measurements', 'required_evidence', 'oem_flow_text', 'source_page_start', 'source_page_end', 'extraction_confidence', 'extraction_warnings'],
      },
    },
    extraction_warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'manufacturer', 'document_type', 'source_summary', 'steps', 'extraction_warnings'],
} as const satisfies JsonSchemaObject

const SYSTEM_PROMPT = `You extract structure from an uploaded OEM/manufacturer diagnostic procedure for CRED's Diagnostic Procedure Workspace.
This is documentation support only. Follow OEM procedure. Technician owns all conclusions.
Hard rules:
- Do not diagnose the vehicle.
- Do not determine root cause.
- Do not recommend replacing parts.
- Do not recommend repairs or repair actions.
- Do not identify a failed component.
- Do not override OEM flow logic.
- Do not tell the technician what repair to perform or what branch applies.
Extract only the document structure: title, manufacturer if visible, document type, ordered steps, step numbers/keys, step titles, OEM instruction text, required technician-entered measurements, requested documentation items, OEM flow/branch text, and source page ranges, confidence, extraction warnings.
If page-numbered source text chunks are provided, use them as the primary source and preserve page references on each step.
If OEM text says "if X then go to Y", preserve it as oem_flow_text without deciding whether X is true.
For generated labels, summaries, and warnings, use "item", "documentation", or "source" instead of "evidence". Preserve exact OEM wording only inside instruction and oem_flow_text.
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

function sanitizePageNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null
}

function sanitizeConfidence(value: unknown) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return null
  return Math.max(0, Math.min(1, numberValue))
}

function sanitizeArray<T>(value: unknown, mapper: (entry: unknown, index: number) => T | null, limit: number) {
  return (Array.isArray(value) ? value : []).map(mapper).filter((entry): entry is T => Boolean(entry)).slice(0, limit)
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
        instruction: 'Review the uploaded diagnostic procedure and document technician-entered readings, notes, and supporting items against the applicable OEM steps.',
        required_measurements: [],
        required_evidence: [{ label: 'Technician documentation', evidence_type: 'note' }],
        oem_flow_text: null,
        source_page_start: null,
        source_page_end: null,
        extraction_confidence: 0.1,
        extraction_warnings: ['Automatic step extraction was unavailable or incomplete. Enter or edit documentation manually.'],
      },
    ],
    extraction_warnings: ['Automatic extraction was unavailable or incomplete. Documentation support only; follow the OEM procedure.'],
  }
}

export function validateDiagnosticProcedureExtraction(value: unknown, filename = 'Uploaded Diagnostic Procedure'): DiagnosticProcedureExtractionResult {
  if (!isRecord(value)) return fallbackExtraction(filename)
  const steps = sanitizeArray(value.steps, (entry, index): DiagnosticProcedureStep | null => {
    if (!isRecord(entry)) return null
    const fallbackId = `step_${String(index + 1).padStart(3, '0')}`
    const instruction = sanitizeText(entry.instruction, 4000)
    if (!instruction) return null
    const stepId = sanitizeKey(entry.step_id, fallbackId)
    return {
      step_id: stepId,
      step_number: sanitizeText(entry.step_number, 80),
      step_key: sanitizeKey(entry.step_key, stepId),
      title: sanitizeText(entry.title, 180),
      instruction,
      required_measurements: sanitizeArray(entry.required_measurements, (measurement, measurementIndex): DiagnosticRequiredMeasurement | null => {
        if (!isRecord(measurement)) return null
        const label = sanitizeText(measurement.label, 120)
        if (!label) return null
        return {
          key: sanitizeKey(measurement.key, `measurement_${measurementIndex + 1}`),
          label,
          unit: sanitizeText(measurement.unit, 40),
          expected_text: sanitizeText(measurement.expected_text, 300),
        }
      }, 12),
      required_evidence: sanitizeArray(entry.required_evidence, (evidence): DiagnosticRequiredEvidence | null => {
        if (!isRecord(evidence)) return null
        const label = sanitizeText(evidence.label, 120)
        if (!label) return null
        const evidenceType = typeof evidence.evidence_type === 'string' && ['photo', 'file', 'scan_screenshot', 'meter_reading', 'note', 'other'].includes(evidence.evidence_type)
          ? evidence.evidence_type as DiagnosticRequiredEvidence['evidence_type']
          : 'other'
        return { label, evidence_type: evidenceType }
      }, 12),
      oem_flow_text: sanitizeText(entry.oem_flow_text, 1200),
      source_page_start: sanitizePageNumber(entry.source_page_start),
      source_page_end: sanitizePageNumber(entry.source_page_end) ?? sanitizePageNumber(entry.source_page_start),
      extraction_confidence: sanitizeConfidence(entry.extraction_confidence),
      extraction_warnings: sanitizeArray(entry.extraction_warnings, (warning) => sanitizeText(warning, 240), MAX_WARNINGS),
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
    extraction_warnings: sanitizeArray(value.extraction_warnings, (warning) => sanitizeText(warning, 240), MAX_WARNINGS),
  }
}

export async function extractDiagnosticProcedure(input: { signedUrl: string; filename: string; mimeType: string; sourceChunks?: DiagnosticProcedureSourceChunk[]; extractionWarnings?: string[] }): Promise<DiagnosticProcedureExtractionResult> {
  const apiKey = getOpenAiApiKey()
  if (!apiKey) return fallbackExtraction(input.filename)

  const content: Array<Record<string, string>> = [
    {
      type: 'input_text',
      text: `Uploaded diagnostic procedure file: ${input.filename} (${input.mimeType}). Extract the procedure workspace structure only. If the file cannot be read, return one review step with extraction warnings.`,
    },
  ]

  const sourceChunks = (input.sourceChunks ?? []).slice(0, MAX_SOURCE_CHUNKS)
  if (sourceChunks.length > 0) {
    content.push({
      type: 'input_text',
      text: `Pre-extracted source text by page. Use this before file vision/retrieval and preserve page ranges on steps.\n${sourceChunks.map((chunk) => `[Pages ${chunk.page_start}-${chunk.page_end}]\n${chunk.text}`).join('\n\n')}`,
    })
  }
  const extractionWarnings = (input.extractionWarnings ?? []).filter(Boolean).slice(0, MAX_WARNINGS)
  if (extractionWarnings.length > 0) {
    content.push({ type: 'input_text', text: `Extraction pipeline warnings to preserve where relevant: ${extractionWarnings.join('; ')}` })
  }

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
      max_output_tokens: 5000,
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
