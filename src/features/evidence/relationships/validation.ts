import { EVIDENCE_OBJECT_TYPES, EVIDENCE_RELATIONSHIP_TYPES, EVIDENCE_SUGGESTION_SOURCES, SUGGESTION_REVIEW_STATUSES } from '@/features/evidence/constants'

export const RELATIONSHIP_REVIEW_STATUS_LABELS: Record<string, string> = {
  suggested: 'Suggested',
  accepted: 'Accepted',
  edited: 'Edited',
  rejected: 'Rejected',
}

export function formatRelationshipReviewStatus(status: string | null | undefined) {
  return status ? RELATIONSHIP_REVIEW_STATUS_LABELS[status] ?? 'Needs review' : 'Needs review'
}

export function isEvidenceObjectType(value: string) {
  return EVIDENCE_OBJECT_TYPES.includes(value as (typeof EVIDENCE_OBJECT_TYPES)[number])
}

export function isEvidenceRelationshipType(value: string) {
  return EVIDENCE_RELATIONSHIP_TYPES.includes(value as (typeof EVIDENCE_RELATIONSHIP_TYPES)[number])
}

export function isSuggestionSource(value: string) {
  return EVIDENCE_SUGGESTION_SOURCES.includes(value as (typeof EVIDENCE_SUGGESTION_SOURCES)[number])
}

export function isSuggestionReviewStatus(value: string) {
  return SUGGESTION_REVIEW_STATUSES.includes(value as (typeof SUGGESTION_REVIEW_STATUSES)[number])
}
