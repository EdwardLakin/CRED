'use server'

import { revalidatePath } from 'next/cache'

import { requireSessionWorkspace } from '@/features/sessions/data'
import { acceptedUserRelationshipDefaults, softDeleteUpdate } from '@/features/evidence/validation'
import { throwFriendlyRelationshipMutationError } from '@/features/evidence/relationship-errors'
import { assertSameWorkspace, parseAssertionForm, parseAssertionRelationshipType } from '@/features/evidence/assertions/validation'

type MutationBuilder = { select: (columns: string) => MutationBuilder; eq: (column: string, value: string) => MutationBuilder; is: (column: string, value: null) => MutationBuilder; single: () => Promise<{ data: unknown; error: unknown }>; insert: (values: Record<string, unknown>) => Promise<{ error: unknown }>; update: (values: Record<string, unknown>) => MutationBuilder; then: Promise<{ error: unknown }>['then'] }
type SupabaseLike = { from: (table: string) => MutationBuilder }
type WorkspaceRow = { id: string; documentation_session_id: string; organization_id: string }

async function loadSession(supabase: SupabaseLike, sessionId: string, organizationId: string) {
  const { data, error } = await supabase.from('documentation_sessions').select('id, organization_id').eq('id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).single()
  if (error || !data) throw new Error('Session not found')
  return { id: sessionId, documentation_session_id: sessionId, organization_id: organizationId }
}
async function loadAssertion(supabase: SupabaseLike, assertionId: string, sessionId: string, organizationId: string) {
  const { data, error } = await supabase.from('evidence_assertions').select('id, documentation_session_id, organization_id').eq('id', assertionId).eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).single()
  if (error || !data) throw new Error('Factual observation not found')
  return data as WorkspaceRow
}
async function loadSource(supabase: SupabaseLike, sourceType: string, sourceId: string, sessionId: string, organizationId: string) {
  const table = sourceType === 'timeline_event' ? 'timeline_events' : sourceType === 'entity' ? 'evidence_entities' : 'capture_items'
  const { data, error } = await supabase.from(table).select('id, documentation_session_id, organization_id').eq('id', sourceId).eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).single()
  if (error || !data) throw new Error('Relationship source not found')
  return data as WorkspaceRow
}

export async function createEvidenceAssertion(sessionId: string, formData: FormData) {
  const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
  const supabase = rawSupabase as unknown as SupabaseLike
  await loadSession(supabase, sessionId, profile.organization_id)
  const values = parseAssertionForm(formData)
  const now = new Date().toISOString()
  const { error } = await supabase.from('evidence_assertions').insert({ ...values, documentation_session_id: sessionId, organization_id: profile.organization_id, provenance: { created_from: 'assertions_workspace' }, created_by: profile.id ?? null, reviewed_at: values.review_status === 'accepted' ? now : null, reviewed_by: values.review_status === 'accepted' ? profile.id ?? null : null, updated_at: now })
  if (error) throw new Error('Unable to create factual observation')
  revalidatePath(`/dashboard/sessions/${sessionId}/assertions`)
}

export async function updateEvidenceAssertion(sessionId: string, assertionId: string, formData: FormData) {
  const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
  const supabase = rawSupabase as unknown as SupabaseLike
  await loadAssertion(supabase, assertionId, sessionId, profile.organization_id)
  const values = parseAssertionForm(formData)
  const now = new Date().toISOString()
  const { error } = await supabase.from('evidence_assertions').update({ ...values, reviewed_at: values.review_status === 'accepted' ? now : null, reviewed_by: values.review_status === 'accepted' ? profile.id ?? null : null, updated_at: now }).eq('id', assertionId).eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null)
  if (error) throw new Error('Unable to update factual observation')
  revalidatePath(`/dashboard/sessions/${sessionId}/assertions`)
}

export async function deleteEvidenceAssertion(sessionId: string, assertionId: string) {
  const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
  const supabase = rawSupabase as unknown as SupabaseLike
  await loadAssertion(supabase, assertionId, sessionId, profile.organization_id)
  const { error } = await supabase.from('evidence_assertions').update(softDeleteUpdate()).eq('id', assertionId).eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null)
  if (error) throw new Error('Unable to delete factual observation')
  revalidatePath(`/dashboard/sessions/${sessionId}/assertions`)
}

export async function linkAssertionRelationship(sessionId: string, assertionId: string, formData: FormData) {
  const sourceType = String(formData.get('source_type') ?? '').trim()
  const sourceId = String(formData.get('source_id') ?? '').trim()
  if (!['capture_item', 'entity', 'timeline_event'].includes(sourceType)) throw new Error('Invalid relationship source type')
  if (!sourceId) throw new Error('Select a relationship source')
  const relationshipType = parseAssertionRelationshipType(formData.get('relationship_type'), sourceType)
  if (!relationshipType) throw new Error('Invalid factual observation relationship type')
  const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
  const supabase = rawSupabase as unknown as SupabaseLike
  const assertion = await loadAssertion(supabase, assertionId, sessionId, profile.organization_id)
  const source = await loadSource(supabase, sourceType, sourceId, sessionId, profile.organization_id)
  assertSameWorkspace(assertion, source)
  const now = new Date().toISOString()
  const { error } = await supabase.from('evidence_relationships').insert({ documentation_session_id: sessionId, organization_id: profile.organization_id, source_type: sourceType, source_id: sourceId, target_type: 'assertion', target_id: assertionId, relationship_type: relationshipType, ...acceptedUserRelationshipDefaults('assertions_workspace', profile.id, now) })
  if (error) throwFriendlyRelationshipMutationError(error, 'Unable to link factual observation')
  revalidatePath(`/dashboard/sessions/${sessionId}/assertions`)
}

export async function unlinkAssertionRelationship(sessionId: string, relationshipId: string) {
  const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
  const supabase = rawSupabase as unknown as SupabaseLike
  const { error } = await supabase.from('evidence_relationships').update(softDeleteUpdate()).eq('id', relationshipId).eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).eq('target_type', 'assertion').is('deleted_at', null)
  if (error) throw new Error('Unable to unlink factual observation')
  revalidatePath(`/dashboard/sessions/${sessionId}/assertions`)
}
