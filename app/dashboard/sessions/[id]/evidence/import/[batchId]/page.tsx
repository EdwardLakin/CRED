import Link from 'next/link'
import { EvidenceImportBatchReview } from '@/features/evidence/import/components/EvidenceImportBatchReview'
import { getEvidenceImportBatchDetail } from '@/features/evidence/import/data'

export default async function EvidenceImportBatchReviewPage({ params }: { params: Promise<{ id: string; batchId: string }> }) {
  const { id, batchId } = await params
  const { session, batch, captureItems, timeZone } = await getEvidenceImportBatchDetail(id, batchId)
  return <main className="page-shell dashboard-shell">
    <div className="section-header page-header"><div><Link href={`/dashboard/sessions/${session.id}/evidence/import`} className="secondary-link touch-target">← Import files</Link><h1>Import batch review</h1><p className="muted">{session.title}</p><Link href={`/dashboard/sessions/${session.id}/evidence/review`} className="button button-secondary touch-target">Open Advanced Review</Link></div></div>
    <EvidenceImportBatchReview sessionId={session.id} batch={batch} captureItems={captureItems} timeZone={timeZone} />
  </main>
}
