import type { Json } from '@/lib/supabase/database.types'

export const DELIVERABLE_TYPES = ['chronology', 'evidence_index', 'observation_summary', 'relationship_map'] as const
export type DeliverableType = (typeof DELIVERABLE_TYPES)[number]

export type DeliverableSourceSelection = {
  selectedImportBatchIds: string[]
  selectedCaptureItemIds: string[]
  selectedTimelineEventIds: string[]
  selectedEntityIds: string[]
  selectedAssertionIds: string[]
  includeNeedsFollowUpEvidence: boolean
  includeOutputExcludedEvidence: boolean
  includeAcceptedSuggestions: boolean
  includeEditedSuggestions: boolean
}

export const defaultDeliverableSourceSelection: DeliverableSourceSelection = {
  selectedImportBatchIds: [],
  selectedCaptureItemIds: [],
  selectedTimelineEventIds: [],
  selectedEntityIds: [],
  selectedAssertionIds: [],
  includeNeedsFollowUpEvidence: false,
  includeOutputExcludedEvidence: false,
  includeAcceptedSuggestions: true,
  includeEditedSuggestions: true,
}

export function parseDeliverableType(value: FormDataEntryValue | string | null): DeliverableType {
  if (typeof value === 'string' && DELIVERABLE_TYPES.includes(value as DeliverableType)) return value as DeliverableType
  throw new Error('Unsupported deliverable type')
}

export function parseDeliverableSourceSelection(formData: FormData): DeliverableSourceSelection {
  return {
    selectedImportBatchIds: parseIdList(formData.getAll('selectedImportBatchIds')),
    selectedCaptureItemIds: parseIdList(formData.getAll('selectedCaptureItemIds')),
    selectedTimelineEventIds: parseIdList(formData.getAll('selectedTimelineEventIds')),
    selectedEntityIds: parseIdList(formData.getAll('selectedEntityIds')),
    selectedAssertionIds: parseIdList(formData.getAll('selectedAssertionIds')),
    includeNeedsFollowUpEvidence: formData.get('includeNeedsFollowUpEvidence') === 'on',
    includeOutputExcludedEvidence: formData.get('includeOutputExcludedEvidence') === 'on',
    includeAcceptedSuggestions: formData.get('includeAcceptedSuggestions') !== 'off',
    includeEditedSuggestions: formData.get('includeEditedSuggestions') !== 'off',
  }
}

export function assertWorkspaceScope(row: { documentation_session_id: string; organization_id: string; deleted_at?: string | null }, sessionId: string, organizationId: string) {
  if (row.documentation_session_id !== sessionId || row.organization_id !== organizationId) throw new Error('Deliverables must stay within the same session and organization')
  if (row.deleted_at) throw new Error('Deleted source records cannot be included in deliverables')
}

export function assertAllowedReviewStatus(row: { review_status: string }, allowAccepted: boolean, allowEdited: boolean) {
  if (row.review_status === 'rejected') throw new Error('Rejected source records cannot be included in deliverables')
  if (row.review_status === 'suggested') throw new Error('Suggested source records must be accepted or edited before deliverable generation')
  if (row.review_status === 'accepted' && !allowAccepted) throw new Error('Accepted suggestions are disabled for this source selection')
  if (row.review_status === 'edited' && !allowEdited) throw new Error('Edited suggestions are disabled for this source selection')
  if (!['accepted', 'edited'].includes(row.review_status)) throw new Error('Only accepted or edited source records can be included in deliverables')
}

export function deliverableProvenance(type: DeliverableType, sourceIds: Record<string, string[]>, sourceSelection: DeliverableSourceSelection = defaultDeliverableSourceSelection): Json {
  return { generated_from: 'evidence_workspace', deliverable_type: type, source_ids: sourceIds, source_selection: sourceSelection, deterministic: true }
}

function parseIdList(values: FormDataEntryValue[]) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))].sort((a, b) => a.localeCompare(b))
}
