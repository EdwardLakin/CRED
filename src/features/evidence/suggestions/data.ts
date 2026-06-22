import { notFound } from 'next/navigation'
import { requireSessionWorkspace } from '@/features/sessions/data'
import type { Database } from '@/lib/supabase/database.types'
type Tables = Database['public']['Tables']
export type SuggestionSession = Tables['documentation_sessions']['Row']; export type TimelineSuggestion = Tables['timeline_events']['Row']; export type EntitySuggestion = Tables['evidence_entities']['Row']; export type ObservationSuggestion = Tables['evidence_assertions']['Row']; export type RelationshipSuggestion = Tables['evidence_relationships']['Row']; export type SourceEvidence = Tables['capture_items']['Row']
type QueryBuilder = { select: (columns: string) => QueryBuilder; eq: (column: string, value: string) => QueryBuilder; is: (column: string, value: null) => QueryBuilder; order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => QueryBuilder; single: () => Promise<{ data: unknown; error: unknown }>; then: Promise<{ data: unknown; error: unknown }>['then'] }
type SupabaseLike = { from: (table: string) => QueryBuilder }
export type SuggestionsWorkspace = { supabase: unknown; profile: { organization_id: string; timezone?: string | null } }
export async function getSuggestionsData(sessionId: string, workspace?: SuggestionsWorkspace) {
  const rawWorkspace = workspace ?? (await requireSessionWorkspace()); const supabase = rawWorkspace.supabase as SupabaseLike; const { profile } = rawWorkspace
  const { data: session, error } = await supabase.from('documentation_sessions').select('*').eq('id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).single(); if (error || !session) notFound()
  const [{ data: evidenceItems }, { data: timelineSuggestions }, { data: entitySuggestions }, { data: observationSuggestions }, { data: relationshipSuggestions }] = await Promise.all([
    supabase.from('capture_items').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).order('captured_at', { ascending: false }),
    supabase.from('timeline_events').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).eq('source_kind', 'ai').is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('evidence_entities').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).eq('suggestion_source', 'ai').is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('evidence_assertions').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).eq('suggestion_source', 'ai').is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('evidence_relationships').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).eq('suggestion_source', 'ai').is('deleted_at', null).order('created_at', { ascending: false }),
  ])
  return { session: session as SuggestionSession, evidenceItems: (evidenceItems ?? []) as SourceEvidence[], timelineSuggestions: (timelineSuggestions ?? []) as TimelineSuggestion[], entitySuggestions: (entitySuggestions ?? []) as EntitySuggestion[], observationSuggestions: (observationSuggestions ?? []) as ObservationSuggestion[], relationshipSuggestions: (relationshipSuggestions ?? []) as RelationshipSuggestion[], timeZone: profile.timezone ?? null }
}
