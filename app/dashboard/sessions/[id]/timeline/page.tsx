import Link from 'next/link'
import { requireWorkspaceFeatureOrRedirect } from '@/features/billing/feature-gates'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { EvidenceWorkspaceBacklinks } from '@/features/evidence/components/EvidenceWorkspaceNav'

import { TimelineWorkspace } from '@/features/evidence/components/TimelineWorkspace'
import { getTimelineData } from '@/features/evidence/timeline/data'

export default async function TimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const workspace = await requireSessionWorkspace()
  requireWorkspaceFeatureOrRedirect(workspace.profile, 'timeline', id)
  const data = await getTimelineData(id, workspace)

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <Link href={`/dashboard/sessions/${data.session.id}`} className="secondary-link touch-target">← Session</Link>
          <h1>Timeline</h1>
          <p className="muted">{data.session.title} · {data.events.length} events</p>
        </div>
      </div>
      <EvidenceWorkspaceBacklinks accessSubject={workspace.profile} sessionId={data.session.id} current="timeline" />
      <TimelineWorkspace {...data} />
    </main>
  )
}
