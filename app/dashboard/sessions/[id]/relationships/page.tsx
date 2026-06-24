import Link from 'next/link'
import { requireWorkspaceFeatureOrRedirect } from '@/features/billing/feature-gates'
import { requireSessionWorkspace } from '@/features/sessions/data'

import { EvidenceWorkspaceBacklinks } from '@/features/evidence/components/EvidenceWorkspaceNav'
import { RelationshipExplorer } from '@/features/evidence/relationships/components/RelationshipExplorer'
import { getRelationshipExplorerData } from '@/features/evidence/relationships/data'

export default async function RelationshipsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const workspace = await requireSessionWorkspace()
  requireWorkspaceFeatureOrRedirect(workspace.profile, 'relationship_explorer', id)
  const data = await getRelationshipExplorerData(id, workspace)

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <Link href={`/dashboard/sessions/${data.session.id}`} className="secondary-link touch-target">← Session</Link>
          <h1>Relationship Explorer</h1>
          <p className="muted">{data.session.title} · {data.relationships.length} relationships</p>
        </div>
      </div>
      <EvidenceWorkspaceBacklinks accessSubject={workspace.profile} sessionId={data.session.id} current="relationships" />
      <RelationshipExplorer {...data} />
    </main>
  )
}
