import type { Database } from '@/lib/supabase/database.types'

type AiReportDraft = Pick<Database['public']['Tables']['ai_report_drafts']['Row'], 'documentation_session_id' | 'title' | 'header_fields' | 'generated_at' | 'created_at' | 'id'>

type LoadReportDrafts = (
  organizationId: string,
  sessionIds: string[],
) => PromiseLike<{
  data: AiReportDraft[] | null
  error: { message: string } | null
}>

export function getCurrentReportDraftBySession(drafts: AiReportDraft[] | null | undefined) {
  const bySession = new Map<string, AiReportDraft>()
  for (const draft of drafts ?? []) {
    const current = bySession.get(draft.documentation_session_id)
    if (!current) {
      bySession.set(draft.documentation_session_id, draft)
      continue
    }
    const draftTime = new Date(draft.generated_at ?? draft.created_at ?? '').getTime()
    const currentTime = new Date(current.generated_at ?? current.created_at ?? '').getTime()
    if (draftTime > currentTime || (draftTime === currentTime && draft.id.localeCompare(current.id) > 0)) bySession.set(draft.documentation_session_id, draft)
  }
  return bySession
}

export async function loadCurrentReportDraftsBySession(
  loadDrafts: LoadReportDrafts,
  organizationId: string,
  sessionIds: string[],
) {
  if (sessionIds.length === 0) return new Map<string, AiReportDraft>()
  const { data, error } = await loadDrafts(organizationId, sessionIds)
  if (error) throw new Error(error.message)
  return getCurrentReportDraftBySession(data)
}
