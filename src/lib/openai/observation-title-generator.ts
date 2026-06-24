export const OBSERVATION_TITLE_MODEL = 'gpt-4.1-mini'
export const OBSERVATION_TITLE_PROMPT_VERSION = 'observation-title-v1'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'

export type ObservationTitleInput = {
  captureId: string
  note: string
}

export type ObservationTitleSuggestion = {
  captureId: string
  title: string
}

const SYSTEM_PROMPT = `Create concise customer-facing report headings from technician-authored notes.

Strict rules:
- Use only the supplied technician note.
- Do not analyze or infer anything from an image.
- Do not add defects, facts, causes, severity, diagnoses, measurements, urgency, recommendations, conclusions, or safety claims that are not explicitly stated.
- Preserve the component or location when the note states one.
- Keep each heading between 3 and 12 words where practical.
- Use plain professional language.
- Do not end headings with punctuation.
- Return JSON only in this exact shape:
{"titles":[{"capture_id":"id","title":"Concise heading"}]}`

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractOutputText(response: unknown) {
  if (!isRecord(response)) return null
  if (typeof response.output_text === 'string') return response.output_text

  const output = Array.isArray(response.output) ? response.output : []
  const parts = output.flatMap((item) => {
    if (!isRecord(item) || !Array.isArray(item.content)) return []
    return item.content.flatMap((content) =>
      isRecord(content) && typeof content.text === 'string'
        ? [content.text]
        : [],
    )
  })

  return parts.length ? parts.join('\n') : null
}

function parseJsonText(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')

  return JSON.parse(cleaned) as unknown
}

function normalizedWords(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4)
}

function validateTitle(note: string, candidate: unknown) {
  if (typeof candidate !== 'string') return null

  const title = candidate
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?;,:\s]+$/, '')

  if (title.length < 3 || title.length > 100) return null

  const words = title.split(/\s+/)
  if (words.length < 2 || words.length > 15) return null

  const guardedTerms =
    /\b(urgent|critical|severe|unsafe|dangerous|immediate|immediately|failure|failed|diagnosis|replace|repair|required|recommend)\b/gi

  const unsupportedGuardedTerms = [...title.matchAll(guardedTerms)]
    .map((match) => match[0].toLowerCase())
    .filter((term) => !note.toLowerCase().includes(term))

  if (unsupportedGuardedTerms.length > 0) return null

  const noteWords = new Set(normalizedWords(note))
  const titleWords = normalizedWords(title)
  if (
    noteWords.size > 0 &&
    titleWords.length > 0 &&
    !titleWords.some((word) => noteWords.has(word))
  ) {
    return null
  }

  return title
}

export async function generateObservationTitles(
  items: ObservationTitleInput[],
): Promise<ObservationTitleSuggestion[]> {
  if (items.length === 0) return []

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY_MISSING')

  const safeItems = items.slice(0, 50).map((item) => ({
    capture_id: item.captureId,
    note: item.note.slice(0, 1500),
  }))

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OBSERVATION_TITLE_MODEL,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: SYSTEM_PROMPT }],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Create headings for these current-session technician notes only:\n${JSON.stringify({ items: safeItems })}`,
            },
          ],
        },
      ],
      max_output_tokens: 1200,
    }),
  })

  if (!response.ok) {
    throw new Error(`Observation title generation failed with ${response.status}`)
  }

  const body = await response.json()
  const outputText = extractOutputText(body)
  if (!outputText) throw new Error('Observation title generation returned no text')

  const parsed = parseJsonText(outputText)
  if (!isRecord(parsed) || !Array.isArray(parsed.titles)) return []

  const inputById = new Map(items.map((item) => [item.captureId, item.note]))
  const seen = new Set<string>()

  return parsed.titles.flatMap((entry): ObservationTitleSuggestion[] => {
    if (!isRecord(entry)) return []

    const captureId =
      typeof entry.capture_id === 'string' ? entry.capture_id.trim() : ''
    const note = inputById.get(captureId)

    if (!note || seen.has(captureId)) return []

    const title = validateTitle(note, entry.title)
    if (!title) return []

    seen.add(captureId)
    return [{ captureId, title }]
  })
}
