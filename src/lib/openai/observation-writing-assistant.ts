import { containsRecommendationSignal, stripUnsupportedRecommendationSentences } from './recommendation-guard'

export const OBSERVATION_WRITING_MODEL = 'gpt-4.1-mini'
export const OBSERVATION_WRITING_PROMPT_VERSION = 'observation-writing-v2'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'

// There is deliberately no "generate_recommendation" (or any other
// recommendation-authoring) action here. The inspector is the source of
// truth for recommendations: this assistant may rewrite, reorganize, or
// clarify text the inspector already wrote, but it must never be the one to
// decide that a repair, replacement, service, or corrective action is
// warranted. See src/lib/openai/recommendation-guard.ts.
export type ObservationWritingAction =
  | 'improve_writing'
  | 'rewrite_for_customer'
  | 'make_more_technical'
  | 'make_more_concise'
  | 'expand_description'
  | 'generate_observation'
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
  supportsRelationship: string | null
  nearbyObservations: Array<{ title: string | null; classification: string | null; text: string | null }>
}

const ACTION_INSTRUCTIONS: Record<ObservationWritingAction, string> = {
  improve_writing: 'Improve grammar, flow, clarity, and professional tone while preserving meaning.',
  rewrite_for_customer: 'Rewrite for a customer-facing report using clear, plain professional language.',
  make_more_technical: 'Use more precise technical wording while preserving documented facts and avoiding unsupported diagnosis.',
  make_more_concise: 'Make the customer-facing text shorter and easier to scan without dropping important documented facts.',
  expand_description: 'Expand the description with relevant documented context from notes and image descriptions only.',
  generate_observation: 'Generate a customer-facing observation from the technician note, existing fields, and supporting image descriptions. Describe only what was observed — never state or imply that a repair, replacement, service, or corrective action is warranted.',
  explain_clearly: 'Explain the observation clearly for a non-technical customer while preserving the documented meaning.',
}

function classificationInstruction(classification: string) {
  const normalized = classification.toLowerCase()
  if (normalized.includes('concern')) return 'Classification: Concern. Describe what was observed and why it matters. Avoid diagnosis unless explicitly documented.'
  if (normalized.includes('recommended')) return 'Classification: Recommended Action. The inspector already wrote this recommendation themselves; you may only reword or reorganize it for clarity and tone. Do not add a new repair, replacement, service, monitoring, or corrective action beyond what the inspector already wrote. Avoid guarantees, legal language, and unsupported urgency.'
  if (normalized.includes('supporting')) return 'Classification: Supporting Item. Explain how the item supports another observation. Do not create a new finding.'
  return 'Classification: Observation. Describe only documented facts. No urgency. No recommendations — never state or imply that a repair, replacement, service, or corrective action is warranted, even if the observation seems to call for one.'
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
Technician Truth is mandatory: preserve the meaning of technician-authored notes, captions, transcripts, reviewed fields, and documented items. Never overwrite technician notes; write only the customer-facing report text.
Use image AI descriptions, detected objects, and extracted metadata as supporting context, but do not hallucinate. If a photo description suggests something not supported by technician text, phrase cautiously as visible/appears and do not diagnose a source.
Do not add new facts, measurements, severity, urgency, causes, repairs, guarantees, or legal conclusions unless explicitly documented.
Use Item, Items, Documentation, Source, or Sources as appropriate. Never use the word "evidence" in the returned customer-facing text.
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
  const generated = parseGeneratedText(outputText).slice(0, 4000)

  // Enforced backstop, not just a prompt instruction: the inspector's own
  // technician note is the only acceptable source for a recommendation. If
  // this rewrite introduced recommendation-shaped language that wasn't
  // already present in the inspector's note, drop those sentences rather
  // than trust the model to have followed the prompt.
  const inspectorAlreadyRecommended = containsRecommendationSignal(input.technicianNote)
  if (inspectorAlreadyRecommended) return generated
  const sanitized = stripUnsupportedRecommendationSentences(generated, input.technicianNote)
  if (!sanitized) throw new Error('AI writing assistant could not complete this edit without adding a recommendation the inspector did not write. Please write the recommendation yourself.')
  return sanitized
}
