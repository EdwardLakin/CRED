import type { Database } from '@/lib/supabase/database.types'

type AiReportDraft = Pick<Database['public']['Tables']['ai_report_drafts']['Row'], 'documentation_session_id' | 'title' | 'header_fields' | 'generated_at' | 'created_at' | 'id'>

type SupabaseLike = {
  from(table: 'ai_report_drafts'): {
    select(columns: string): {
      eq(column: string, value: string): {
        in(column: string, values: string[]): {
          order(column: string, options: { ascending: boolean }): Promise<{ data: AiReportDraft[] | null; error: { message: string } | null }>
        }
      }
    }
  }
}

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

export async function loadCurrentReportDraftsBySession(supabase: SupabaseLike, organizationId: string, sessionIds: string[]) {
  if (sessionIds.length === 0) return new Map<string, AiReportDraft>()
  const { data, error } = await supabase
    .from('ai_report_drafts')
    .select('id, documentation_session_id, title, header_fields, generated_at, created_at')
    .eq('organization_id', organizationId)
    .in('documentation_session_id', sessionIds)
    .order('generated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return getCurrentReportDraftBySession(data)
}
