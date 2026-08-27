import { createEvidenceAssertion, deleteEvidenceAssertion, linkAssertionRelationship, unlinkAssertionRelationship, updateEvidenceAssertion } from '@/features/evidence/assertions/actions'
import type { AssertionEntity, AssertionEvidenceItem, AssertionRelationship, AssertionTimelineEvent, AssertionsSession, EvidenceAssertion } from '@/features/evidence/assertions/data'
import { EVIDENCE_ASSERTION_TYPES, EVIDENCE_SUGGESTION_SOURCES, SUGGESTION_REVIEW_STATUSES } from '@/features/evidence/constants'

function evidenceLabel(item?: AssertionEvidenceItem) { return item ? item.original_filename || item.technician_note || `${item.media_kind} item` : 'Unknown item' }
function relationshipCount(relationships: AssertionRelationship[], type: string) { return relationships.filter((relationship) => relationship.source_type === type).length }

export function AssertionsWorkspace({ session, assertions, evidenceItems, entities, timelineEvents, relationships }: { session: AssertionsSession; assertions: EvidenceAssertion[]; evidenceItems: AssertionEvidenceItem[]; entities: AssertionEntity[]; timelineEvents: AssertionTimelineEvent[]; relationships: AssertionRelationship[] }) {
  const relationshipsByAssertion = new Map<string, AssertionRelationship[]>()
  for (const relationship of relationships) relationshipsByAssertion.set(relationship.target_id, [...(relationshipsByAssertion.get(relationship.target_id) ?? []), relationship])

  return <div className="form-stack">
    <section className="card detail-card form-stack"><p className="eyebrow">Factual Observations workspace</p><h2>{session.title}</h2><p className="muted">Create and review session-scoped factual observations without changing capture, reports, exports, review, timeline, or entities behavior.</p></section>
    <AssertionForm sessionId={session.id} />
    {assertions.length === 0 ? <div className="empty-state">No factual observations yet.</div> : assertions.map((assertion) => {
      const assertionRelationships = relationshipsByAssertion.get(assertion.id) ?? []
      return <article key={assertion.id} className="card detail-card form-stack">
        <div className="section-header"><div><p className="eyebrow">{assertion.assertion_type} · {assertion.review_status} · {assertion.suggestion_source}</p><h3>{assertion.statement}</h3><p className="muted">Linked items: {relationshipCount(assertionRelationships, 'capture_item')} · Linked entities: {relationshipCount(assertionRelationships, 'entity')} · Linked timeline events: {relationshipCount(assertionRelationships, 'timeline_event')}</p></div><form action={deleteEvidenceAssertion.bind(null, session.id, assertion.id)}><button className="button button-secondary touch-target">Delete factual observation</button></form></div>
        <RelationshipList sessionId={session.id} relationships={assertionRelationships} evidenceItems={evidenceItems} entities={entities} timelineEvents={timelineEvents} />
        <LinkAssertionForm sessionId={session.id} assertionId={assertion.id} evidenceItems={evidenceItems} entities={entities} timelineEvents={timelineEvents} />
        <details><summary className="secondary-link touch-target">Edit factual observation</summary><AssertionForm sessionId={session.id} assertion={assertion} /></details>
      </article>
    })}
  </div>
}

function AssertionForm({ sessionId, assertion }: { sessionId: string; assertion?: EvidenceAssertion }) {
  const action = assertion ? updateEvidenceAssertion.bind(null, sessionId, assertion.id) : createEvidenceAssertion.bind(null, sessionId)
  const notes = assertion?.attributes && typeof assertion.attributes === 'object' && !Array.isArray(assertion.attributes) && 'notes' in assertion.attributes ? String(assertion.attributes.notes ?? '') : ''
  return <form action={action} className="card detail-card form-stack">
    <div><p className="eyebrow">{assertion ? 'Edit factual observation' : 'Create factual observation'}</p><h2>{assertion?.statement ?? 'New factual observation'}</h2></div>
    <div className="form-grid two-column"><label>Assertion type<select className="input" name="assertion_type" defaultValue={assertion?.assertion_type ?? 'factual_observation'}>{EVIDENCE_ASSERTION_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Review status<select className="input" name="review_status" defaultValue={assertion?.review_status ?? 'accepted'}>{SUGGESTION_REVIEW_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
    <label>Statement<textarea className="input" name="statement" rows={3} required defaultValue={assertion?.statement ?? ''} /></label>
    <label>Notes<textarea className="input" name="attributes" rows={3} defaultValue={notes} /></label>
    <label>Suggestion source<select className="input" name="suggestion_source" defaultValue={assertion?.suggestion_source ?? 'user'}>{EVIDENCE_SUGGESTION_SOURCES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    <button className="button button-primary touch-target">{assertion ? 'Save factual observation' : 'Create factual observation'}</button>
  </form>
}

function RelationshipList({ sessionId, relationships, evidenceItems, entities, timelineEvents }: { sessionId: string; relationships: AssertionRelationship[]; evidenceItems: AssertionEvidenceItem[]; entities: AssertionEntity[]; timelineEvents: AssertionTimelineEvent[] }) {
  if (relationships.length === 0) return <p className="muted">No linked items, entities, or timeline events.</p>
  const evidenceById = new Map(evidenceItems.map((item) => [item.id, item])); const entitiesById = new Map(entities.map((entity) => [entity.id, entity])); const eventsById = new Map(timelineEvents.map((event) => [event.id, event]))
  return <ul className="form-stack">{relationships.map((relationship) => <li key={relationship.id}>{relationship.source_type === 'capture_item' ? evidenceLabel(evidenceById.get(relationship.source_id)) : relationship.source_type === 'entity' ? entitiesById.get(relationship.source_id)?.display_name ?? relationship.source_id : eventsById.get(relationship.source_id)?.title ?? relationship.source_id} · {relationship.relationship_type} <form action={unlinkAssertionRelationship.bind(null, sessionId, relationship.id)} style={{ display: 'inline' }}><button className="secondary-link">unlink</button></form></li>)}</ul>
}

function LinkAssertionForm({ sessionId, assertionId, evidenceItems, entities, timelineEvents }: { sessionId: string; assertionId: string; evidenceItems: AssertionEvidenceItem[]; entities: AssertionEntity[]; timelineEvents: AssertionTimelineEvent[] }) {
  return <div className="form-stack"><form action={linkAssertionRelationship.bind(null, sessionId, assertionId)} className="form-actions"><input type="hidden" name="source_type" value="capture_item" /><select className="input" name="source_id" required><option value="">Select item</option>{evidenceItems.map((item) => <option key={item.id} value={item.id}>{evidenceLabel(item)}</option>)}</select><select className="input" name="relationship_type"><option value="supports">supports</option><option value="contradicts">contradicts</option><option value="references">references</option></select><button className="button button-secondary touch-target">Link item</button></form><form action={linkAssertionRelationship.bind(null, sessionId, assertionId)} className="form-actions"><input type="hidden" name="source_type" value="entity" /><select className="input" name="source_id" required><option value="">Select entity</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.display_name}</option>)}</select><select className="input" name="relationship_type"><option value="references">references</option></select><button className="button button-secondary touch-target">Link entity</button></form><form action={linkAssertionRelationship.bind(null, sessionId, assertionId)} className="form-actions"><input type="hidden" name="source_type" value="timeline_event" /><select className="input" name="source_id" required><option value="">Select timeline event</option>{timelineEvents.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select><select className="input" name="relationship_type"><option value="documents">documents</option><option value="supports">supports</option><option value="references">references</option></select><button className="button button-secondary touch-target">Link timeline event</button></form></div>
}
