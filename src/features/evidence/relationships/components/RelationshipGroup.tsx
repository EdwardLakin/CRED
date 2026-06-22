import type { RelationshipAssertion, RelationshipEntity, RelationshipEvidenceItem, RelationshipRecord, RelationshipTimelineEvent } from '@/features/evidence/relationships/data'
import { RelationshipList } from '@/features/evidence/relationships/components/RelationshipList'

type Lookup = { evidenceItems: RelationshipEvidenceItem[]; timelineEvents: RelationshipTimelineEvent[]; entities: RelationshipEntity[]; assertions: RelationshipAssertion[] }

export function RelationshipGroup({ title, description, relationships, lookup }: { title: string; description: string; relationships: RelationshipRecord[]; lookup: Lookup }) {
  return <section className="form-stack" aria-labelledby={`${title.toLowerCase().replaceAll(' ', '-')}-heading`}><div><h2 id={`${title.toLowerCase().replaceAll(' ', '-')}-heading`}>{title}</h2><p className="muted">{description}</p></div><RelationshipList relationships={relationships} lookup={lookup} /></section>
}
