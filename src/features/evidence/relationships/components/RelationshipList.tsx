import type { RelationshipAssertion, RelationshipEntity, RelationshipEvidenceItem, RelationshipRecord, RelationshipTimelineEvent } from '@/features/evidence/relationships/data'
import { RelationshipBadge } from '@/features/evidence/relationships/components/RelationshipBadge'

type Lookup = { evidenceItems: RelationshipEvidenceItem[]; timelineEvents: RelationshipTimelineEvent[]; entities: RelationshipEntity[]; assertions: RelationshipAssertion[] }

export function objectLabel(type: string, id: string, lookup: Lookup) {
  if (type === 'capture_item') return lookup.evidenceItems.find((item) => item.id === id)?.original_filename || lookup.evidenceItems.find((item) => item.id === id)?.technician_note || 'Untitled item'
  if (type === 'timeline_event') return lookup.timelineEvents.find((event) => event.id === id)?.title || 'Untitled timeline event'
  if (type === 'entity') return lookup.entities.find((entity) => entity.id === id)?.display_name || 'Untitled entity'
  if (type === 'assertion') return lookup.assertions.find((assertion) => assertion.id === id)?.statement || 'Untitled factual observation'
  return id
}

export function provenanceSummary(provenance: unknown) {
  if (!provenance || provenance === null) return 'No provenance summary available.'
  if (typeof provenance === 'string') return provenance
  if (typeof provenance === 'object') {
    const record = provenance as Record<string, unknown>
    const summary = record.summary ?? record.note ?? record.reason ?? record.source
    if (summary) return String(summary)
    const keys = Object.keys(record)
    return keys.length > 0 ? `Provenance fields: ${keys.slice(0, 4).join(', ')}` : 'No provenance summary available.'
  }
  return String(provenance)
}

export function RelationshipList({ relationships, lookup }: { relationships: RelationshipRecord[]; lookup: Lookup }) {
  if (relationships.length === 0) return <p className="muted">No relationships found.</p>
  return <div className="form-stack">{relationships.map((relationship) => <article key={relationship.id} className="card detail-card form-stack">
    <div className="section-header"><div><p className="eyebrow">{relationship.source_type} → {relationship.target_type}</p><h3>{objectLabel(relationship.source_type, relationship.source_id, lookup)} → {objectLabel(relationship.target_type, relationship.target_id, lookup)}</h3></div><RelationshipBadge status={relationship.review_status} /></div>
    <dl className="metadata-list">
      <div><dt>Relationship type</dt><dd>{relationship.relationship_type}</dd></div>
      <div><dt>Suggestion source</dt><dd>{relationship.suggestion_source}</dd></div>
      <div><dt>Review status</dt><dd>{relationship.review_status}</dd></div>
      <div><dt>Created date</dt><dd>{new Date(relationship.created_at).toLocaleString()}</dd></div>
    </dl>
    <p className="muted">{provenanceSummary(relationship.provenance)}</p>
  </article>)}</div>
}
