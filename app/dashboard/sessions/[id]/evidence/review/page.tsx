import Link from 'next/link'
import { EvidenceWorkspaceBacklinks } from '@/features/evidence/components/EvidenceWorkspaceNav'
import { ReviewQueueWorkspace } from '@/features/evidence/review/components/ReviewQueueWorkspace'
import { getReviewQueueData, parseReviewQueueSearchParams } from '@/features/evidence/review/data'

export default async function EvidenceReviewQueuePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  const data = await getReviewQueueData(id, parseReviewQueueSearchParams(await searchParams))
  return <main className="page-shell dashboard-shell"><div className="section-header page-header"><div><Link href={`/dashboard/sessions/${data.session.id}`} className="secondary-link touch-target">← Session</Link><h1>Review Queue</h1><p className="muted">{data.session.title} · human review for unresolved evidence and AI suggestions</p></div></div><EvidenceWorkspaceBacklinks sessionId={data.session.id} current="review" /><ReviewQueueWorkspace data={data} /></main>
}
