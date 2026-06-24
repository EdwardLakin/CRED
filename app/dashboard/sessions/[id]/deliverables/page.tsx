import Link from 'next/link'
import { requireWorkspaceFeatureOrRedirect } from '@/features/billing/feature-gates'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { EvidenceWorkspaceBacklinks } from '@/features/evidence/components/EvidenceWorkspaceNav'
import { DeliverablesWorkspace } from '@/features/evidence/deliverables/components/DeliverablesWorkspace'
import { getDeliverablesData } from '@/features/evidence/deliverables/data'

export default async function DeliverablesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const workspace = await requireSessionWorkspace()
  requireWorkspaceFeatureOrRedirect(workspace.profile, 'deliverables', id)
  const data = await getDeliverablesData(id, workspace)
  return <main className="page-shell dashboard-shell"><div className="section-header page-header"><div><Link href={`/dashboard/sessions/${data.session.id}`} className="secondary-link touch-target">← Session</Link><h1>Deliverables</h1><p className="muted">{data.session.title} · Preview-only evidence outputs</p></div></div><EvidenceWorkspaceBacklinks accessSubject={workspace.profile} sessionId={data.session.id} current="deliverables" /><DeliverablesWorkspace data={data} /></main>
}
