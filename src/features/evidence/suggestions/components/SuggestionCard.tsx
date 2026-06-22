import { reviewEvidenceSuggestion } from '@/features/evidence/suggestions/actions'

export function provenanceSummary(provenance: unknown) {
  if (!provenance || typeof provenance !== 'object') return 'No provenance summary available.'
  const record = provenance as Record<string, unknown>
  return String(record.reasoning_summary ?? record.summary ?? `Source evidence IDs: ${Array.isArray(record.source_evidence_ids) ? record.source_evidence_ids.join(', ') : 'not listed'}`)
}
export function sourceEvidenceSummary(provenance: unknown) {
  const ids = typeof provenance === 'object' && provenance ? (provenance as Record<string, unknown>).source_evidence_ids : null
  return Array.isArray(ids) && ids.length ? ids.join(', ') : 'No source evidence IDs listed'
}
export function SuggestionCard({ sessionId, suggestionId, category, title, children, confidence, createdAt, reviewStatus, provenance }: { sessionId: string; suggestionId: string; category: string; title: string; children?: React.ReactNode; confidence: number | null; createdAt: string; reviewStatus: string; provenance: unknown }) {
  const action = reviewEvidenceSuggestion.bind(null, sessionId, suggestionId)
  return <article className="card detail-card form-stack"><div className="section-header"><div><p className="eyebrow">{category} · {reviewStatus}</p><h3>{title}</h3></div></div><div className="metadata-list"><div><dt>Source evidence</dt><dd>{sourceEvidenceSummary(provenance)}</dd></div><div><dt>Confidence</dt><dd>{confidence ?? 'Not provided'}</dd></div><div><dt>Generated date</dt><dd>{createdAt}</dd></div><div><dt>Review status</dt><dd>{reviewStatus}</dd></div></div><p className="muted">{provenanceSummary(provenance)}</p>{children}<div className="form-actions"><form action={action}><input type="hidden" name="category" value={category} /><input type="hidden" name="decision" value="accepted" /><button className="button button-primary touch-target">Accept</button></form><form action={action}>{children}<input type="hidden" name="category" value={category} /><input type="hidden" name="decision" value="edited" /><button className="button button-secondary touch-target">Edit and Accept</button></form><form action={action}><input type="hidden" name="category" value={category} /><input type="hidden" name="decision" value="rejected" /><button className="button button-secondary touch-target">Reject</button></form></div></article>
}
