import {
  EVIDENCE_RELATIONSHIP_TYPES,
  EVIDENCE_SOURCE_KINDS,
  EVENT_DATE_PRECISIONS,
  SUGGESTION_REVIEW_STATUSES,
} from '@/features/evidence/constants'

export function parseTimelineDatePrecision(value: FormDataEntryValue | null) {
  return typeof value === 'string' && EVENT_DATE_PRECISIONS.includes(value as (typeof EVENT_DATE_PRECISIONS)[number]) ? value : null
}

export function parseTimelineSourceKind(value: FormDataEntryValue | null) {
  return typeof value === 'string' && EVIDENCE_SOURCE_KINDS.includes(value as (typeof EVIDENCE_SOURCE_KINDS)[number]) ? value : null
}

export function parseSuggestionReviewStatus(value: FormDataEntryValue | null) {
  return typeof value === 'string' && SUGGESTION_REVIEW_STATUSES.includes(value as (typeof SUGGESTION_REVIEW_STATUSES)[number]) ? value : null
}

export function parseEvidenceRelationshipType(value: FormDataEntryValue | null) {
  return typeof value === 'string' && ['documents', 'supports'].includes(value) && EVIDENCE_RELATIONSHIP_TYPES.includes(value as (typeof EVIDENCE_RELATIONSHIP_TYPES)[number]) ? value : null
}

export function normalizeTimelineDateTime(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value.trim()) return null
  const normalized = value.trim().length === 10 ? `${value.trim()}T00:00:00.000Z` : value.trim()
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid timeline date')
  return date.toISOString()
}

export function parseTimelineEventForm(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('Timeline title is required')

  const sourceKind = parseTimelineSourceKind(formData.get('source_kind'))
  if (!sourceKind) throw new Error('Invalid timeline source kind')

  const precision = parseTimelineDatePrecision(formData.get('event_date_precision'))
  if (!precision) throw new Error('Invalid timeline date precision')

  const requestedStatus = parseSuggestionReviewStatus(formData.get('review_status'))
  if (!requestedStatus) throw new Error('Invalid timeline review status')

  return {
    title,
    description: String(formData.get('description') ?? '').trim() || null,
    event_start_at: normalizeTimelineDateTime(formData.get('event_start_at')),
    event_end_at: normalizeTimelineDateTime(formData.get('event_end_at')),
    event_date_precision: precision,
    timezone: String(formData.get('timezone') ?? '').trim() || null,
    source_kind: sourceKind,
    review_status: requestedStatus,
  }
}

export function assertSameWorkspace(left: { documentation_session_id: string; organization_id: string }, right: { documentation_session_id: string; organization_id: string }) {
  if (left.documentation_session_id !== right.documentation_session_id || left.organization_id !== right.organization_id) {
    throw new Error('Evidence relationships must stay within the same session and organization')
  }
}
