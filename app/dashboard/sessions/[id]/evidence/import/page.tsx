import Link from 'next/link'
import { BulkEvidenceImportForm } from '@/features/evidence/import/components/BulkEvidenceImportForm'
import { EvidenceImportBatchCard } from '@/features/evidence/import/components/EvidenceImportBatchCard'
import { getEvidenceImportPageData } from '@/features/evidence/import/data'

export default async function BulkEvidenceImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, batches, timeZone } = await getEvidenceImportPageData(id)
  return <main className="page-shell dashboard-shell">
    <div className="section-header page-header"><div><Link href={`/dashboard/sessions/${session.id}/evidence`} className="secondary-link touch-target">← Evidence Library</Link><h1>Import evidence</h1><p className="muted">{session.title}</p></div></div>
    <BulkEvidenceImportForm sessionId={session.id} />
    <section className="form-stack"><h2>Recent import batches</h2>{batches.length === 0 ? <p className="muted">No bulk imports yet.</p> : batches.map((batch) => <EvidenceImportBatchCard key={batch.id} sessionId={session.id} batch={batch} timeZone={timeZone} />)}</section>
  </main>
}
