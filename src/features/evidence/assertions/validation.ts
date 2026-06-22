import { EVIDENCE_ASSERTION_TYPES, EVIDENCE_RELATIONSHIP_TYPES, EVIDENCE_SUGGESTION_SOURCES, SUGGESTION_REVIEW_STATUSES } from '@/features/evidence/constants'
import type { Json } from '@/lib/supabase/database.types'

export function parseAssertionType(value: FormDataEntryValue | null) {
  return typeof value === 'string' && EVIDENCE_ASSERTION_TYPES.includes(value as (typeof EVIDENCE_ASSERTION_TYPES)[number]) ? value : null
}

export function parseAssertionSuggestionSource(value: FormDataEntryValue | null) {
  return typeof value === 'string' && EVIDENCE_SUGGESTION_SOURCES.includes(value as (typeof EVIDENCE_SUGGESTION_SOURCES)[number]) ? value : null
}

export function parseAssertionReviewStatus(value: FormDataEntryValue | null) {
  return typeof value === 'string' && SUGGESTION_REVIEW_STATUSES.includes(value as (typeof SUGGESTION_REVIEW_STATUSES)[number]) ? value : null
}

export function defaultAssertionReviewStatus(suggestionSource: string, requestedStatus: string | null) {
  if (suggestionSource === 'user') return requestedStatus ?? 'accepted'
  return 'suggested'
}

export function parseAssertionAttributes(value: FormDataEntryValue | null): Json {
  if (typeof value !== 'string' || !value.trim()) return {}
  return { notes: value.trim() }
}

export function parseAssertionForm(formData: FormData) {
  const assertionType = parseAssertionType(formData.get('assertion_type'))
  if (!assertionType) throw new Error('Invalid factual observation type')
  const statement = String(formData.get('statement') ?? '').trim()
  if (!statement) throw new Error('Factual observation statement is required')
  const suggestionSource = parseAssertionSuggestionSource(formData.get('suggestion_source'))
  if (!suggestionSource) throw new Error('Invalid suggestion source')
  const requestedStatus = parseAssertionReviewStatus(formData.get('review_status'))
  if (!requestedStatus) throw new Error('Invalid review status')
  const reviewStatus = defaultAssertionReviewStatus(suggestionSource, requestedStatus)
  return { assertion_type: assertionType, statement, normalized_statement: statement.toLocaleLowerCase(), attributes: parseAssertionAttributes(formData.get('attributes')), suggestion_source: suggestionSource, review_status: reviewStatus }
}

export function parseAssertionRelationshipType(value: FormDataEntryValue | null, sourceType: string) {
  const allowed = sourceType === 'capture_item' ? ['supports', 'contradicts', 'references'] : sourceType === 'timeline_event' ? ['documents', 'supports', 'references'] : ['references']
  return typeof value === 'string' && allowed.includes(value) && EVIDENCE_RELATIONSHIP_TYPES.includes(value as (typeof EVIDENCE_RELATIONSHIP_TYPES)[number]) ? value : null
}

export function assertSameWorkspace(left: { documentation_session_id: string; organization_id: string }, right: { documentation_session_id: string; organization_id: string }) {
  if (left.documentation_session_id !== right.documentation_session_id || left.organization_id !== right.organization_id) {
    throw new Error('Factual observation relationships must stay within the same session and organization')
  }
}
