import type { Json } from '@/lib/supabase/database.types'

export const FINAL_NOTES_MODEL = 'gpt-4.1-mini'
export const FINAL_NOTES_PROMPT_VERSION = 'work-order-final-notes-v1'

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

const FINAL_NOTES_SYSTEM_PROMPT = `You draft concise technician-facing work order notes for CRED.
Return plain text only, no markdown headings unless needed.
Use only current-session evidence supplied in the request.
Prioritize manual capture notes/captions, voice transcripts, user-entered text notes, verified findings, verified recommendations, capture ordering, and timestamps.
Do not use previous-session data, stale report_structure entries, unverified low-confidence AI readings, unsupported AI findings, or recommendations without supporting current-session capture IDs.
Images are optional supporting context only; do not persist or invent image interpretation results.
Organize in this flow when evidence supports it: complaint/reason for inspection, diagnostic steps performed, measurements/observations, findings, recommendations/next steps.
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
      extracted_data: capture.extracted_data,
    })),
    verified_findings: input.findings,
    verified_recommendations: input.recommendations,
  }
}

export async function generateFinalNotes(input: GenerateFinalNotesInput) {
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
        { role: 'user', content: [{ type: 'input_text', text: `Draft final work order notes from this current-session evidence only.\n${JSON.stringify(buildContext(input)).slice(0, 50000)}` }] },
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
