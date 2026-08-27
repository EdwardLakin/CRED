'use server'

import { revalidatePath } from 'next/cache'
import { canUseFeature } from '@/features/billing/feature-gates'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { parseEvidenceReviewStatus } from '@/features/evidence/library/validation'
import { parseSuggestionCategory, parseSuggestionDecision } from '@/features/evidence/suggestions/validation'

type Builder = { select: (columns: string) => Builder; eq: (column: string, value: string | boolean) => Builder; in: (column: string, values: string[]) => Builder; is: (column: string, value: null) => Builder; single: () => Promise<{ data: unknown; error: unknown }>; update: (values: Record<string, unknown>) => Builder; then: Promise<{ error: unknown }>['then'] }
type SupabaseLike = { from: (table: string) => Builder }

function assertFeatureAccess(profile: { organization: { plan?: string | null } }) {
  if (!canUseFeature(profile, 'review_queue')) throw new Error('This feature is not available on your current CRED tier.')
}
const TABLES = { timeline: 'timeline_events', entity: 'evidence_entities', observation: 'evidence_assertions', relationship: 'evidence_relationships' } as const

function selectedIds(formData: FormData) { return formData.getAll('selected').map(String).filter(Boolean) }
async function assertSession(sessionId: string, supabase: SupabaseLike, organizationId: string) { const { data, error } = await supabase.from('documentation_sessions').select('id').eq('id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).single(); if (error || !data) throw new Error('Session not found') }
function revalidateReview(sessionId: string) { revalidatePath(`/dashboard/sessions/${sessionId}/evidence/review`); revalidatePath(`/dashboard/sessions/${sessionId}/evidence`); revalidatePath(`/dashboard/sessions/${sessionId}/suggestions`) }

export async function quickReviewEvidence(sessionId: string, captureId: string, formData: FormData) {
  const status = parseEvidenceReviewStatus(formData.get('evidence_review_status'))
  if (!status) throw new Error('Invalid review status')
  const include = formData.get('include_in_report')
  const patch: Record<string, unknown> = { evidence_review_status: status, updated_at: new Date().toISOString() }
  if (include === 'false') patch.include_in_report = false
  const { supabase: raw, profile } = await requireSessionWorkspace(); assertFeatureAccess(profile); const supabase = raw as unknown as SupabaseLike
  await assertSession(sessionId, supabase, profile.organization_id)
  const { error } = await supabase.from('capture_items').update(patch).eq('id', captureId).eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null)
  if (error) throw new Error('Unable to review item')
  revalidateReview(sessionId)
}

export async function bulkReviewEvidence(sessionId: string, formData: FormData) {
  const ids = selectedIds(formData); if (!ids.length) return
  const action = String(formData.get('bulk_action') ?? '')
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (action === 'mark_reviewed') patch.evidence_review_status = 'reviewed'
  else if (action === 'mark_followup') patch.evidence_review_status = 'needs_followup'
  else if (action === 'include') patch.include_in_report = true
  else if (action === 'exclude') patch.include_in_report = false
  else throw new Error('Invalid bulk item action')
  const { supabase: raw, profile } = await requireSessionWorkspace(); assertFeatureAccess(profile); const supabase = raw as unknown as SupabaseLike
  await assertSession(sessionId, supabase, profile.organization_id)
  const { error } = await supabase.from('capture_items').update(patch).in('id', ids).eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null)
  if (error) throw new Error('Unable to review selected items')
  revalidateReview(sessionId)
}

export async function quickReviewSuggestion(sessionId: string, suggestionId: string, formData: FormData) {
  const category = parseSuggestionCategory(formData.get('category')); const decision = parseSuggestionDecision(formData.get('decision'))
  const { supabase: raw, profile } = await requireSessionWorkspace(); assertFeatureAccess(profile); const supabase = raw as unknown as SupabaseLike
  await assertSession(sessionId, supabase, profile.organization_id)
  const now = new Date().toISOString(); const sourceFilter = category === 'timeline' ? { column: 'source_kind', value: 'ai' } : { column: 'suggestion_source', value: 'ai' }
  const { error } = await supabase.from(TABLES[category]).update({ review_status: decision, reviewed_at: decision === 'rejected' ? null : now, reviewed_by: decision === 'rejected' ? null : profile.id ?? null, updated_at: now }).eq('id', suggestionId).eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).eq(sourceFilter.column, sourceFilter.value).eq('review_status', 'suggested').is('deleted_at', null)
  if (error) throw new Error('Unable to review suggestion')
  revalidateReview(sessionId)
}

export async function bulkReviewSuggestions(sessionId: string, formData: FormData) {
  const ids = selectedIds(formData); if (!ids.length) return
  const category = parseSuggestionCategory(formData.get('category')); const decision = parseSuggestionDecision(formData.get('decision'))
  const { supabase: raw, profile } = await requireSessionWorkspace(); assertFeatureAccess(profile); const supabase = raw as unknown as SupabaseLike
  await assertSession(sessionId, supabase, profile.organization_id)
  const now = new Date().toISOString(); const sourceFilter = category === 'timeline' ? { column: 'source_kind', value: 'ai' } : { column: 'suggestion_source', value: 'ai' }
  const { error } = await supabase.from(TABLES[category]).update({ review_status: decision, reviewed_at: decision === 'rejected' ? null : now, reviewed_by: decision === 'rejected' ? null : profile.id ?? null, updated_at: now }).in('id', ids).eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).eq(sourceFilter.column, sourceFilter.value).eq('review_status', 'suggested').is('deleted_at', null)
  if (error) throw new Error('Unable to bulk review suggestions')
  revalidateReview(sessionId)
}
