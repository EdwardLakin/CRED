import { EVIDENCE_ENTITY_TYPES, EVIDENCE_RELATIONSHIP_TYPES } from '@/features/evidence/constants'
import { assertSameEvidenceWorkspace, defaultSuggestionReviewStatus, parseSuggestionReviewStatus, parseSuggestionSource } from '@/features/evidence/validation'
import type { Json } from '@/lib/supabase/database.types'

export function parseEntityType(value: FormDataEntryValue | null) {
  return typeof value === 'string' && EVIDENCE_ENTITY_TYPES.includes(value as (typeof EVIDENCE_ENTITY_TYPES)[number]) ? value : null
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
  const suggestionSource = parseSuggestionSource(formData.get('suggestion_source'))
  if (!suggestionSource) throw new Error('Invalid suggestion source')
  const requestedStatus = parseSuggestionReviewStatus(formData.get('review_status'))
  if (!requestedStatus) throw new Error('Invalid entity review status')
  const reviewStatus = defaultSuggestionReviewStatus(suggestionSource, requestedStatus)
  return { entity_type: entityType, display_name: displayName, normalized_name: displayName.toLocaleLowerCase(), description: String(formData.get('description') ?? '').trim() || null, attributes: parseEntityAttributes(formData.get('attributes')), suggestion_source: suggestionSource, review_status: reviewStatus }
}

export function parseEntityRelationshipType(value: FormDataEntryValue | null, sourceType: string) {
  const allowed = sourceType === 'timeline_event' ? ['involves'] : ['mentions', 'depicts']
  return typeof value === 'string' && allowed.includes(value) && EVIDENCE_RELATIONSHIP_TYPES.includes(value as (typeof EVIDENCE_RELATIONSHIP_TYPES)[number]) ? value : null
}

export function assertSameWorkspace(left: { documentation_session_id: string; organization_id: string }, right: { documentation_session_id: string; organization_id: string }) {
  return assertSameEvidenceWorkspace(left, right, 'Entity relationships must stay within the same session and organization')
}
