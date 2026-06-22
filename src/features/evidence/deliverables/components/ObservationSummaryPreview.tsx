import type { Json } from '@/lib/supabase/database.types'
export function ObservationSummaryPreview({ content }: { content: Json }) {
  const observations = content && typeof content === 'object' && !Array.isArray(content) && Array.isArray(content.observations) ? content.observations as Array<Record<string, unknown>> : []
  return <div className="form-stack">{observations.slice(0, 5).map((observation) => <article key={String(observation.assertion_id)} className="card"><strong>{String(observation.factual_observation ?? 'Observation')}</strong><p className="muted">Supporting: {String(observation.supporting_evidence_count ?? 0)} · Contradicting: {String(observation.contradicting_evidence_count ?? 0)}</p></article>)}</div>
}
