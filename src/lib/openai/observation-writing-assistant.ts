export const OBSERVATION_WRITING_MODEL = 'gpt-4.1-mini'
export const OBSERVATION_WRITING_PROMPT_VERSION = 'observation-writing-v1'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'

export type ObservationWritingAction =
  | 'improve_writing'
  | 'rewrite_for_customer'
  | 'make_more_technical'
  | 'make_more_concise'
  | 'expand_description'
  | 'generate_observation'
  | 'generate_recommendation'
  | 'explain_clearly'

export type ObservationWritingInput = {
  action: ObservationWritingAction
  classification: string
  currentText: string | null
  observationTitle: string | null
  technicianNote: string | null
  observationType: string | null
  concern: string | null
  observation: string | null
  supportingEvidence: string | null
  recommendedAction: string | null
  supportingImages: Array<{
    id: string
    title: string | null
    technicianNote: string | null
    aiDescription: string | null
    detectedObjects: unknown
    extractedMetadata: unknown
  }>
  sessionContext: {
    reportTitle: string | null
    assetType: string | null
    customerType: string | null
    industry: string | null
  }
  nearbyObservations: Array<{ title: string | null; classification: string | null; text: string | null }>
}

const ACTION_INSTRUCTIONS: Record<ObservationWritingAction, string> = {
  improve_writing: 'Improve grammar, flow, clarity, and professional tone while preserving meaning.',
  rewrite_for_customer: 'Rewrite for a customer-facing report using clear, plain professional language.',
  make_more_technical: 'Use more precise technical wording while preserving documented facts and avoiding unsupported diagnosis.',
  make_more_concise: 'Make the customer-facing text shorter and easier to scan without dropping important documented facts.',
  expand_description: 'Expand the description with relevant documented context from notes and image descriptions only.',
  generate_observation: 'Generate a customer-facing observation from the technician note, existing fields, and supporting image descriptions.',
  generate_recommendation: 'Generate a clear recommended action only from documented concerns, observations, and evidence. Avoid guarantees and legal language.',
  explain_clearly: 'Explain the observation clearly for a non-technical customer while preserving the documented meaning.',
}

function classificationInstruction(classification: string) {
  const normalized = classification.toLowerCase()
  if (normalized.includes('concern')) return 'Classification: Concern. Describe what was observed and why it matters. Avoid diagnosis unless explicitly documented.'
  if (normalized.includes('recommended')) return 'Classification: Recommended Action. Write a clear recommendation. Avoid guarantees, legal language, and unsupported urgency.'
  if (normalized.includes('supporting')) return 'Classification: Supporting Evidence. Explain how the evidence supports another observation. Do not create a new finding.'
  return 'Classification: Observation. Describe only documented facts. No urgency. No recommendations.'
}

function safeJson(value: unknown, maxLength = 20000) {
  return JSON.stringify(value, null, 2).slice(0, maxLength)
}

function extractOutputText(body: unknown) {
  if (!body || typeof body !== 'object') return ''
  const record = body as Record<string, unknown>
  if (typeof record.output_text === 'string') return record.output_text.trim()
  const output = Array.isArray(record.output) ? record.output : []
  return output.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const content = Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as unknown[] : []
    return content.flatMap((part) => {
      if (!part || typeof part !== 'object') return []
      const text = (part as Record<string, unknown>).text
      return typeof text === 'string' ? [text] : []
    })
  }).join('\n').trim()
}

function parseGeneratedText(text: string) {
  const trimmed = text.trim()
  try {
    const parsed = JSON.parse(trimmed) as { text?: unknown }
    if (typeof parsed.text === 'string') return parsed.text.trim()
  } catch {}
  return trimmed.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
}

export async function generateObservationWriting(input: ObservationWritingInput) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY_MISSING')

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OBSERVATION_WRITING_MODEL,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: `You are CRED's per-observation writing assistant. Return JSON only: {"text":"..."}.
Technician Truth is mandatory: preserve the meaning of technician-authored notes, captions, transcripts, reviewed fields, and documented evidence. Never overwrite technician notes; write only the customer-facing report text.
Use image AI descriptions, detected objects, and extracted metadata as supporting context, but do not hallucinate. If a photo description suggests something not supported by technician text, phrase cautiously as visible/appears and do not diagnose a source.
Do not add new facts, measurements, severity, urgency, causes, repairs, guarantees, or legal conclusions unless explicitly documented.
${classificationInstruction(input.classification)}
Action: ${ACTION_INSTRUCTIONS[input.action]}`,
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: safeJson(input) }],
        },
      ],
      text: { format: { type: 'json_object' } },
      temperature: 0.2,
    }),
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body && typeof body === 'object' && body !== null && typeof (body as { error?: { message?: unknown } }).error?.message === 'string'
      ? (body as { error: { message: string } }).error.message
      : `OpenAI request failed with status ${response.status}`
    throw new Error(message)
  }
  const outputText = extractOutputText(body)
  if (!outputText) throw new Error('Observation writing assistant returned an empty response.')
  return parseGeneratedText(outputText).slice(0, 4000)
}
