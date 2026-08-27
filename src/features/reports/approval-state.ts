import { revalidatePath } from 'next/cache'

import type { requireSessionWorkspace } from '@/features/sessions/data'

type WorkspaceSupabase = Awaited<ReturnType<typeof requireSessionWorkspace>>['supabase']

export type ReportDeliveryState = {
  review_status?: string | null
  status?: string | null
}

export type ReportApprovalSession = ReportDeliveryState & { id: string }

export function reportIsReadyForDelivery(session: ReportDeliveryState) {
  return session.review_status === 'ready_for_delivery' || session.status === 'finalized'
}

export async function invalidateReportApproval(
  supabase: WorkspaceSupabase,
  organizationId: string,
  session: ReportApprovalSession,
) {
  if (!reportIsReadyForDelivery(session)) return null

  const now = new Date().toISOString()
  const { error: sessionError } = await supabase
    .from('documentation_sessions')
    .update({
      status: session.status === 'finalized' ? 'review' : session.status ?? 'review',
      review_status: 'draft',
      reviewed_at: null,
      reviewed_by: null,
      updated_at: now,
    })
    .eq('id', session.id)
    .eq('organization_id', organizationId)

  if (sessionError) return sessionError.message

  const { error: draftError } = await supabase
    .from('ai_report_drafts')
    .update({
      status: 'needs_review',
      approved_at: null,
      approved_by: null,
      updated_at: now,
    })
    .eq('documentation_session_id', session.id)
    .eq('organization_id', organizationId)
    .neq('status', 'superseded')

  return draftError?.message ?? null
}

export async function invalidateReportApprovalForSessionId(
  supabase: WorkspaceSupabase,
  organizationId: string,
  sessionId: string,
) {
  const { data: session, error } = await supabase
    .from('documentation_sessions')
    .select('id, review_status, status')
    .eq('id', sessionId)
    .eq('organization_id', organizationId)
    .single()

  if (error || !session) return error?.message ?? 'Documentation session not found.'
  return invalidateReportApproval(supabase, organizationId, session)
}

export function revalidateReportWorkflow(sessionId: string) {
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/sessions')
  revalidatePath(`/dashboard/sessions/${sessionId}`)
  revalidatePath(`/dashboard/sessions/${sessionId}/capture`)
  revalidatePath(`/dashboard/sessions/${sessionId}/report`)
  revalidatePath(`/dashboard/sessions/${sessionId}/approve`)
  revalidatePath(`/dashboard/sessions/${sessionId}/export`)
}
