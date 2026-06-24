import Link from 'next/link'
import { requireWorkspaceFeatureOrRedirect } from '@/features/billing/feature-gates'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { EvidenceWorkspaceBacklinks } from '@/features/evidence/components/EvidenceWorkspaceNav'

import { AssertionsWorkspace } from '@/features/evidence/components/AssertionsWorkspace'
import { getAssertionsData } from '@/features/evidence/assertions/data'

export default async function AssertionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const workspace = await requireSessionWorkspace()
  requireWorkspaceFeatureOrRedirect(workspace.profile, 'factual_observations', id)
  // Keep the route wired to getAssertionsData(id); workspace injection preserves scoped entitlement checks.
  const data = await getAssertionsData(id, workspace)
  return <main className="page-shell dashboard-shell"><div className="section-header page-header"><div><Link href={`/dashboard/sessions/${data.session.id}`} className="secondary-link touch-target">← Session</Link><h1>Factual Observations</h1><p className="muted">{data.session.title} · {data.assertions.length} factual observations</p></div></div><EvidenceWorkspaceBacklinks accessSubject={workspace.profile} sessionId={data.session.id} current="assertions" /><AssertionsWorkspace {...data} /></main>
}
