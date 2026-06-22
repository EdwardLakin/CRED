export const EVIDENCE_REVIEW_STATUSES = [
  'unreviewed',
  'reviewed',
  'needs_followup',
  'excluded',
] as const

export const SUGGESTION_REVIEW_STATUSES = [
  'suggested',
  'accepted',
  'edited',
  'rejected',
] as const

export const EVIDENCE_SOURCE_KINDS = [
  'camera_capture',
  'upload',
  'bulk_upload',
  'text_note',
  'voice_note',
  'email_import',
  'system',
  'ai',
] as const

export const IMPORT_BATCH_SOURCE_KINDS = [
  'bulk_upload',
  'email_import',
  'system',
] as const

export const EVENT_DATE_PRECISIONS = [
  'exact',
  'date',
  'month',
  'year',
  'approximate',
  'unknown',
] as const

export const EVIDENCE_ENTITY_TYPES = [
  'person',
  'organization',
  'location',
  'asset',
  'equipment',
  'vehicle',
  'document',
  'other',
] as const

export const EVIDENCE_ASSERTION_TYPES = [
  'factual_observation',
  'measurement',
  'condition',
  'note_summary',
  'documented_statement',
  'open_question',
  'other',
] as const

export const EVIDENCE_OBJECT_TYPES = [
  'capture_item',
  'timeline_event',
  'entity',
  'assertion',
  'report_draft',
  'report_section',
  'import_batch',
] as const

export const EVIDENCE_RELATIONSHIP_TYPES = [
  'supports',
  'contradicts',
  'documents',
  'depicts',
  'references',
  'mentions',
  'involves',
  'located_at',
  'occurred_at',
  'derived_from',
  'duplicate_of',
  'included_in',
  'excluded_from',
  'supersedes',
  'related_to',
] as const

export const EVIDENCE_SUGGESTION_SOURCES = [
  'user',
  'ai',
  'system',
  'import',
] as const


export const EVIDENCE_WORKSPACE_LABELS = {
  library: 'Evidence Library',
  timeline: 'Timeline',
  entities: 'Entities',
  assertions: 'Factual Observations',
  relationships: 'Relationship Explorer',
  suggestions: 'Suggestions',
  deliverables: 'Deliverables',
  report: 'Existing Report',
  includeInOutputs: 'Include in outputs',
  suggested: 'Suggested',
  accepted: 'Accepted',
  edited: 'Edited',
  rejected: 'Rejected',
  needsReview: 'Needs review',
  unreviewed: 'Unreviewed',
} as const

export function formatSuggestionReviewStatus(status: string | null | undefined) {
  switch (status) {
    case 'suggested':
      return EVIDENCE_WORKSPACE_LABELS.suggested
    case 'accepted':
      return EVIDENCE_WORKSPACE_LABELS.accepted
    case 'edited':
      return EVIDENCE_WORKSPACE_LABELS.edited
    case 'rejected':
      return EVIDENCE_WORKSPACE_LABELS.rejected
    default:
      return EVIDENCE_WORKSPACE_LABELS.needsReview
  }
}

export function formatEvidenceReviewStatus(status: string | null | undefined) {
  switch (status) {
    case 'unreviewed':
      return EVIDENCE_WORKSPACE_LABELS.unreviewed
    case 'reviewed':
      return 'Reviewed'
    case 'needs_followup':
      return EVIDENCE_WORKSPACE_LABELS.needsReview
    case 'excluded':
      return 'Excluded'
    default:
      return EVIDENCE_WORKSPACE_LABELS.needsReview
  }
}
