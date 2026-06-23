import type { Database, Json } from '@/lib/supabase/database.types'
import type { DeliverableType } from './validation'
import { deliverableProvenance } from './validation'

type Tables = Database['public']['Tables']
export type DeliverableSession = Tables['documentation_sessions']['Row']
export type DeliverableEvidenceItem = Tables['capture_items']['Row']
export type DeliverableTimelineEvent = Tables['timeline_events']['Row']
export type DeliverableEntity = Tables['evidence_entities']['Row']
export type DeliverableAssertion = Tables['evidence_assertions']['Row']
export type DeliverableRelationship = Tables['evidence_relationships']['Row']

export type DeliverableSourceData = {
  sessionId: string
  organizationId: string
  evidenceItems: DeliverableEvidenceItem[]
  timelineEvents: DeliverableTimelineEvent[]
  entities: DeliverableEntity[]
  assertions: DeliverableAssertion[]
  relationships: DeliverableRelationship[]
}

export type GeneratedDeliverable = { title: string; summary: string; content: Json; source_ids: Json; provenance: Json }

export function generateDeliverable(type: DeliverableType, data: DeliverableSourceData): GeneratedDeliverable {
  if (type === 'chronology') return generateChronology(data)
  if (type === 'evidence_index') return generateEvidenceIndex(data)
  return generateObservationSummary(data)
}

export function generateChronology(data: DeliverableSourceData): GeneratedDeliverable {
  const verifiedRelationships = filterVerifiedRelationships(data.relationships)
  const events = sortChronologyEvents(data.timelineEvents).map((event) => {
    const linkedEvidenceIds = relatedIds(verifiedRelationships, 'timeline_event', event.id, 'capture_item')
    const linkedEntityIds = relatedIds(verifiedRelationships, 'timeline_event', event.id, 'entity')
    const linkedAssertionIds = relatedIds(verifiedRelationships, 'timeline_event', event.id, 'assertion')
    return {
      event_id: event.id,
      title: event.title,
      event_start_at: event.event_start_at,
      event_time: event.event_time,
      created_at: event.created_at,
      linked_evidence_count: linkedEvidenceIds.length,
      linked_entities: data.entities.filter((entity) => linkedEntityIds.includes(entity.id)).map((entity) => ({ id: entity.id, display_name: entity.display_name, entity_type: entity.entity_type })),
      linked_factual_observations: data.assertions.filter((assertion) => linkedAssertionIds.includes(assertion.id)).map((assertion) => ({ id: assertion.id, statement: assertion.statement })),
      source_ids: { timeline_event_ids: [event.id], evidence_item_ids: linkedEvidenceIds, entity_ids: linkedEntityIds, assertion_ids: linkedAssertionIds },
    }
  })
  const sourceIds = collectSourceIds(data)
  return { title: 'Chronology', summary: `${events.length} timeline events ordered by event date with verified evidence links.`, content: { type: 'chronology', events }, source_ids: sourceIds, provenance: deliverableProvenance('chronology', sourceIds) }
}

export function generateEvidenceIndex(data: DeliverableSourceData): GeneratedDeliverable {
  const sortedEvidenceItems = sortEvidenceItems(data.evidenceItems)
  const items = sortedEvidenceItems.map((item) => ({
    evidence_item_id: item.id,
    identifier: item.id,
    title: item.original_filename ?? item.technician_note ?? item.ai_summary ?? item.type,
    source_kind: item.source_kind,
    captured_date: item.captured_at,
    source_date: item.source_created_at ?? item.source_sent_at ?? item.source_received_at ?? item.event_date,
    review_status: item.evidence_review_status,
    include_in_outputs: item.include_in_report,
    source_ids: { evidence_item_ids: [item.id] },
  }))
  const sourceIds = { evidence_item_ids: sortedEvidenceItems.map((item) => item.id) }
  return { title: 'Evidence Index', summary: `${items.length} evidence items indexed with source and review metadata.`, content: { type: 'evidence_index', items }, source_ids: sourceIds, provenance: deliverableProvenance('evidence_index', sourceIds) }
}

