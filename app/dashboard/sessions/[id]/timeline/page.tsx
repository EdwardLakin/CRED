import Link from 'next/link'

import { TimelineWorkspace } from '@/features/evidence/components/TimelineWorkspace'
import { getTimelineData } from '@/features/evidence/timeline/data'

export default async function TimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getTimelineData(id)

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <Link href={`/dashboard/sessions/${data.session.id}`} className="secondary-link touch-target">← Session</Link>
          <h1>Timeline</h1>
          <p className="muted">{data.session.title} · {data.events.length} events</p>
        </div>
      </div>
      <TimelineWorkspace {...data} />
    </main>
  )
}
