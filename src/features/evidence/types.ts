import type { Database, Json } from '@/lib/supabase/database.types'

import type {
  EVIDENCE_ASSERTION_TYPES,
  EVIDENCE_ENTITY_TYPES,
  EVIDENCE_OBJECT_TYPES,
  EVIDENCE_RELATIONSHIP_TYPES,
  EVIDENCE_REVIEW_STATUSES,
  EVIDENCE_SOURCE_KINDS,
  EVIDENCE_SUGGESTION_SOURCES,
  EVENT_DATE_PRECISIONS,
  IMPORT_BATCH_SOURCE_KINDS,
  SUGGESTION_REVIEW_STATUSES,
} from './constants'

type Tables = Database['public']['Tables']

export type EvidenceItem = Tables['capture_items']['Row']
export type EvidenceImportBatch = Tables['evidence_import_batches']['Row']
export type EvidenceRelationship = Tables['evidence_relationships']['Row']
export type EvidenceEntity = Tables['evidence_entities']['Row']
export type EvidenceAssertion = Tables['evidence_assertions']['Row']
export type EvidenceTimelineEvent = Tables['timeline_events']['Row']

export type EvidenceReviewStatus = (typeof EVIDENCE_REVIEW_STATUSES)[number]
export type SuggestionReviewStatus = (typeof SUGGESTION_REVIEW_STATUSES)[number]
export type EvidenceSourceKind = (typeof EVIDENCE_SOURCE_KINDS)[number]
export type ImportBatchSourceKind = (typeof IMPORT_BATCH_SOURCE_KINDS)[number]
export type EventDatePrecision = (typeof EVENT_DATE_PRECISIONS)[number]
export type EvidenceEntityType = (typeof EVIDENCE_ENTITY_TYPES)[number]
export type EvidenceAssertionType = (typeof EVIDENCE_ASSERTION_TYPES)[number]
export type EvidenceObjectType = (typeof EVIDENCE_OBJECT_TYPES)[number]
export type EvidenceRelationshipType = (typeof EVIDENCE_RELATIONSHIP_TYPES)[number]
export type EvidenceSuggestionSource = (typeof EVIDENCE_SUGGESTION_SOURCES)[number]

export type EvidenceObjectRef = {
  type: EvidenceObjectType
  id: string
}

export type EvidenceProvenance = {
  source: EvidenceSuggestionSource
  model?: string
  prompt_version?: string
  job_id?: string
  capture_item_ids?: string[]
  import_batch_id?: string
  notes?: string
  raw?: Json
}
