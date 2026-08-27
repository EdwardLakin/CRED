import type { getDeliverableSourceCounts } from '../data'

export function DeliverableSourceCounts({ counts }: { counts: ReturnType<typeof getDeliverableSourceCounts> }) {
  return <dl className="metadata-list" aria-label="Selected source counts"><div><dt>Items selected</dt><dd>{counts.evidenceItems}</dd></div><div><dt>Import batches selected</dt><dd>{counts.importBatches}</dd></div><div><dt>Timeline events selected</dt><dd>{counts.timelineEvents}</dd></div><div><dt>Entities selected</dt><dd>{counts.entities}</dd></div><div><dt>Factual observations selected</dt><dd>{counts.factualObservations}</dd></div><div><dt>Relationships selected</dt><dd>{counts.relationships}</dd></div></dl>
}
