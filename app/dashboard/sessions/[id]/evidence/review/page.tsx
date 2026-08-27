import Link from 'next/link'
import { requireWorkspaceFeatureOrRedirect } from '@/features/billing/feature-gates'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { EvidenceWorkspaceBacklinks } from '@/features/evidence/components/EvidenceWorkspaceNav'
import { ReviewQueueWorkspace } from '@/features/evidence/review/components/ReviewQueueWorkspace'
import { getReviewQueueData, parseReviewQueueSearchParams } from '@/features/evidence/review/data'

export default async function EvidenceReviewQueuePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  const workspace = await requireSessionWorkspace()
  requireWorkspaceFeatureOrRedirect(workspace.profile, 'review_queue', id)
  const data = await getReviewQueueData(id, parseReviewQueueSearchParams(await searchParams))
  return <main className="page-shell dashboard-shell"><div className="section-header page-header"><div><Link href={`/dashboard/sessions/${data.session.id}`} className="secondary-link touch-target">← Session</Link><h1>Advanced Review</h1><p className="muted">{data.session.title} · resolve items and AI suggestions that need attention</p></div></div><EvidenceWorkspaceBacklinks accessSubject={workspace.profile} sessionId={data.session.id} current="review" /><ReviewQueueWorkspace data={data} /></main>
}
