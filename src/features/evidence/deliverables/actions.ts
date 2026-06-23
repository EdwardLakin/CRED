'use server'

import { revalidatePath } from 'next/cache'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { archiveDeliverableDraft, createDeliverableRecord, finalizeDeliverableVersion, restoreDeliverableDraft } from './data'
import { parseDeliverableSourceSelection, parseDeliverableType } from './validation'

type QueryBuilder = { select: (columns: string) => QueryBuilder; eq: (column: string, value: string) => QueryBuilder; is: (column: string, value: null) => QueryBuilder; single: () => Promise<{ data: unknown; error: unknown }> }
type SupabaseLike = { from: (table: string) => QueryBuilder }

type ActionResult = { ok: true } | { ok: false; error: string }

async function assertSession(supabase: SupabaseLike, sessionId: string, organizationId: string) {
  const { data, error } = await supabase.from('documentation_sessions').select('id').eq('id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).single()
  if (error || !data) throw new Error('Session not found')
}

function revalidateDeliverableRoutes(sessionId: string, deliverableId?: string) {
  revalidatePath(`/dashboard/sessions/${sessionId}/deliverables`)
  if (deliverableId) {
    revalidatePath(`/dashboard/sessions/${sessionId}/deliverables/${deliverableId}`)
    revalidatePath(`/dashboard/sessions/${sessionId}/deliverables/${deliverableId}/print`)
  }
}

function userSafeError(error: unknown) {
  return error instanceof Error ? error.message : 'Unable to update deliverable'
}

export async function generateEvidenceDeliverable(sessionId: string, formData: FormData): Promise<ActionResult> {
  try {
    const type = parseDeliverableType(formData.get('deliverable_type'))
    const sourceSelection = parseDeliverableSourceSelection(formData)
    const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
    const supabase = rawSupabase as unknown as SupabaseLike
    await assertSession(supabase, sessionId, profile.organization_id)
    await createDeliverableRecord(rawSupabase as never, sessionId, profile.organization_id, profile.id, type, sourceSelection)
    revalidateDeliverableRoutes(sessionId)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: userSafeError(error) }
  }
}

export async function finalizeEvidenceDeliverable(sessionId: string, deliverableId: string): Promise<ActionResult> {
  try {
    const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
    const supabase = rawSupabase as unknown as SupabaseLike
    await assertSession(supabase, sessionId, profile.organization_id)
    await finalizeDeliverableVersion(rawSupabase as never, sessionId, profile.organization_id, profile.id, deliverableId)
    revalidateDeliverableRoutes(sessionId, deliverableId)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: userSafeError(error) }
  }
}

export async function archiveEvidenceDeliverable(sessionId: string, deliverableId: string): Promise<ActionResult> {
  try {
    const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
    const supabase = rawSupabase as unknown as SupabaseLike
    await assertSession(supabase, sessionId, profile.organization_id)
    await archiveDeliverableDraft(rawSupabase as never, sessionId, profile.organization_id, deliverableId)
    revalidateDeliverableRoutes(sessionId, deliverableId)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: userSafeError(error) }
  }
}

export async function restoreArchivedDeliverable(sessionId: string, deliverableId: string): Promise<ActionResult> {
  try {
    const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
    const supabase = rawSupabase as unknown as SupabaseLike
    await assertSession(supabase, sessionId, profile.organization_id)
    await restoreDeliverableDraft(rawSupabase as never, sessionId, profile.organization_id, deliverableId)
    revalidateDeliverableRoutes(sessionId, deliverableId)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: userSafeError(error) }
  }
}
