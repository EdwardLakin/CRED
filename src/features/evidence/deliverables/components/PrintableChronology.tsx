import type { Json } from '@/lib/supabase/database.types'

function rows(content: Json) {
  return content && typeof content === 'object' && !Array.isArray(content) && Array.isArray(content.events) ? content.events as Array<Record<string, unknown>> : []
}

export function PrintableChronology({ content }: { content: Json }) {
  const events = rows(content)
  return <section className="print-section"><h2>Chronology</h2>{events.length === 0 ? <p>No chronology rows were captured in this deliverable snapshot.</p> : <div className="print-table-wrap"><table className="print-table"><thead><tr><th>Event</th><th>Date / time</th><th>Item links</th><th>Entities</th><th>Factual observations</th></tr></thead><tbody>{events.map((event) => <tr key={String(event.event_id)}><td><strong>{String(event.title ?? 'Untitled event')}</strong></td><td>{String(event.event_start_at ?? event.event_time ?? 'Not dated')}</td><td>{String(event.linked_evidence_count ?? 0)}</td><td>{Array.isArray(event.linked_entities) ? event.linked_entities.map((entity) => String((entity as Record<string, unknown>).display_name ?? 'Entity')).join(', ') : '—'}</td><td>{Array.isArray(event.linked_factual_observations) ? event.linked_factual_observations.map((observation) => String((observation as Record<string, unknown>).statement ?? 'Observation')).join('; ') : '—'}</td></tr>)}</tbody></table></div>}</section>
}
