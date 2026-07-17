'use server'

import { revalidatePath } from 'next/cache'
import { canUseFeature } from '@/features/billing/feature-gates'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { archiveDeliverableDraft, createDeliverableRecord, finalizeDeliverableVersion, restoreDeliverableDraft } from './data'
import { createDeliverableShareLink } from './share'
import { parseDeliverableSourceSelection, parseDeliverableType } from './validation'

type QueryBuilder = { select: (columns: string) => QueryBuilder; eq: (column: string, value: string) => QueryBuilder; is: (column: string, value: null) => QueryBuilder; single: () => Promise<{ data: unknown; error: unknown }> }
type SupabaseLike = { from: (table: string) => QueryBuilder }

function assertFeatureAccess(profile: { organization: { plan?: string | null } }, type?: string) {
  if (!canUseFeature(profile, 'deliverables')) throw new Error('This feature is not available on your current CRED tier.')
  if (type === 'relationship_map' && !canUseFeature(profile, 'investigation_deliverables')) throw new Error('Relationship Map deliverables require CRED Investigation.')
}
type ShareTokenMutationResult = { data: { id: string } | null; error: { message: string } | null }
type ShareTokenUpdateBuilder = {
  eq: (column: string, value: string) => ShareTokenUpdateBuilder
  select: (columns: 'id') => ShareTokenUpdateBuilder
  maybeSingle: () => Promise<ShareTokenMutationResult>
}
type ShareTokenMutationClient = {
  from: (table: 'report_share_tokens') => {
    update: (values: { disabled_at: string }) => ShareTokenUpdateBuilder
  }
}

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
    assertFeatureAccess(profile, type)
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
  assertFeatureAccess(profile)
    const supabase = rawSupabase as unknown as SupabaseLike
    await assertSession(supabase, sessionId, profile.organization_id)
    await finalizeDeliverableVersion(rawSupabase as never, sessionId, profile.organization_id, deliverableId)
    revalidateDeliverableRoutes(sessionId, deliverableId)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: userSafeError(error) }
  }
}

export async function archiveEvidenceDeliverable(sessionId: string, deliverableId: string): Promise<ActionResult> {
  try {
    const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
  assertFeatureAccess(profile)
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
  assertFeatureAccess(profile)
    const supabase = rawSupabase as unknown as SupabaseLike
    await assertSession(supabase, sessionId, profile.organization_id)
    await restoreDeliverableDraft(rawSupabase as never, sessionId, profile.organization_id, deliverableId)
    revalidateDeliverableRoutes(sessionId, deliverableId)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: userSafeError(error) }
  }
}

export async function createEvidenceDeliverableShareLink(sessionId: string, deliverableId: string, formData?: FormData): Promise<ActionResult> {
  try {
    const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
  assertFeatureAccess(profile)
    const supabase = rawSupabase as unknown as SupabaseLike
    await assertSession(supabase, sessionId, profile.organization_id)
    await createDeliverableShareLink({ supabase: rawSupabase as never, profile: profile as never, sessionId, deliverableId, expiresAt: formData?.get('expires_at')?.toString() || null })
    revalidateDeliverableRoutes(sessionId, deliverableId)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: userSafeError(error) }
  }
}

export async function revokeEvidenceDeliverableShareLink(sessionId: string, deliverableId: string, tokenId: string): Promise<ActionResult> {
  try {
    const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
  assertFeatureAccess(profile)
    const shareTokenSupabase = rawSupabase as unknown as ShareTokenMutationClient
    const { data, error } = await shareTokenSupabase
      .from('report_share_tokens')
      .update({ disabled_at: new Date().toISOString() })
      .eq('id', tokenId)
      .eq('organization_id', profile.organization_id)
      .eq('documentation_session_id', sessionId)
      .eq('deliverable_id', deliverableId)
      .eq('link_kind', 'deliverable')
      .select('id')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('Share link not found')
    revalidateDeliverableRoutes(sessionId, deliverableId)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: userSafeError(error) }
  }
}

export async function rotateEvidenceDeliverableShareLink(sessionId: string, deliverableId: string, tokenId: string, formData?: FormData): Promise<ActionResult> {
  const revoked = await revokeEvidenceDeliverableShareLink(sessionId, deliverableId, tokenId)
  if (!revoked.ok) return revoked
  return createEvidenceDeliverableShareLink(sessionId, deliverableId, formData)
}

export async function generateEvidenceDeliverableFormAction(sessionId: string, formData: FormData): Promise<void> {
  await generateEvidenceDeliverable(sessionId, formData)
}

export async function finalizeEvidenceDeliverableFormAction(sessionId: string, deliverableId: string): Promise<void> {
  await finalizeEvidenceDeliverable(sessionId, deliverableId)
}

export async function archiveEvidenceDeliverableFormAction(sessionId: string, deliverableId: string): Promise<void> {
  await archiveEvidenceDeliverable(sessionId, deliverableId)
}

export async function restoreArchivedDeliverableFormAction(sessionId: string, deliverableId: string): Promise<void> {
  await restoreArchivedDeliverable(sessionId, deliverableId)
}


export async function createEvidenceDeliverableShareLinkFormAction(sessionId: string, deliverableId: string, formData: FormData): Promise<void> {
  await createEvidenceDeliverableShareLink(sessionId, deliverableId, formData)
}

export async function revokeEvidenceDeliverableShareLinkFormAction(sessionId: string, deliverableId: string, tokenId: string): Promise<void> {
  await revokeEvidenceDeliverableShareLink(sessionId, deliverableId, tokenId)
}

export async function rotateEvidenceDeliverableShareLinkFormAction(sessionId: string, deliverableId: string, tokenId: string, formData: FormData): Promise<void> {
  await rotateEvidenceDeliverableShareLink(sessionId, deliverableId, tokenId, formData)
}
