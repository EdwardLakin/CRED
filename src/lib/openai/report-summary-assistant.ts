import { AI_REPORT_DRAFT_MODEL } from '@/lib/openai/report-draft-generator'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const MAX_SUMMARY_LENGTH = 1200

export type SummaryAssistantEvidence = {
  title: string | null
  body: string | null
  status?: string | null
  source_capture_ids?: string[] | null
}

export type SummaryAssistantCaptureEvidence = {
  source: 'included_capture_item'
  capture_id: string
  observation_group_id?: string | null
  group_order?: number | null
  title?: string | null
  technician_note?: string | null
  transcript?: string | null
  caption?: string | null
  evidence_category?: string | null
  media_kind?: string | null
  captured_at?: string | null
}

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() ?? ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractOutputText(body: unknown): string | null {
  if (!isRecord(body)) return null
  if (typeof body.output_text === 'string') return body.output_text
  const output = Array.isArray(body.output) ? body.output : []
  for (const item of output) {
    if (!isRecord(item)) continue
    const content = Array.isArray(item.content) ? item.content : []
    for (const part of content) {
      if (isRecord(part) && typeof part.text === 'string') return part.text
    }
  }
  return null
}

function sanitizeSummary(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, MAX_SUMMARY_LENGTH)
}

async function requestSummaryAssistant(systemPrompt: string, userText: string) {
  const apiKey = getOpenAiApiKey()
  if (!apiKey) throw new Error('OPENAI_API_KEY_MISSING')

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_REPORT_DRAFT_MODEL,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
        { role: 'user', content: [{ type: 'input_text', text: userText }] },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'report_summary_assistant',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { summary: { type: 'string' } },
            required: ['summary'],
          },
        },
      },
      max_output_tokens: 1200,
    }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message = isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
      ? body.error.message
      : `OpenAI request failed with status ${response.status}`
    throw new Error(message)
  }

  const outputText = extractOutputText(await response.json())
  if (!outputText) throw new Error('AI summary assistant returned an empty response.')
  const parsed = JSON.parse(outputText) as unknown
  const summary = sanitizeSummary(isRecord(parsed) ? parsed.summary : null)
  if (!summary) throw new Error('AI summary assistant returned an empty summary.')
  return summary
}

export async function improveReportSummaryWriting(summary: string) {
  const currentSummary = sanitizeSummary(summary)
  if (!currentSummary) throw new Error('Enter a summary before improving writing.')
  return requestSummaryAssistant(
    `You improve a CRED report executive summary for grammar, clarity, flow, and professionalism only. Return JSON only. Preserve every fact exactly. Do not add findings, severity, causes, liability language, recommendations, dates, names, numbers, measurements, IDs, VINs, codes, or technical values. Do not remove factual qualifiers or source limitations.`,
    `Improve this executive summary without changing its facts:\n${currentSummary}`,
  )
}

export async function regenerateReportSummaryFromEvidence(input: {
  sessionTitle: string | null
  reportContext?: Record<string, unknown> | null
  captures?: SummaryAssistantCaptureEvidence[]
  evidenceGroups?: unknown
  evidence: SummaryAssistantEvidence[]
}) {
  const captures = (input.captures ?? [])
    .filter((item) => item.caption?.trim() || item.technician_note?.trim() || item.transcript?.trim() || item.title?.trim())
    .slice(0, 80)
  const evidence = input.evidence
    .filter((item) => item.body?.trim() || item.title?.trim())
    .slice(0, 40)
    .map((item) => ({
      title: item.title,
      body: item.body,
      status: item.status,
      source_capture_ids: item.source_capture_ids ?? [],
    }))

  if (!captures.length && !evidence.length) throw new Error('No documented observations are available for summary regeneration.')

  return requestSummaryAssistant(
    `You write a customer-facing CRED executive summary from already documented report observations/evidence. Return JSON only. Treat included_capture_items as the primary customer-facing source of truth. Technician notes are more authoritative than transcripts, and transcripts are more authoritative than AI captions/summaries. Use approved/suggested observation titles when they are supported by the note/caption. Do not treat blank or informational report sections as proof that there are no findings when included capture items exist. If captures are provided, mention the documented observations rather than saying there is no evidence. Do not invent unsupported facts. Do not invent severity, causes, liability language, recommendations, dates, names, numbers, measurements, IDs, VINs, codes, or technical values. Only mention recommendations or severity when explicitly present in the provided documented text. Use neutral wording and preserve source limitations.`,
    `Report title: ${input.sessionTitle ?? 'Untitled report'}\nReport context JSON:\n${JSON.stringify(input.reportContext ?? {})}\nIncluded capture items JSON:\n${JSON.stringify(captures).slice(0, 22000)}\nGrouped observation data JSON:\n${JSON.stringify(input.evidenceGroups ?? null).slice(0, 6000)}\nReport sections JSON (secondary source; ignore blank/informational sections that conflict with included captures):\n${JSON.stringify(evidence).slice(0, 12000)}`,
  )
}
