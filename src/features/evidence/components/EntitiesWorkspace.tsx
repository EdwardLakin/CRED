import { createEvidenceEntity, deleteEvidenceEntity, linkEntityRelationship, unlinkEntityRelationship, updateEvidenceEntity } from '@/features/evidence/entities/actions'
import type { EntitiesSession, EntityEvidenceItem, EntityRelationship, EntityTimelineEvent, EvidenceEntity } from '@/features/evidence/entities/data'
import { EVIDENCE_ENTITY_TYPES, EVIDENCE_SUGGESTION_SOURCES, SUGGESTION_REVIEW_STATUSES } from '@/features/evidence/constants'

function evidenceLabel(item?: EntityEvidenceItem) { return item ? item.original_filename || item.technician_note || `${item.media_kind} evidence` : 'Unknown evidence' }
function relationshipCount(relationships: EntityRelationship[], type: string) { return relationships.filter((relationship) => relationship.source_type === type).length }

export function EntitiesWorkspace({ session, entities, evidenceItems, timelineEvents, relationships }: { session: EntitiesSession; entities: EvidenceEntity[]; evidenceItems: EntityEvidenceItem[]; timelineEvents: EntityTimelineEvent[]; relationships: EntityRelationship[] }) {
  const relationshipsByEntity = new Map<string, EntityRelationship[]>()
  for (const relationship of relationships) relationshipsByEntity.set(relationship.target_id, [...(relationshipsByEntity.get(relationship.target_id) ?? []), relationship])
  const groupedEntities = EVIDENCE_ENTITY_TYPES.map((type) => ({ type, entities: entities.filter((entity) => entity.entity_type === type) })).filter((group) => group.entities.length > 0)

  return <div className="form-stack">
    <section className="card detail-card form-stack"><p className="eyebrow">Entities workspace</p><h2>{session.title}</h2><p className="muted">Create and review session-scoped entities without changing capture, reports, exports, review, or timeline behavior.</p></section>
    <EntityForm sessionId={session.id} />
    {entities.length === 0 ? <div className="empty-state">No entities yet.</div> : groupedEntities.map((group) => <section key={group.type} className="form-stack"><h2>{group.type}</h2>{group.entities.map((entity) => {
      const entityRelationships = relationshipsByEntity.get(entity.id) ?? []
      return <article key={entity.id} className="card detail-card form-stack">
        <div className="section-header"><div><p className="eyebrow">{entity.entity_type} · {entity.review_status} · {entity.suggestion_source}</p><h3>{entity.display_name}</h3><p className="muted">Linked evidence count: {relationshipCount(entityRelationships, 'capture_item')} · Linked timeline event count: {relationshipCount(entityRelationships, 'timeline_event')}</p></div><form action={deleteEvidenceEntity.bind(null, session.id, entity.id)}><button className="button button-secondary touch-target">Delete entity</button></form></div>
        <p>{entity.description || 'No description.'}</p>
        <RelationshipList sessionId={session.id} relationships={entityRelationships} evidenceItems={evidenceItems} timelineEvents={timelineEvents} />
        <LinkEntityForm sessionId={session.id} entityId={entity.id} evidenceItems={evidenceItems} timelineEvents={timelineEvents} />
        <details><summary className="secondary-link touch-target">Edit entity</summary><EntityForm sessionId={session.id} entity={entity} /></details>
      </article>
    })}</section>)}
  </div>
}

function EntityForm({ sessionId, entity }: { sessionId: string; entity?: EvidenceEntity }) {
  const action = entity ? updateEvidenceEntity.bind(null, sessionId, entity.id) : createEvidenceEntity.bind(null, sessionId)
  return <form action={action} className="card detail-card form-stack">
    <div><p className="eyebrow">{entity ? 'Edit entity' : 'Create entity'}</p><h2>{entity?.display_name ?? 'New entity'}</h2></div>
    <div className="form-grid two-column"><label>Entity type<select className="input" name="entity_type" defaultValue={entity?.entity_type ?? 'person'}>{EVIDENCE_ENTITY_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Display name<input className="input" name="display_name" required defaultValue={entity?.display_name ?? ''} /></label></div>
    <label>Description<textarea className="input" name="description" rows={3} defaultValue={entity?.description ?? ''} /></label>
    <label>Attributes notes / JSON<textarea className="input" name="attributes" rows={3} defaultValue={entity?.attributes ? JSON.stringify(entity.attributes, null, 2) : ''} /></label>
    <div className="form-grid two-column"><label>Review status<select className="input" name="review_status" defaultValue={entity?.review_status ?? 'accepted'}>{SUGGESTION_REVIEW_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Suggestion source<select className="input" name="suggestion_source" defaultValue={entity?.suggestion_source ?? 'user'}>{EVIDENCE_SUGGESTION_SOURCES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
    <button className="button button-primary touch-target">{entity ? 'Save entity' : 'Create entity'}</button>
  </form>
}

function RelationshipList({ sessionId, relationships, evidenceItems, timelineEvents }: { sessionId: string; relationships: EntityRelationship[]; evidenceItems: EntityEvidenceItem[]; timelineEvents: EntityTimelineEvent[] }) {
  if (relationships.length === 0) return <p className="muted">No linked evidence or timeline events.</p>
  const evidenceById = new Map(evidenceItems.map((item) => [item.id, item])); const eventsById = new Map(timelineEvents.map((event) => [event.id, event]))
  return <ul className="form-stack">{relationships.map((relationship) => <li key={relationship.id}>{relationship.source_type === 'capture_item' ? evidenceLabel(evidenceById.get(relationship.source_id)) : eventsById.get(relationship.source_id)?.title ?? relationship.source_id} · {relationship.relationship_type} <form action={unlinkEntityRelationship.bind(null, sessionId, relationship.id)} style={{ display: 'inline' }}><button className="secondary-link">unlink</button></form></li>)}</ul>
}

function LinkEntityForm({ sessionId, entityId, evidenceItems, timelineEvents }: { sessionId: string; entityId: string; evidenceItems: EntityEvidenceItem[]; timelineEvents: EntityTimelineEvent[] }) {
  return <div className="form-stack"><form action={linkEntityRelationship.bind(null, sessionId, entityId)} className="form-actions"><input type="hidden" name="source_type" value="capture_item" /><select className="input" name="source_id" required><option value="">Select evidence</option>{evidenceItems.map((item) => <option key={item.id} value={item.id}>{evidenceLabel(item)}</option>)}</select><select className="input" name="relationship_type"><option value="mentions">mentions</option><option value="depicts">depicts</option></select><button className="button button-secondary touch-target">Link evidence</button></form><form action={linkEntityRelationship.bind(null, sessionId, entityId)} className="form-actions"><input type="hidden" name="source_type" value="timeline_event" /><select className="input" name="source_id" required><option value="">Select timeline event</option>{timelineEvents.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select><select className="input" name="relationship_type"><option value="involves">involves</option></select><button className="button button-secondary touch-target">Link timeline event</button></form></div>
}
