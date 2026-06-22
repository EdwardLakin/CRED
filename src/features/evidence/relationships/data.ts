import { notFound } from 'next/navigation'

import { requireSessionWorkspace } from '@/features/sessions/data'
import type { Database } from '@/lib/supabase/database.types'

type Tables = Database['public']['Tables']
export type RelationshipSession = Tables['documentation_sessions']['Row']
export type RelationshipRecord = Tables['evidence_relationships']['Row']
export type RelationshipEvidenceItem = Tables['capture_items']['Row']
export type RelationshipTimelineEvent = Tables['timeline_events']['Row']
export type RelationshipEntity = Tables['evidence_entities']['Row']
export type RelationshipAssertion = Tables['evidence_assertions']['Row']

type QueryBuilder = { select: (columns: string, options?: { count?: 'exact'; head?: boolean }) => QueryBuilder; eq: (column: string, value: string) => QueryBuilder; is: (column: string, value: null) => QueryBuilder; order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => QueryBuilder; single: () => Promise<{ data: unknown; error: unknown }>; then: Promise<{ data: unknown; error: unknown; count?: number | null }>['then'] }
type SupabaseLike = { from: (table: string) => QueryBuilder }
export type RelationshipsWorkspace = { supabase: unknown; profile: { organization_id: string; timezone?: string | null } }

export type RelationshipExplorerData = Awaited<ReturnType<typeof getRelationshipExplorerData>>

export async function getRelationshipExplorerData(sessionId: string, workspace?: RelationshipsWorkspace) {
  const rawWorkspace = workspace ?? (await requireSessionWorkspace())
  const supabase = rawWorkspace.supabase as SupabaseLike
  const { profile } = rawWorkspace
  const { data: session, error } = await supabase.from('documentation_sessions').select('*').eq('id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).single()
  if (error || !session) notFound()

  const [{ data: relationships }, { data: evidenceItems }, { data: timelineEvents }, { data: entities }, { data: assertions }] = await Promise.all([
    supabase.from('evidence_relationships').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('capture_items').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).order('captured_at', { ascending: false }),
    supabase.from('timeline_events').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).order('event_start_at', { ascending: true, nullsFirst: false }),
    supabase.from('evidence_entities').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).order('display_name', { ascending: true }),
    supabase.from('evidence_assertions').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).order('created_at', { ascending: true }),
  ])

  const relationshipRecords = (relationships ?? []) as RelationshipRecord[]
  return {
    session: session as RelationshipSession,
    relationships: relationshipRecords,
    evidenceItems: (evidenceItems ?? []) as RelationshipEvidenceItem[],
    timelineEvents: (timelineEvents ?? []) as RelationshipTimelineEvent[],
    entities: (entities ?? []) as RelationshipEntity[],
    assertions: (assertions ?? []) as RelationshipAssertion[],
    summary: buildRelationshipSummary(relationshipRecords),
    timeZone: profile.timezone ?? null,
  }
}

export function buildRelationshipSummary(relationships: RelationshipRecord[]) {
  return {
    totalRelationships: relationships.length,
    evidenceLinkedToEvents: countRelationshipsBetween(relationships, 'capture_item', 'timeline_event'),
    evidenceLinkedToEntities: countRelationshipsBetween(relationships, 'capture_item', 'entity'),
    evidenceLinkedToObservations: countRelationshipsBetween(relationships, 'capture_item', 'assertion'),
    eventsLinkedToEntities: countRelationshipsBetween(relationships, 'timeline_event', 'entity'),
    eventsLinkedToObservations: countRelationshipsBetween(relationships, 'timeline_event', 'assertion'),
    entitiesLinkedToObservations: countRelationshipsBetween(relationships, 'entity', 'assertion'),
  }
}

function countRelationshipsBetween(relationships: RelationshipRecord[], left: string, right: string) {
  return relationships.filter((relationship) => (relationship.source_type === left && relationship.target_type === right) || (relationship.source_type === right && relationship.target_type === left)).length
}
