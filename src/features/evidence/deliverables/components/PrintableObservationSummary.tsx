import type { Json } from '@/lib/supabase/database.types'

function rows(content: Json) {
  return content && typeof content === 'object' && !Array.isArray(content) && Array.isArray(content.observations) ? content.observations as Array<Record<string, unknown>> : []
}

export function PrintableObservationSummary({ content }: { content: Json }) {
  const observations = rows(content)
  return <section className="print-section"><h2>Observation Summary</h2>{observations.length === 0 ? <p>No observation rows were captured in this deliverable snapshot.</p> : <div className="observation-list">{observations.map((observation) => <article key={String(observation.assertion_id)} className="print-observation"><h3>{String(observation.factual_observation ?? 'Observation')}</h3><p>Supporting items: {String(observation.supporting_evidence_count ?? 0)} · Contradicting items: {String(observation.contradicting_evidence_count ?? 0)} · Linked items: {String(observation.linked_evidence_count ?? 0)}</p><p><strong>Entities:</strong> {Array.isArray(observation.linked_entities) ? observation.linked_entities.map((entity) => String((entity as Record<string, unknown>).display_name ?? 'Entity')).join(', ') : '—'}</p><p><strong>Timeline events:</strong> {Array.isArray(observation.linked_timeline_events) ? observation.linked_timeline_events.map((event) => String((event as Record<string, unknown>).title ?? 'Event')).join(', ') : '—'}</p></article>)}</div>}</section>
}
