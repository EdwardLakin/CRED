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
