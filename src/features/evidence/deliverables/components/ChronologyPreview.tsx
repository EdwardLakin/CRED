import type { Json } from '@/lib/supabase/database.types'
export function ChronologyPreview({ content }: { content: Json }) {
  const events = content && typeof content === 'object' && !Array.isArray(content) && Array.isArray(content.events) ? content.events as Array<Record<string, unknown>> : []
  return <div className="form-stack">{events.slice(0, 5).map((event) => <article key={String(event.event_id)} className="card"><strong>{String(event.title ?? 'Untitled event')}</strong><p className="muted">Evidence links: {String(event.linked_evidence_count ?? 0)}</p></article>)}</div>
}
