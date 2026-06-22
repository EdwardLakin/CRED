import { notFound } from 'next/navigation'

import { requireSessionWorkspace } from '@/features/sessions/data'
import type { Database } from '@/lib/supabase/database.types'

type Tables = Database['public']['Tables']
export type TimelineSession = Tables['documentation_sessions']['Row']
export type TimelineEvent = Tables['timeline_events']['Row']
export type TimelineEvidenceItem = Tables['capture_items']['Row']
export type TimelineRelationship = Tables['evidence_relationships']['Row']

type QueryBuilder = {
  select: (columns: string, options?: { count?: 'exact'; head?: boolean }) => QueryBuilder
  eq: (column: string, value: string) => QueryBuilder
  is: (column: string, value: null) => QueryBuilder
  in: (column: string, values: string[]) => QueryBuilder
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => QueryBuilder
  single: () => Promise<{ data: unknown; error: unknown }>
  then: Promise<{ data: unknown; error: unknown; count?: number | null }>['then']
}

type TimelineSupabaseLike = { from: (table: string) => QueryBuilder }
export type TimelineWorkspace = { supabase: unknown; profile: { organization_id: string; timezone?: string | null } }

export async function getTimelineData(sessionId: string, workspace?: TimelineWorkspace) {
  const rawWorkspace = workspace ?? (await requireSessionWorkspace())
  const supabase = rawWorkspace.supabase as TimelineSupabaseLike
  const { profile } = rawWorkspace

  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .single()
  if (sessionError || !session) notFound()

  const [{ data: events }, { data: evidenceItems }, { data: relationships }] = await Promise.all([
    supabase
      .from('timeline_events')
      .select('*')
      .eq('documentation_session_id', sessionId)
      .eq('organization_id', profile.organization_id)
      .is('deleted_at', null)
      .order('event_start_at', { ascending: true, nullsFirst: false })
      .order('event_time', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('capture_items')
      .select('*')
      .eq('documentation_session_id', sessionId)
      .eq('organization_id', profile.organization_id)
      .is('deleted_at', null)
      .order('captured_at', { ascending: false }),
    supabase
      .from('evidence_relationships')
      .select('*')
      .eq('documentation_session_id', sessionId)
      .eq('organization_id', profile.organization_id)
      .eq('source_type', 'capture_item')
      .eq('target_type', 'timeline_event')
      .is('deleted_at', null),
  ])

  return {
    session: session as TimelineSession,
    events: sortTimelineEvents((events ?? []) as TimelineEvent[]),
    evidenceItems: (evidenceItems ?? []) as TimelineEvidenceItem[],
    relationships: (relationships ?? []) as TimelineRelationship[],
    timeZone: profile.timezone ?? null,
  }
}

export function sortTimelineEvents(events: TimelineEvent[]) {
  return [...events].sort((a, b) => eventSortTime(a) - eventSortTime(b))
}

function eventSortTime(event: TimelineEvent) {
  return new Date(event.event_start_at ?? event.event_time ?? event.created_at).getTime()
}
