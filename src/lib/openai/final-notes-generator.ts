import type { Json } from '@/lib/supabase/database.types'

export const FINAL_NOTES_MODEL = 'gpt-4.1-mini'
export const FINAL_NOTES_PROMPT_VERSION = 'report-final-notes-v1'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'

export type FinalNotesCaptureContext = {
  id: string
  type: string | null
  media_kind: string | null
  captured_at: string | null
  technician_note: string | null
  transcript: string | null
  extracted_data: Json | null
}

export type GenerateFinalNotesInput = {
  session: {
    id: string
    title: string
    session_type: string
    asset_label: string | null
    vin: string | null
    unit_number: string | null
    customer_name: string | null
    field_service_details: Json | null
  }
  captures: FinalNotesCaptureContext[]
  findings: Json
  recommendations: Json
}

const FINAL_NOTES_SYSTEM_PROMPT = `You draft concise technician-facing report notes for CRED.
Return plain text only, no markdown headings unless needed.
Use only current-session items supplied in the request.
Technician Truth precedence is mandatory: manual capture notes/captions, voice transcripts, user-entered text notes, verified findings, and verified recommendations are primary source-of-truth observations. You may organize and summarize them, but must not replace, reinterpret, embellish, overwrite, or contradict technician-provided observations. Prioritize these technician-provided sources, then capture ordering and timestamps.
Do not use previous-session data, stale report_structure entries, unverified low-confidence AI readings, unsupported AI findings, or recommendations without supporting current-session capture IDs.
Do not use image descriptions, image classifications, OCR from photos, or unverified extracted image fields. Images without technician-authored notes are source-index items only, not report findings.
For generic item-only sessions, do not invent complaint, inspection, diagnostic steps, measurements, findings, faults, severity, or recommendations unless technician-authored content explicitly provides them. If there are no verified findings/recommendations, write a neutral item count plus technician notes/transcripts only. Do not say no technical issues or faults were identified unless the technician explicitly wrote that.
Use Item, Items, Documentation, Source, or Sources as appropriate in customer-facing copy. Never use the word "evidence" in the returned notes.
Keep it professional, copy/paste ready, and concise.`

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() ?? ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

function buildContext(input: GenerateFinalNotesInput) {
  return {
    current_session_only: true,
    session: input.session,
    ordered_evidence: input.captures.map((capture) => ({
      capture_id: capture.id,
      type: capture.type,
      media_kind: capture.media_kind,
      captured_at: capture.captured_at,
      technician_note: capture.technician_note,
      transcript: capture.transcript,
      extracted_data: (capture.technician_note || capture.transcript || capture.type === 'text_note' || capture.media_kind === 'note' || capture.media_kind === 'audio') ? capture.extracted_data : null,
    })),
    verified_findings: input.findings,
    verified_recommendations: input.recommendations,
  }
}

function hasMeaningfulJson(value: Json) {
  if (Array.isArray(value)) return value.length > 0
  if (isRecord(value)) return Object.keys(value).length > 0
  return Boolean(value)
}

function buildNeutralEvidenceSummary(input: GenerateFinalNotesInput) {
  const technicianNotes = input.captures
    .map((capture) => (capture.technician_note?.trim() || capture.transcript?.trim() || ''))
    .filter(Boolean)
  if (hasMeaningfulJson(input.findings) || hasMeaningfulJson(input.recommendations) || technicianNotes.length === 0) return null
  const evidenceCount = input.captures.length
  const evidenceLabel = `${evidenceCount} item${evidenceCount === 1 ? '' : 's'} captured.`
  return `${evidenceLabel} Technician notes: ${technicianNotes.join(' ')}`.slice(0, 6000)
}

export async function generateFinalNotes(input: GenerateFinalNotesInput) {
  const neutralSummary = buildNeutralEvidenceSummary(input)
  if (neutralSummary) return neutralSummary
  const apiKey = getOpenAiApiKey()
  if (!apiKey) throw new Error('OPENAI_API_KEY_MISSING')

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: FINAL_NOTES_MODEL,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: FINAL_NOTES_SYSTEM_PROMPT }] },
        { role: 'user', content: [{ type: 'input_text', text: `Draft final report notes from these current-session items only. Use customer-facing item and source terminology.\n${JSON.stringify(buildContext(input)).slice(0, 50000)}` }] },
      ],
      max_output_tokens: 800,
    }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(isRecord(body) && typeof body.error === 'object' ? 'Final notes generation failed.' : `OpenAI request failed with ${response.status}`)
  }

  const body = await response.json()
  const text = extractOutputText(body)?.trim()
  if (!text) throw new Error('Final notes generation returned no text.')
  return text.slice(0, 6000)
}
