import Link from 'next/link'
import { EvidenceImportBatchDetail } from '@/features/evidence/import/components/EvidenceImportBatchDetail'
import { getEvidenceImportBatchDetail } from '@/features/evidence/import/data'

export default async function EvidenceImportBatchDetailPage({ params }: { params: Promise<{ id: string; batchId: string }> }) {
  const { id, batchId } = await params
  const { session, batch, captureItems, timeZone } = await getEvidenceImportBatchDetail(id, batchId)
  return <main className="page-shell dashboard-shell">
    <div className="section-header page-header"><div><Link href={`/dashboard/sessions/${session.id}/evidence/import`} className="secondary-link touch-target">← Import evidence</Link><h1>Import batch detail</h1><p className="muted">{session.title}</p></div></div>
    <EvidenceImportBatchDetail sessionId={session.id} batch={batch} captureItems={captureItems} timeZone={timeZone} />
  </main>
}
