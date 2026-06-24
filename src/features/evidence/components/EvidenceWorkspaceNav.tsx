import Link from 'next/link'

import type { FeatureAccessSubject, FeatureKey } from '@/features/billing/feature-gates'
import { canUseFeature, getVisibleWorkspaceFeatures } from '@/features/billing/feature-gates'
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

type WorkspaceNavItem = {
  href: string
  label: string
  shortLabel?: string
  priority: boolean
  feature: FeatureKey
}

type EvidenceWorkspaceCurrent =
  | 'review'
  | 'library'
  | 'report'
  | 'timeline'
  | 'entities'
  | 'assertions'
  | 'relationships'
  | 'suggestions'
  | 'deliverables'

type WorkspaceNavCard = WorkspaceNavItem & {
  key: keyof EvidenceWorkspaceCounts | null
  current: EvidenceWorkspaceCurrent
  description: string
}

// Standard labels: Evidence Library, Timeline, Entities, Factual Observations, Deliverables, Existing Report
const cards: WorkspaceNavCard[] = [
  { feature: 'review_queue', label: 'Review Queue', shortLabel: 'Review', key: null, href: 'evidence/review', current: 'review', description: 'Process unresolved evidence and AI suggestions without opening detail pages.', priority: true },
  { feature: 'evidence_library', label: EVIDENCE_WORKSPACE_LABELS.library, shortLabel: 'Evidence', key: 'evidenceItems', href: 'evidence', current: 'library', description: 'Review source items and choose what to include in outputs.', priority: true },
  { feature: 'existing_report', label: EVIDENCE_WORKSPACE_LABELS.report, shortLabel: 'Report', key: null, href: 'report', current: 'report', description: 'Open the existing report review workspace.', priority: true },
  { feature: 'timeline', label: EVIDENCE_WORKSPACE_LABELS.timeline, shortLabel: 'Timeline', key: 'timelineEvents', href: 'timeline', current: 'timeline', description: 'Organize dated events and linked evidence.', priority: true },
  { feature: 'entities', label: EVIDENCE_WORKSPACE_LABELS.entities, shortLabel: 'Entities', key: 'entities', href: 'entities', current: 'entities', description: 'Review people, places, assets, and organizations.', priority: true },
  { feature: 'factual_observations', label: EVIDENCE_WORKSPACE_LABELS.assertions, shortLabel: 'Observations', key: 'factualObservations', href: 'assertions', current: 'assertions', description: 'Review factual observations and supporting links.', priority: true },
  { feature: 'relationship_explorer', label: EVIDENCE_WORKSPACE_LABELS.relationships, shortLabel: 'Relationships', key: 'relationships', href: 'relationships', current: 'relationships', description: 'Explore how evidence, events, entities, and observations connect.', priority: true },
  { feature: 'suggestions', label: EVIDENCE_WORKSPACE_LABELS.suggestions, shortLabel: 'Suggestions', key: null, href: 'suggestions', current: 'suggestions', description: 'Review AI-proposed events, entities, observations, and relationships before accepting anything.', priority: false },
  { feature: 'deliverables', label: EVIDENCE_WORKSPACE_LABELS.deliverables, shortLabel: 'Deliverables', key: null, href: 'deliverables', current: 'deliverables', description: 'Generate preview-only chronology, evidence index, and observation summary outputs.', priority: false },
]

export function EvidenceWorkspaceNav({ sessionId, counts, accessSubject }: { sessionId: string; counts: EvidenceWorkspaceCounts; accessSubject?: FeatureAccessSubject }) {
  const subject = accessSubject ?? 'shop'
  const visibleCards = cards.filter((card) => canUseFeature(subject, card.feature))
  const visibleFeatures = getVisibleWorkspaceFeatures(subject)
  return (
    <section className="card detail-card form-stack" aria-labelledby="evidence-workspace-heading">
      <div>
        <p className="eyebrow">Evidence Workspace</p>
        <h2 id="evidence-workspace-heading">Evidence Workspace overview</h2>
        <p className="muted">Use one compact workspace for the features included in your CRED tier.</p>
      </div>
      <div className="metadata-list">
        <div><dt>Evidence items</dt><dd>{counts.evidenceItems}</dd></div>
        {visibleFeatures.some((feature) => feature.key === 'timeline') ? <div><dt>Timeline events</dt><dd>{counts.timelineEvents}</dd></div> : null}
        {visibleFeatures.some((feature) => feature.key === 'entities') ? <div><dt>Entities</dt><dd>{counts.entities}</dd></div> : null}
        {visibleFeatures.some((feature) => feature.key === 'factual_observations') ? <div><dt>Factual observations</dt><dd>{counts.factualObservations}</dd></div> : null}
        {visibleFeatures.some((feature) => feature.key === 'relationship_explorer') ? <div><dt>Relationships</dt><dd>{counts.relationships}</dd></div> : null}
      </div>
      <div className="workspace-card-grid">
        {visibleCards.map((card) => <Link key={card.label} href={`/dashboard/sessions/${sessionId}/${card.href}`} className="workspace-destination-card touch-target"><strong>{card.label}</strong><span className="muted">{card.key ? counts[card.key] : 'Open'}</span><p className="muted">{card.description}</p></Link>)}
      </div>
    </section>
  )
}

export function EvidenceWorkspaceNavBar({ sessionId, current, accessSubject }: { sessionId: string; current: EvidenceWorkspaceCurrent; accessSubject?: FeatureAccessSubject }) {
  const subject = accessSubject ?? 'shop'
  const visibleCards = cards.filter((card) => canUseFeature(subject, card.feature))
  return (
    <nav className="evidence-workspace-nav" aria-label="Evidence Workspace navigation">
      <div className="evidence-workspace-nav-scroll">
        {visibleCards.map((card) => (
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
