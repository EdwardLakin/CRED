'use server'

import { revalidatePath } from 'next/cache'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { generateEvidenceSuggestions } from '@/features/evidence/suggestions/service'
import { parseEditedSuggestion, parseSuggestionCategory, parseSuggestionDecision } from '@/features/evidence/suggestions/validation'

type MutationBuilder = { select: (columns: string) => MutationBuilder; eq: (column: string, value: string) => MutationBuilder; is: (column: string, value: null) => MutationBuilder; single: () => Promise<{ data: unknown; error: unknown }>; order: (column: string, options?: { ascending?: boolean }) => MutationBuilder; insert: (values: Record<string, unknown> | Record<string, unknown>[]) => Promise<{ error: unknown }>; update: (values: Record<string, unknown>) => MutationBuilder; then: Promise<{ error: unknown }>['then'] }
type SupabaseLike = { from: (table: string) => MutationBuilder }
const TABLES = { timeline: 'timeline_events', entity: 'evidence_entities', observation: 'evidence_assertions', relationship: 'evidence_relationships' } as const

async function loadSession(supabase: SupabaseLike, sessionId: string, organizationId: string) { const { data, error } = await supabase.from('documentation_sessions').select('id, organization_id').eq('id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).single(); if (error || !data) throw new Error('Session not found') }

export async function generateAiEvidenceSuggestions(sessionId: string) {
  const { supabase: rawSupabase, profile } = await requireSessionWorkspace(); const supabase = rawSupabase as unknown as SupabaseLike; await loadSession(supabase, sessionId, profile.organization_id)
  const suggestions = await generateEvidenceSuggestions(sessionId, { supabase, organizationId: profile.organization_id, userId: profile.id ?? null, timezone: profile.timezone ?? null })
  for (const [table, rows] of Object.entries(suggestions)) if (rows.length) { const { error } = await supabase.from(table).insert(rows); if (error) throw new Error('Unable to create AI suggestions') }
  revalidatePath(`/dashboard/sessions/${sessionId}/suggestions`)
}

export async function reviewEvidenceSuggestion(sessionId: string, suggestionId: string, formData: FormData) {
  const category = parseSuggestionCategory(formData.get('category')); const decision = parseSuggestionDecision(formData.get('decision'))
  const { supabase: rawSupabase, profile } = await requireSessionWorkspace(); const supabase = rawSupabase as unknown as SupabaseLike; await loadSession(supabase, sessionId, profile.organization_id)
  const now = new Date().toISOString(); const edits = decision === 'edited' ? parseEditedSuggestion(category, formData) : {}
  const { error } = await supabase.from(TABLES[category]).update({ ...edits, review_status: decision, reviewed_at: decision === 'rejected' ? null : now, reviewed_by: decision === 'rejected' ? null : profile.id ?? null, updated_at: now }).eq('id', suggestionId).eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null)
  if (error) throw new Error('Unable to review suggestion')
  revalidatePath(`/dashboard/sessions/${sessionId}/suggestions`)
}
