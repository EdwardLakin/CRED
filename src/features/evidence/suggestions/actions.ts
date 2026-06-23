'use server'

import { revalidatePath } from 'next/cache'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { assertSameEvidenceWorkspace } from '@/features/evidence/validation'
import { generateEvidenceSuggestions } from '@/features/evidence/suggestions/service'
import { parseEditedSuggestion, parseSuggestionCategory, parseSuggestionDecision, type SuggestionCategory } from '@/features/evidence/suggestions/validation'

type MutationBuilder = { select: (columns: string) => MutationBuilder; eq: (column: string, value: string) => MutationBuilder; is: (column: string, value: null) => MutationBuilder; single: () => Promise<{ data: unknown; error: unknown }>; order: (column: string, options?: { ascending?: boolean }) => MutationBuilder; insert: (values: Record<string, unknown> | Record<string, unknown>[]) => Promise<{ error: unknown }>; update: (values: Record<string, unknown>) => MutationBuilder; then: Promise<{ error: unknown }>['then'] }
type SupabaseLike = { from: (table: string) => MutationBuilder }
type WorkspaceRow = { id: string; documentation_session_id: string; organization_id: string }
type RelationshipSuggestionRow = WorkspaceRow & { source_type: string; source_id: string; target_type: string; target_id: string; review_status: string }
const TABLES = { timeline: 'timeline_events', entity: 'evidence_entities', observation: 'evidence_assertions', relationship: 'evidence_relationships' } as const

async function loadSession(supabase: SupabaseLike, sessionId: string, organizationId: string) { const { data, error } = await supabase.from('documentation_sessions').select('id, organization_id').eq('id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).single(); if (error || !data) throw new Error('Session not found') }

async function loadSuggestionForReview(supabase: SupabaseLike, category: SuggestionCategory, suggestionId: string, sessionId: string, organizationId: string) {
  const sourceFilter = category === 'timeline' ? { column: 'source_kind', value: 'ai' } : { column: 'suggestion_source', value: 'ai' }
  const { data, error } = await supabase.from(TABLES[category]).select('*').eq('id', suggestionId).eq('documentation_session_id', sessionId).eq('organization_id', organizationId).eq(sourceFilter.column, sourceFilter.value).eq('review_status', 'suggested').is('deleted_at', null).single()
  if (error || !data) throw new Error('Suggestion not found')
  return data as WorkspaceRow
}

async function loadRelationshipEndpoint(supabase: SupabaseLike, objectType: string, objectId: string, sessionId: string, organizationId: string) {
  const table = objectType === 'capture_item' ? 'capture_items' : objectType === 'timeline_event' ? 'timeline_events' : objectType === 'entity' ? 'evidence_entities' : objectType === 'assertion' ? 'evidence_assertions' : null
  if (!table) throw new Error('Invalid relationship endpoint')
  const { data, error } = await supabase.from(table).select('id, documentation_session_id, organization_id').eq('id', objectId).eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).single()
  if (error || !data) throw new Error('Relationship endpoint not found')
  return data as WorkspaceRow
}

async function assertRelationshipSuggestionEndpoints(supabase: SupabaseLike, relationship: RelationshipSuggestionRow, sessionId: string, organizationId: string) {
  const [source, target] = await Promise.all([
    loadRelationshipEndpoint(supabase, relationship.source_type, relationship.source_id, sessionId, organizationId),
    loadRelationshipEndpoint(supabase, relationship.target_type, relationship.target_id, sessionId, organizationId),
  ])
  assertSameEvidenceWorkspace(source, target, 'Suggestion relationship endpoints must stay within the same session and organization')
  assertSameEvidenceWorkspace(relationship, source, 'Suggestion relationship must match its source endpoint workspace')
  assertSameEvidenceWorkspace(relationship, target, 'Suggestion relationship must match its target endpoint workspace')
}

export async function generateAiEvidenceSuggestions(sessionId: string) {
  const { supabase: rawSupabase, profile } = await requireSessionWorkspace(); const supabase = rawSupabase as unknown as SupabaseLike; await loadSession(supabase, sessionId, profile.organization_id)
  const suggestions = await generateEvidenceSuggestions(sessionId, { supabase, organizationId: profile.organization_id, userId: profile.id ?? null, timezone: profile.timezone ?? null })
  for (const [table, rows] of Object.entries(suggestions)) if (rows.length) { const { error } = await supabase.from(table).insert(rows); if (error) throw new Error('Unable to create AI suggestions') }
  revalidatePath(`/dashboard/sessions/${sessionId}/suggestions`)
}

export async function reviewEvidenceSuggestion(sessionId: string, suggestionId: string, formData: FormData) {
  const category = parseSuggestionCategory(formData.get('category')); const decision = parseSuggestionDecision(formData.get('decision'))
  const { supabase: rawSupabase, profile } = await requireSessionWorkspace(); const supabase = rawSupabase as unknown as SupabaseLike; await loadSession(supabase, sessionId, profile.organization_id)
  const suggestion = await loadSuggestionForReview(supabase, category, suggestionId, sessionId, profile.organization_id)
  if (category === 'relationship') await assertRelationshipSuggestionEndpoints(supabase, suggestion as RelationshipSuggestionRow, sessionId, profile.organization_id)
  const now = new Date().toISOString(); const edits = decision === 'edited' ? parseEditedSuggestion(category, formData) : {}
  const { error } = await supabase.from(TABLES[category]).update({ ...edits, review_status: decision, reviewed_at: decision === 'rejected' ? null : now, reviewed_by: decision === 'rejected' ? null : profile.id ?? null, updated_at: now }).eq('id', suggestionId).eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).eq('review_status', 'suggested').is('deleted_at', null)
  if (error) throw new Error('Unable to review suggestion')
  revalidatePath(`/dashboard/sessions/${sessionId}/suggestions`)
}
