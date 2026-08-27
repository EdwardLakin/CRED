import type { RelationshipExplorerData, RelationshipRecord } from '@/features/evidence/relationships/data'
import { RelationshipGroup } from '@/features/evidence/relationships/components/RelationshipGroup'
import { RelationshipSummaryCards } from '@/features/evidence/relationships/components/RelationshipSummaryCards'

function relatedTo(relationships: RelationshipRecord[], type: string, id: string) {
  return relationships.filter((relationship) => (relationship.source_type === type && relationship.source_id === id) || (relationship.target_type === type && relationship.target_id === id))
}

function between(relationships: RelationshipRecord[], types: string[]) {
  return relationships.filter((relationship) => types.includes(relationship.source_type) || types.includes(relationship.target_type))
}

export function RelationshipExplorer({ session, relationships, evidenceItems, timelineEvents, entities, assertions, summary }: RelationshipExplorerData) {
  const lookup = { evidenceItems, timelineEvents, entities, assertions }
  return <div className="form-stack">
    <section className="card detail-card form-stack"><p className="eyebrow">Connections</p><h2>{session.title}</h2><p className="muted">See how items, timeline events, entities, and factual observations connect.</p></section>
    <RelationshipSummaryCards summary={summary} />
    <RelationshipGroup title="Item Connections" description="Items and their linked events, entities, and factual observations." relationships={between(relationships, ['capture_item'])} lookup={lookup} />
    <section className="form-stack"><h2>Timeline Connections</h2><p className="muted">Events with linked items, entities, and factual observations.</p>{timelineEvents.length === 0 ? <p className="muted">No timeline events found.</p> : timelineEvents.map((event) => <RelationshipGroup key={event.id} title={event.title} description="Linked items, entities, and observations for this event." relationships={relatedTo(relationships, 'timeline_event', event.id)} lookup={lookup} />)}</section>
    <section className="form-stack"><h2>Entity Connections</h2><p className="muted">Entities with linked items, events, and factual observations.</p>{entities.length === 0 ? <p className="muted">No entities found.</p> : entities.map((entity) => <RelationshipGroup key={entity.id} title={entity.display_name} description="Linked items, events, and observations for this entity." relationships={relatedTo(relationships, 'entity', entity.id)} lookup={lookup} />)}</section>
    <section className="form-stack"><h2>Observation Connections</h2><p className="muted">Factual observations with supporting items, conflicting items, related entities, and related events.</p>{assertions.length === 0 ? <p className="muted">No factual observations found.</p> : assertions.map((assertion) => <RelationshipGroup key={assertion.id} title={assertion.statement} description="Supporting items, conflicting items, related entities, and related events for this factual observation." relationships={relatedTo(relationships, 'assertion', assertion.id)} lookup={lookup} />)}</section>
  </div>
}
