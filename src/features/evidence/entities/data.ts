import { notFound } from 'next/navigation'

import { requireSessionWorkspace } from '@/features/sessions/data'
import type { Database } from '@/lib/supabase/database.types'

type Tables = Database['public']['Tables']
export type EntitiesSession = Tables['documentation_sessions']['Row']
export type EvidenceEntity = Tables['evidence_entities']['Row']
export type EntityEvidenceItem = Tables['capture_items']['Row']
export type EntityTimelineEvent = Tables['timeline_events']['Row']
export type EntityRelationship = Tables['evidence_relationships']['Row']

type QueryBuilder = { select: (columns: string) => QueryBuilder; eq: (column: string, value: string) => QueryBuilder; is: (column: string, value: null) => QueryBuilder; order: (column: string, options?: { ascending?: boolean }) => QueryBuilder; single: () => Promise<{ data: unknown; error: unknown }>; then: Promise<{ data: unknown; error: unknown }>['then'] }
type SupabaseLike = { from: (table: string) => QueryBuilder }
export type EntitiesWorkspace = { supabase: unknown; profile: { organization_id: string; timezone?: string | null } }

export async function getEntitiesData(sessionId: string, workspace?: EntitiesWorkspace) {
  const rawWorkspace = workspace ?? (await requireSessionWorkspace())
  const supabase = rawWorkspace.supabase as SupabaseLike
  const { profile } = rawWorkspace
  const { data: session, error } = await supabase.from('documentation_sessions').select('*').eq('id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).single()
  if (error || !session) notFound()

  const [{ data: entities }, { data: evidenceItems }, { data: timelineEvents }, { data: relationships }] = await Promise.all([
    supabase.from('evidence_entities').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).order('entity_type', { ascending: true }).order('display_name', { ascending: true }),
    supabase.from('capture_items').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).order('captured_at', { ascending: false }),
    supabase.from('timeline_events').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).order('event_start_at', { ascending: true }),
    supabase.from('evidence_relationships').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).eq('target_type', 'entity').is('deleted_at', null),
  ])

  return { session: session as EntitiesSession, entities: (entities ?? []) as EvidenceEntity[], evidenceItems: (evidenceItems ?? []) as EntityEvidenceItem[], timelineEvents: (timelineEvents ?? []) as EntityTimelineEvent[], relationships: (relationships ?? []) as EntityRelationship[] }
}
