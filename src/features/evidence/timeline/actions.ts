'use server'

import { revalidatePath } from 'next/cache'
import { canUseFeature } from '@/features/billing/feature-gates'

import { requireSessionWorkspace } from '@/features/sessions/data'
import { acceptedUserRelationshipDefaults, softDeleteUpdate } from '@/features/evidence/validation'
import { throwFriendlyRelationshipMutationError } from '@/features/evidence/relationship-errors'
import { assertSameWorkspace, parseEvidenceRelationshipType, parseTimelineEventForm } from '@/features/evidence/timeline/validation'

type MutationBuilder = {
  select: (columns: string) => MutationBuilder
  eq: (column: string, value: string) => MutationBuilder
  is: (column: string, value: null) => MutationBuilder
  single: () => Promise<{ data: unknown; error: unknown }>
  insert: (values: Record<string, unknown>) => Promise<{ error: unknown }>
  update: (values: Record<string, unknown>) => MutationBuilder
  then: Promise<{ error: unknown }>['then']
}

type TimelineActionSupabase = { from: (table: string) => MutationBuilder }

function assertFeatureAccess(profile: { organization: { plan?: string | null } }) {
  if (!canUseFeature(profile, 'timeline')) throw new Error('This feature is not available on your current CRED tier.')
}

async function loadSession(supabase: TimelineActionSupabase, sessionId: string, organizationId: string) {
  const { data: session, error } = await supabase.from('documentation_sessions').select('id, organization_id').eq('id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).single()
  if (error || !session) throw new Error('Session not found')
  return session as { id: string; organization_id: string }
}

async function loadTimelineEvent(supabase: TimelineActionSupabase, eventId: string, sessionId: string, organizationId: string) {
  const { data: event, error } = await supabase.from('timeline_events').select('id, documentation_session_id, organization_id').eq('id', eventId).eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).single()
  if (error || !event) throw new Error('Timeline event not found')
  return event as { id: string; documentation_session_id: string; organization_id: string }
}

async function loadCaptureItem(supabase: TimelineActionSupabase, captureId: string, sessionId: string, organizationId: string) {
  const { data: capture, error } = await supabase.from('capture_items').select('id, documentation_session_id, organization_id').eq('id', captureId).eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).single()
  if (error || !capture) throw new Error('Evidence item not found')
  return capture as { id: string; documentation_session_id: string; organization_id: string }
}

export async function createTimelineEvent(sessionId: string, formData: FormData) {
  const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
  assertFeatureAccess(profile)
  const supabase = rawSupabase as unknown as TimelineActionSupabase
  await loadSession(supabase, sessionId, profile.organization_id)
  const values = parseTimelineEventForm(formData)
  const now = new Date().toISOString()
  const reviewStatus = values.source_kind === 'system' ? values.review_status : 'accepted'
  const { error } = await supabase.from('timeline_events').insert({ ...values, event_time: values.event_start_at ?? now, event_type: values.event_type, review_status: reviewStatus, documentation_session_id: sessionId, organization_id: profile.organization_id, provenance: { created_from: 'timeline_workspace' }, created_by: profile.id ?? null, reviewed_at: reviewStatus === 'accepted' ? now : null, updated_at: now })
  if (error) throw new Error('Unable to create timeline event')
  revalidatePath(`/dashboard/sessions/${sessionId}/timeline`)
}

export async function updateTimelineEvent(sessionId: string, eventId: string, formData: FormData) {
  const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
  assertFeatureAccess(profile)
  const supabase = rawSupabase as unknown as TimelineActionSupabase
  await loadTimelineEvent(supabase, eventId, sessionId, profile.organization_id)
  const values = parseTimelineEventForm(formData)
  const { error } = await supabase.from('timeline_events').update({ ...values, updated_at: new Date().toISOString() }).eq('id', eventId).eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null)
  if (error) throw new Error('Unable to update timeline event')
  revalidatePath(`/dashboard/sessions/${sessionId}/timeline`)
}

export async function deleteTimelineEvent(sessionId: string, eventId: string) {
  const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
  assertFeatureAccess(profile)
  const supabase = rawSupabase as unknown as TimelineActionSupabase
  await loadTimelineEvent(supabase, eventId, sessionId, profile.organization_id)
  const { error } = await supabase.from('timeline_events').update(softDeleteUpdate()).eq('id', eventId).eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null)
  if (error) throw new Error('Unable to delete timeline event')
  revalidatePath(`/dashboard/sessions/${sessionId}/timeline`)
}

export async function linkEvidenceToTimelineEvent(sessionId: string, eventId: string, formData: FormData) {
  const captureId = String(formData.get('capture_item_id') ?? '').trim()
  const relationshipType = parseEvidenceRelationshipType(formData.get('relationship_type'))
  if (!captureId) throw new Error('Select an evidence item')
  if (!relationshipType) throw new Error('Invalid relationship type')
  const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
  assertFeatureAccess(profile)
  const supabase = rawSupabase as unknown as TimelineActionSupabase
  const event = await loadTimelineEvent(supabase, eventId, sessionId, profile.organization_id)
  const capture = await loadCaptureItem(supabase, captureId, sessionId, profile.organization_id)
  assertSameWorkspace(event, capture)
  const now = new Date().toISOString()
  const { error } = await supabase.from('evidence_relationships').insert({ documentation_session_id: sessionId, organization_id: profile.organization_id, source_type: 'capture_item', source_id: captureId, target_type: 'timeline_event', target_id: eventId, relationship_type: relationshipType, ...acceptedUserRelationshipDefaults('timeline_workspace', profile.id, now) })
  if (error) throwFriendlyRelationshipMutationError(error, 'Unable to link evidence')
  revalidatePath(`/dashboard/sessions/${sessionId}/timeline`)
}

export async function unlinkEvidenceRelationship(sessionId: string, relationshipId: string) {
  const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
  assertFeatureAccess(profile)
  const supabase = rawSupabase as unknown as TimelineActionSupabase
  const { error } = await supabase.from('evidence_relationships').update(softDeleteUpdate()).eq('id', relationshipId).eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).eq('source_type', 'capture_item').eq('target_type', 'timeline_event').is('deleted_at', null)
  if (error) throw new Error('Unable to unlink evidence')
  revalidatePath(`/dashboard/sessions/${sessionId}/timeline`)
}