export function generateObservationSummary(data: DeliverableSourceData): GeneratedDeliverable {
  const verifiedRelationships = filterVerifiedRelationships(data.relationships)
  const observations = data.assertions.map((assertion) => {
    const linkedEvidenceIds = relatedIds(verifiedRelationships, 'assertion', assertion.id, 'capture_item')
    const supportingEvidenceIds = relatedIds(verifiedRelationships.filter((r) => r.relationship_type === 'supports'), 'assertion', assertion.id, 'capture_item')
    const contradictingEvidenceIds = relatedIds(verifiedRelationships.filter((r) => r.relationship_type === 'contradicts'), 'assertion', assertion.id, 'capture_item')
    const linkedEntityIds = relatedIds(verifiedRelationships, 'assertion', assertion.id, 'entity')
    const linkedEventIds = relatedIds(verifiedRelationships, 'assertion', assertion.id, 'timeline_event')
    return { assertion_id: assertion.id, factual_observation: assertion.statement, linked_evidence_count: linkedEvidenceIds.length, supporting_evidence_count: supportingEvidenceIds.length, contradicting_evidence_count: contradictingEvidenceIds.length, linked_entities: data.entities.filter((entity) => linkedEntityIds.includes(entity.id)).map((entity) => ({ id: entity.id, display_name: entity.display_name })), linked_timeline_events: data.timelineEvents.filter((event) => linkedEventIds.includes(event.id)).map((event) => ({ id: event.id, title: event.title })), source_ids: { assertion_ids: [assertion.id], evidence_item_ids: linkedEvidenceIds, entity_ids: linkedEntityIds, timeline_event_ids: linkedEventIds } }
  })
  const sourceIds = collectSourceIds(data)
  return { title: 'Observation Summary', summary: `${observations.length} factual observations summarized with supporting and contradicting evidence counts.`, content: { type: 'observation_summary', observations }, source_ids: sourceIds, provenance: deliverableProvenance('observation_summary', sourceIds) }
}

export function sortChronologyEvents(events: DeliverableTimelineEvent[]) {
  return [...events].sort((a, b) => {
    const dateDiff = new Date(a.event_start_at ?? a.event_time ?? a.created_at).getTime() - new Date(b.event_start_at ?? b.event_time ?? b.created_at).getTime()
    if (dateDiff !== 0) return dateDiff
    return a.id.localeCompare(b.id)
  })
}

export function sortEvidenceItems(items: DeliverableEvidenceItem[]) {
  return [...items].sort((a, b) => {
    const dateDiff = new Date(b.captured_at ?? b.created_at).getTime() - new Date(a.captured_at ?? a.created_at).getTime()
    if (dateDiff !== 0) return dateDiff
    return a.id.localeCompare(b.id)
  })
}

function filterVerifiedRelationships(relationships: DeliverableRelationship[]) {
  return relationships.filter((relationship) => ['accepted', 'edited'].includes(relationship.review_status))
}

function relatedIds(relationships: DeliverableRelationship[], sourceType: string, sourceId: string, targetType: string) {
  return uniqueSortedIds(relationships.flatMap((relationship) => {
    if (relationship.source_type === sourceType && relationship.source_id === sourceId && relationship.target_type === targetType) return [relationship.target_id]
    if (relationship.target_type === sourceType && relationship.target_id === sourceId && relationship.source_type === targetType) return [relationship.source_id]
    return []
  }))
}

function uniqueSortedIds(ids: string[]) {
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
}

function collectSourceIds(data: DeliverableSourceData): Record<string, string[]> {
  return { evidence_item_ids: uniqueSortedIds(data.evidenceItems.map((item) => item.id)), timeline_event_ids: uniqueSortedIds(data.timelineEvents.map((event) => event.id)), entity_ids: uniqueSortedIds(data.entities.map((entity) => entity.id)), assertion_ids: uniqueSortedIds(data.assertions.map((assertion) => assertion.id)), relationship_ids: uniqueSortedIds(data.relationships.map((relationship) => relationship.id)) }
}
