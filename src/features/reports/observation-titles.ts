import type { Json } from '@/lib/supabase/database.types'

export type ObservationReportTitleState = {
  approved: string
  suggested: string
  sourceNoteHash: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function getObservationReportTitleState(
  extractedData: Json | null | undefined,
): ObservationReportTitleState {
  const data = isRecord(extractedData) ? extractedData : {}
  const reportTitle = isRecord(data.report_title) ? data.report_title : {}

  return {
    approved: clean(reportTitle.approved),
    suggested: clean(reportTitle.suggested),
    sourceNoteHash: clean(reportTitle.source_note_hash),
  }
}

export function getStoredObservationTitle(
  extractedData: Json | null | undefined,
) {
  const state = getObservationReportTitleState(extractedData)
  return state.approved || state.suggested
}

export function mergeSuggestedObservationTitle(args: {
  extractedData: Json | null | undefined
  suggested: string
  sourceNoteHash: string
  model: string
  promptVersion: string
  generatedAt: string
}): Json {
  const data = isRecord(args.extractedData) ? { ...args.extractedData } : {}
  const current = isRecord(data.report_title) ? data.report_title : {}

  data.report_title = {
    ...current,
    suggested: args.suggested,
    source: 'ai_note_summary',
    source_note_hash: args.sourceNoteHash,
    model: args.model,
    prompt_version: args.promptVersion,
    generated_at: args.generatedAt,
  }

  return data as Json
}
