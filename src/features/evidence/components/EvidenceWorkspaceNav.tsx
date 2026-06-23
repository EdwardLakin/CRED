import Link from 'next/link'

import { EVIDENCE_WORKSPACE_LABELS } from '@/features/evidence/constants'

export type EvidenceWorkspaceCounts = {
  evidenceItems: number
  timelineEvents: number
  entities: number
  factualObservations: number
  relationships: number
  suggestions?: number
  reviewQueue?: number
}

const cards = [
  { label: EVIDENCE_WORKSPACE_LABELS.library, key: 'evidenceItems', href: 'evidence', description: 'Review source items and choose what to include in outputs.' },
  { label: 'Review Queue', key: null, href: 'evidence/review', description: 'Process unresolved evidence and AI suggestions without opening detail pages.' },
  { label: EVIDENCE_WORKSPACE_LABELS.timeline, key: 'timelineEvents', href: 'timeline', description: 'Organize dated events and linked evidence.' },
  { label: EVIDENCE_WORKSPACE_LABELS.entities, key: 'entities', href: 'entities', description: 'Review people, places, assets, and organizations.' },
  { label: EVIDENCE_WORKSPACE_LABELS.assertions, key: 'factualObservations', href: 'assertions', description: 'Review factual observations and supporting links.' },
  { label: EVIDENCE_WORKSPACE_LABELS.relationships, key: 'relationships', href: 'relationships', description: 'Explore how evidence, events, entities, and observations connect.' },
  { label: EVIDENCE_WORKSPACE_LABELS.suggestions, key: null, href: 'suggestions', description: 'Review AI-proposed events, entities, observations, and relationships before accepting anything.' },
  { label: EVIDENCE_WORKSPACE_LABELS.deliverables, key: null, href: 'deliverables', description: 'Generate preview-only chronology, evidence index, and observation summary outputs.' },
  { label: EVIDENCE_WORKSPACE_LABELS.report, key: null, href: 'report', description: 'Open the existing report review workspace.' },
] as const

export function EvidenceWorkspaceNav({ sessionId, counts }: { sessionId: string; counts: EvidenceWorkspaceCounts }) {
  return (
    <section className="card detail-card form-stack" aria-labelledby="evidence-workspace-heading">
      <div>
        <p className="eyebrow">Evidence Workspace</p>
        <h2 id="evidence-workspace-heading">Evidence Workspace overview</h2>
        <p className="muted">Use one place to move between Evidence Library, Timeline, Entities, Factual Observations, Relationship Explorer, Suggestions, Deliverables, and the Existing Report.</p>
      </div>
      <div className="metadata-list">
        <div><dt>Evidence items</dt><dd>{counts.evidenceItems}</dd></div>
        <div><dt>Timeline events</dt><dd>{counts.timelineEvents}</dd></div>
        <div><dt>Entities</dt><dd>{counts.entities}</dd></div>
        <div><dt>Factual observations</dt><dd>{counts.factualObservations}</dd></div>
        <div><dt>Relationships</dt><dd>{counts.relationships}</dd></div>
      </div>
      <div className="workspace-card-grid">
        {cards.map((card) => <Link key={card.label} href={`/dashboard/sessions/${sessionId}/${card.href}`} className="card detail-card touch-target"><strong>{card.label}</strong><span className="muted">{card.key ? counts[card.key] : 'Open'}</span><p className="muted">{card.description}</p></Link>)}
      </div>
    </section>
  )
}

export function EvidenceWorkspaceBacklinks({ sessionId, current }: { sessionId: string; current: 'library' | 'review' | 'timeline' | 'entities' | 'assertions' | 'relationships' | 'suggestions' | 'deliverables' | 'report' }) {
  return <nav className="form-actions" aria-label="Evidence Workspace navigation">{cards.filter((card) => card.href !== (current === 'library' ? 'evidence' : current === 'review' ? 'evidence/review' : current)).map((card) => <Link key={card.label} href={`/dashboard/sessions/${sessionId}/${card.href}`} className="secondary-link touch-target">{card.label}</Link>)}</nav>
}
