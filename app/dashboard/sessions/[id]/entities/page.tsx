import Link from 'next/link'
import { requireWorkspaceFeatureOrRedirect } from '@/features/billing/feature-gates'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { EvidenceWorkspaceBacklinks } from '@/features/evidence/components/EvidenceWorkspaceNav'

import { EntitiesWorkspace } from '@/features/evidence/components/EntitiesWorkspace'
import { getEntitiesData } from '@/features/evidence/entities/data'

export default async function EntitiesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const workspace = await requireSessionWorkspace()
  requireWorkspaceFeatureOrRedirect(workspace.profile, 'entities', id)
  const data = await getEntitiesData(id, workspace)
  return <main className="page-shell dashboard-shell"><div className="section-header page-header"><div><Link href={`/dashboard/sessions/${data.session.id}`} className="secondary-link touch-target">← Session</Link><h1>Entities</h1><p className="muted">{data.session.title} · {data.entities.length} entities</p></div></div><EvidenceWorkspaceBacklinks accessSubject={workspace.profile} sessionId={data.session.id} current="entities" /><EntitiesWorkspace {...data} /></main>
}
