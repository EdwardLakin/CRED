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
  { label: 'Review Queue', shortLabel: 'Review', key: null, href: 'evidence/review', current: 'review', description: 'Process unresolved evidence and AI suggestions without opening detail pages.' },
  { label: EVIDENCE_WORKSPACE_LABELS.library, shortLabel: 'Evidence', key: 'evidenceItems', href: 'evidence', current: 'library', description: 'Review source items and choose what to include in outputs.' },
  { label: EVIDENCE_WORKSPACE_LABELS.report, shortLabel: 'Report', key: null, href: 'report', current: 'report', description: 'Open the existing report review workspace.' },
  { label: EVIDENCE_WORKSPACE_LABELS.timeline, shortLabel: 'Timeline', key: 'timelineEvents', href: 'timeline', current: 'timeline', description: 'Organize dated events and linked evidence.' },
  { label: EVIDENCE_WORKSPACE_LABELS.entities, shortLabel: 'Entities', key: 'entities', href: 'entities', current: 'entities', description: 'Review people, places, assets, and organizations.' },
  { label: EVIDENCE_WORKSPACE_LABELS.assertions, shortLabel: 'Observations', key: 'factualObservations', href: 'assertions', current: 'assertions', description: 'Review factual observations and supporting links.' },
  { label: EVIDENCE_WORKSPACE_LABELS.relationships, shortLabel: 'Relationships', key: 'relationships', href: 'relationships', current: 'relationships', description: 'Explore how evidence, events, entities, and observations connect.' },
  { label: EVIDENCE_WORKSPACE_LABELS.suggestions, shortLabel: 'Suggestions', key: null, href: 'suggestions', current: 'suggestions', description: 'Review AI-proposed events, entities, observations, and relationships before accepting anything.' },
  { label: EVIDENCE_WORKSPACE_LABELS.deliverables, shortLabel: 'Deliverables', key: null, href: 'deliverables', current: 'deliverables', description: 'Generate preview-only chronology, evidence index, and observation summary outputs.' },
] as const

type EvidenceWorkspaceCurrent = typeof cards[number]['current']

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
        {cards.map((card) => <Link key={card.label} href={`/dashboard/sessions/${sessionId}/${card.href}`} className="workspace-destination-card touch-target"><strong>{card.label}</strong><span className="muted">{card.key ? counts[card.key] : 'Open'}</span><p className="muted">{card.description}</p></Link>)}
      </div>
    </section>
  )
}

export function EvidenceWorkspaceNavBar({ sessionId, current }: { sessionId: string; current: EvidenceWorkspaceCurrent }) {
  return (
    <nav className="evidence-workspace-nav" aria-label="Evidence Workspace navigation">
      <div className="evidence-workspace-nav-scroll">
        {cards.map((card) => (
          <Link key={card.label} href={`/dashboard/sessions/${sessionId}/${card.href}`} className={`evidence-workspace-nav-link touch-target${card.current === current ? ' active' : ''}`} aria-current={card.current === current ? 'page' : undefined}>
            <span className="evidence-workspace-nav-priority">{card.shortLabel ?? card.label}</span>
            <span className="evidence-workspace-nav-full">{card.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}

export const EvidenceWorkspaceBacklinks = EvidenceWorkspaceNavBar
