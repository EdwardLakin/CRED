import type { buildRelationshipSummary } from '@/features/evidence/relationships/data'

type Summary = ReturnType<typeof buildRelationshipSummary>

const cards: Array<{ key: keyof Summary; label: string }> = [
  { key: 'totalRelationships', label: 'Total relationships' },
  { key: 'evidenceLinkedToEvents', label: 'Evidence linked to events' },
  { key: 'evidenceLinkedToEntities', label: 'Evidence linked to entities' },
  { key: 'evidenceLinkedToObservations', label: 'Evidence linked to observations' },
  { key: 'eventsLinkedToEntities', label: 'Events linked to entities' },
  { key: 'eventsLinkedToObservations', label: 'Events linked to observations' },
  { key: 'entitiesLinkedToObservations', label: 'Entities linked to observations' },
]

export function RelationshipSummaryCards({ summary }: { summary: Summary }) {
  return <section className="card detail-card form-stack" aria-labelledby="relationship-summary-heading"><div><p className="eyebrow">Relationship Summary</p><h2 id="relationship-summary-heading">Evidence graph at a glance</h2></div><div className="metadata-list">{cards.map((card) => <div key={card.key}><dt>{card.label}</dt><dd>{summary[card.key]}</dd></div>)}</div></section>
}
