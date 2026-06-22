import { EVIDENCE_SUGGESTION_SOURCES, SUGGESTION_REVIEW_STATUSES } from '@/features/evidence/constants'

export type WorkspaceScopedRow = { documentation_session_id: string; organization_id: string }

export function assertSameEvidenceWorkspace(left: WorkspaceScopedRow, right: WorkspaceScopedRow, message = 'Evidence relationships must stay within the same session and organization') {
  if (left.documentation_session_id !== right.documentation_session_id || left.organization_id !== right.organization_id) {
    throw new Error(message)
  }
}

export function parseSuggestionSource(value: FormDataEntryValue | null) {
  return typeof value === 'string' && EVIDENCE_SUGGESTION_SOURCES.includes(value as (typeof EVIDENCE_SUGGESTION_SOURCES)[number]) ? value : null
}

export function parseSuggestionReviewStatus(value: FormDataEntryValue | null) {
  return typeof value === 'string' && SUGGESTION_REVIEW_STATUSES.includes(value as (typeof SUGGESTION_REVIEW_STATUSES)[number]) ? value : null
}

export function defaultSuggestionReviewStatus(suggestionSource: string, requestedStatus: string | null) {
  if (suggestionSource === 'user') return requestedStatus ?? 'accepted'
  return 'suggested'
}

export function acceptedUserRelationshipDefaults(createdFrom: string, userId: string | null | undefined, now: string) {
  return { suggestion_source: 'user', review_status: 'accepted', provenance: { created_from: createdFrom }, created_by: userId ?? null, reviewed_at: now, updated_at: now }
}

export function softDeleteUpdate(now = new Date().toISOString()) {
  return { deleted_at: now, updated_at: now }
}
