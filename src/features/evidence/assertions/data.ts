import { notFound } from 'next/navigation'

import { requireSessionWorkspace } from '@/features/sessions/data'
import type { Database } from '@/lib/supabase/database.types'

type Tables = Database['public']['Tables']
export type AssertionsSession = Tables['documentation_sessions']['Row']
export type EvidenceAssertion = Tables['evidence_assertions']['Row']
export type AssertionEvidenceItem = Tables['capture_items']['Row']
export type AssertionEntity = Tables['evidence_entities']['Row']
export type AssertionTimelineEvent = Tables['timeline_events']['Row']
export type AssertionRelationship = Tables['evidence_relationships']['Row']

type QueryBuilder = { select: (columns: string) => QueryBuilder; eq: (column: string, value: string) => QueryBuilder; is: (column: string, value: null) => QueryBuilder; order: (column: string, options?: { ascending?: boolean }) => QueryBuilder; single: () => Promise<{ data: unknown; error: unknown }>; then: Promise<{ data: unknown; error: unknown }>['then'] }
type SupabaseLike = { from: (table: string) => QueryBuilder }
export type AssertionsWorkspace = { supabase: unknown; profile: { organization_id: string; timezone?: string | null } }

export async function getAssertionsData(sessionId: string, workspace?: AssertionsWorkspace) {
  const rawWorkspace = workspace ?? (await requireSessionWorkspace())
  const supabase = rawWorkspace.supabase as SupabaseLike
  const { profile } = rawWorkspace
  const { data: session, error } = await supabase.from('documentation_sessions').select('*').eq('id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).single()
  if (error || !session) notFound()

  const [{ data: assertions }, { data: evidenceItems }, { data: entities }, { data: timelineEvents }, { data: relationships }] = await Promise.all([
    supabase.from('evidence_assertions').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).order('assertion_type', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('capture_items').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).order('captured_at', { ascending: false }),
    supabase.from('evidence_entities').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).order('display_name', { ascending: true }),
    supabase.from('timeline_events').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).order('event_start_at', { ascending: true }),
    supabase.from('evidence_relationships').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).eq('target_type', 'assertion').is('deleted_at', null),
  ])

  return { session: session as AssertionsSession, assertions: (assertions ?? []) as EvidenceAssertion[], evidenceItems: (evidenceItems ?? []) as AssertionEvidenceItem[], entities: (entities ?? []) as AssertionEntity[], timelineEvents: (timelineEvents ?? []) as AssertionTimelineEvent[], relationships: (relationships ?? []) as AssertionRelationship[] }
}
