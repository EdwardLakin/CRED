import type { EvidenceDeliverable } from '../data'
import { summarizeDeliverableContent } from '../data'
import { ChronologyPreview } from './ChronologyPreview'
import { EvidenceIndexPreview } from './EvidenceIndexPreview'
import { ObservationSummaryPreview } from './ObservationSummaryPreview'
import { RelationshipMapPreview } from './RelationshipMapPreview'

export function DeliverablePreview({ deliverable }: { deliverable: EvidenceDeliverable }) {
  return <details className="card detail-card form-stack"><summary className="secondary-link touch-target">View {deliverable.title}</summary><p className="muted">{deliverable.summary ?? summarizeDeliverableContent(deliverable.content)}</p>{deliverable.deliverable_type === 'chronology' ? <ChronologyPreview content={deliverable.content} /> : null}{deliverable.deliverable_type === 'evidence_index' ? <EvidenceIndexPreview content={deliverable.content} /> : null}{deliverable.deliverable_type === 'observation_summary' ? <ObservationSummaryPreview content={deliverable.content} /> : null}{deliverable.deliverable_type === 'relationship_map' ? <RelationshipMapPreview content={deliverable.content} /> : null}</details>
}
