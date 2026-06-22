import { EVIDENCE_ENTITY_TYPES, EVIDENCE_RELATIONSHIP_TYPES, EVIDENCE_SUGGESTION_SOURCES, SUGGESTION_REVIEW_STATUSES } from '@/features/evidence/constants'
import type { Json } from '@/lib/supabase/database.types'

export function parseEntityType(value: FormDataEntryValue | null) {
  return typeof value === 'string' && EVIDENCE_ENTITY_TYPES.includes(value as (typeof EVIDENCE_ENTITY_TYPES)[number]) ? value : null
}

export function parseEntitySuggestionSource(value: FormDataEntryValue | null) {
  return typeof value === 'string' && EVIDENCE_SUGGESTION_SOURCES.includes(value as (typeof EVIDENCE_SUGGESTION_SOURCES)[number]) ? value : null
}

export function parseEntityReviewStatus(value: FormDataEntryValue | null) {
  return typeof value === 'string' && SUGGESTION_REVIEW_STATUSES.includes(value as (typeof SUGGESTION_REVIEW_STATUSES)[number]) ? value : null
}

export function defaultEntityReviewStatus(suggestionSource: string, requestedStatus: string | null) {
  if (suggestionSource === 'user') return requestedStatus ?? 'accepted'
  return 'suggested'
}

export function parseEntityAttributes(value: FormDataEntryValue | null): Json {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value) as Json
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Entity attributes must be a JSON object')
    return parsed
  } catch {
    return { notes: value.trim() }
  }
}

export function parseEntityForm(formData: FormData) {
  const entityType = parseEntityType(formData.get('entity_type'))
  if (!entityType) throw new Error('Invalid entity type')
  const displayName = String(formData.get('display_name') ?? '').trim()
  if (!displayName) throw new Error('Entity display name is required')
  const suggestionSource = parseEntitySuggestionSource(formData.get('suggestion_source'))
  if (!suggestionSource) throw new Error('Invalid suggestion source')
  const requestedStatus = parseEntityReviewStatus(formData.get('review_status'))
  if (!requestedStatus) throw new Error('Invalid entity review status')
  const reviewStatus = defaultEntityReviewStatus(suggestionSource, requestedStatus)
  return { entity_type: entityType, display_name: displayName, normalized_name: displayName.toLocaleLowerCase(), description: String(formData.get('description') ?? '').trim() || null, attributes: parseEntityAttributes(formData.get('attributes')), suggestion_source: suggestionSource, review_status: reviewStatus }
}

export function parseEntityRelationshipType(value: FormDataEntryValue | null, sourceType: string) {
  const allowed = sourceType === 'timeline_event' ? ['involves'] : ['mentions', 'depicts']
  return typeof value === 'string' && allowed.includes(value) && EVIDENCE_RELATIONSHIP_TYPES.includes(value as (typeof EVIDENCE_RELATIONSHIP_TYPES)[number]) ? value : null
}

export function assertSameWorkspace(left: { documentation_session_id: string; organization_id: string }, right: { documentation_session_id: string; organization_id: string }) {
  if (left.documentation_session_id !== right.documentation_session_id || left.organization_id !== right.organization_id) {
    throw new Error('Entity relationships must stay within the same session and organization')
  }
}
