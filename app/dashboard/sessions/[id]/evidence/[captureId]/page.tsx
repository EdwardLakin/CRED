import Link from 'next/link'

import { EvidenceDetail } from '@/features/evidence/components/EvidenceDetail'
import { getEvidenceDetailData } from '@/features/evidence/library/data'

export default async function EvidenceDetailsPage({ params }: { params: Promise<{ id: string; captureId: string }> }) {
  const { id, captureId } = await params
  const { session, evidenceItem, evidenceItems, relatedImportBatch, signedUrls, timeZone, profile } = await getEvidenceDetailData(id, captureId)

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <Link href={`/dashboard/sessions/${session.id}/evidence`} className="secondary-link touch-target">← Evidence Library</Link>
          <h1>Evidence Details</h1>
          <p className="muted">{evidenceItem.original_filename || evidenceItem.technician_note || evidenceItem.id}</p>
        </div>
      </div>
      <EvidenceDetail item={evidenceItem} allItems={evidenceItems} relatedImportBatch={relatedImportBatch} signedUrl={signedUrls[evidenceItem.id]} timeZone={timeZone} accessSubject={profile as { plan?: string | null }} />
    </main>
  )
}
