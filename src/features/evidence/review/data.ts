import { notFound } from 'next/navigation'
import { requireSessionWorkspace } from '@/features/sessions/data'
import type { Database } from '@/lib/supabase/database.types'

type Tables = Database['public']['Tables']
export type ReviewEvidenceItem = Tables['capture_items']['Row']
export type ReviewTimelineItem = Tables['timeline_events']['Row']
export type ReviewEntityItem = Tables['evidence_entities']['Row']
export type ReviewAssertionItem = Tables['evidence_assertions']['Row']
export type ReviewRelationshipItem = Tables['evidence_relationships']['Row']
export type ReviewQueueSession = Tables['documentation_sessions']['Row']
export type ReviewQueueSort = 'newest' | 'oldest' | 'capture_date' | 'event_date'
export type ReviewQueueKind = 'all' | 'evidence' | 'entities' | 'assertions' | 'timeline' | 'relationships'
export type ReviewQueueStatus = 'pending' | 'unreviewed' | 'needs_followup' | 'suggested'

type QueryBuilder = { select: (columns: string) => QueryBuilder; eq: (column: string, value: string | boolean) => QueryBuilder; in: (column: string, values: string[]) => QueryBuilder; is: (column: string, value: null) => QueryBuilder; order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => QueryBuilder; single: () => Promise<{ data: unknown; error: unknown }>; then: Promise<{ data: unknown; error: unknown }>['then'] }
type SupabaseLike = { from: (table: string) => QueryBuilder }
export type ReviewQueueData = Awaited<ReturnType<typeof getReviewQueueData>>

export function parseReviewQueueSearchParams(searchParams?: Record<string, string | string[] | undefined>) {
  const value = (key: string) => { const raw = searchParams?.[key]; return Array.isArray(raw) ? raw[0] : raw }
  const kind = value('kind') as ReviewQueueKind
  const status = value('status') as ReviewQueueStatus
  const sort = value('sort') as ReviewQueueSort
  return {
    kind: ['evidence', 'entities', 'assertions', 'timeline', 'relationships'].includes(kind) ? kind : 'all',
    status: ['unreviewed', 'needs_followup', 'suggested'].includes(status) ? status : 'pending',
    sort: ['oldest', 'capture_date', 'event_date'].includes(sort) ? sort : 'newest',
  }
}

export async function getReviewQueueData(sessionId: string, filters = parseReviewQueueSearchParams()) {
  const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
  const supabase = rawSupabase as unknown as SupabaseLike
  const { data: session, error } = await supabase.from('documentation_sessions').select('*').eq('id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).single()
  if (error || !session) notFound()

  const [{ data: evidence }, { data: timeline }, { data: entities }, { data: assertions }, { data: relationships }] = await Promise.all([
    supabase.from('capture_items').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null),
    supabase.from('timeline_events').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).eq('source_kind', 'ai').eq('review_status', 'suggested').is('deleted_at', null),
    supabase.from('evidence_entities').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).eq('suggestion_source', 'ai').eq('review_status', 'suggested').is('deleted_at', null),
    supabase.from('evidence_assertions').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).eq('suggestion_source', 'ai').eq('review_status', 'suggested').is('deleted_at', null),
    supabase.from('evidence_relationships').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).eq('suggestion_source', 'ai').eq('review_status', 'suggested').is('deleted_at', null),
  ])
  const allEvidenceItems = (evidence ?? []) as ReviewEvidenceItem[]
  const pendingEvidenceItems = allEvidenceItems.filter((item) => item.evidence_review_status === 'unreviewed' || item.evidence_review_status === 'needs_followup')
  const evidenceItems = pendingEvidenceItems.filter((item) => filters.status === 'pending' || filters.status === item.evidence_review_status)
  const suggestedOnly = filters.status === 'pending' || filters.status === 'suggested'
  const data = { session: session as ReviewQueueSession, evidenceItems, timelineSuggestions: suggestedOnly ? (timeline ?? []) as ReviewTimelineItem[] : [], entitySuggestions: suggestedOnly ? (entities ?? []) as ReviewEntityItem[] : [], assertionSuggestions: suggestedOnly ? (assertions ?? []) as ReviewAssertionItem[] : [], relationshipSuggestions: suggestedOnly ? (relationships ?? []) as ReviewRelationshipItem[] : [], filters, allEvidenceCount: allEvidenceItems.length }
  return { ...data, counts: buildReviewQueueCounts(data), items: sortReviewQueueItems(buildReviewQueueItems(data), filters.sort).filter((item) => filters.kind === 'all' || item.kind === filters.kind) }
}

function buildReviewQueueCounts(data: { evidenceItems: ReviewEvidenceItem[]; timelineSuggestions: ReviewTimelineItem[]; entitySuggestions: ReviewEntityItem[]; assertionSuggestions: ReviewAssertionItem[]; relationshipSuggestions: ReviewRelationshipItem[] }) {
  return { unreviewedEvidence: data.evidenceItems.filter((item) => item.evidence_review_status === 'unreviewed').length, evidenceNeedsFollowup: data.evidenceItems.filter((item) => item.evidence_review_status === 'needs_followup').length, suggestedTimelineEvents: data.timelineSuggestions.length, suggestedEntities: data.entitySuggestions.length, suggestedAssertions: data.assertionSuggestions.length, suggestedRelationships: data.relationshipSuggestions.length }
}
function buildReviewQueueItems(data: { evidenceItems: ReviewEvidenceItem[]; timelineSuggestions: ReviewTimelineItem[]; entitySuggestions: ReviewEntityItem[]; assertionSuggestions: ReviewAssertionItem[]; relationshipSuggestions: ReviewRelationshipItem[] }) {
  return [
    ...data.evidenceItems.map((record) => ({ id: record.id, kind: 'evidence' as const, record, createdAt: record.created_at, sortDate: record.event_date ?? record.captured_at ?? record.created_at })),
    ...data.entitySuggestions.map((record) => ({ id: record.id, kind: 'entities' as const, record, createdAt: record.created_at, sortDate: record.created_at })),
    ...data.assertionSuggestions.map((record) => ({ id: record.id, kind: 'assertions' as const, record, createdAt: record.created_at, sortDate: record.created_at })),
    ...data.timelineSuggestions.map((record) => ({ id: record.id, kind: 'timeline' as const, record, createdAt: record.created_at, sortDate: record.event_start_at ?? record.created_at })),
    ...data.relationshipSuggestions.map((record) => ({ id: record.id, kind: 'relationships' as const, record, createdAt: record.created_at, sortDate: record.created_at })),
  ]
}
function sortReviewQueueItems<T extends { createdAt: string; sortDate: string | null }>(items: T[], sort: ReviewQueueSort) {
  const dateFor = (item: T) => new Date((sort === 'newest' || sort === 'oldest' ? item.createdAt : item.sortDate) ?? item.createdAt).getTime()
  return [...items].sort((a, b) => sort === 'oldest' ? dateFor(a) - dateFor(b) : dateFor(b) - dateFor(a))
}
