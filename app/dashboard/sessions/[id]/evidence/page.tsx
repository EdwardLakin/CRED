import Link from 'next/link'
import { EvidenceWorkspaceBacklinks } from '@/features/evidence/components/EvidenceWorkspaceNav'

import { EvidenceImportBatchSummary, EvidenceLibraryList } from '@/features/evidence/components/EvidenceLibraryList'
import { getEvidenceLibraryData } from '@/features/evidence/library/data'

export default async function EvidenceLibraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, evidenceItems, importBatches, signedUrls, timeZone } = await getEvidenceLibraryData(id)

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <Link href={`/dashboard/sessions/${session.id}`} className="secondary-link touch-target">← Session</Link>
          <h1>Evidence Library</h1>
          <p className="muted">{session.title} · {evidenceItems.length} items</p>
        </div>
      </div>
      <EvidenceWorkspaceBacklinks sessionId={session.id} current="library" />
      <EvidenceLibraryList sessionId={session.id} items={evidenceItems} importBatches={importBatches} signedUrls={signedUrls} timeZone={timeZone} />
      <EvidenceImportBatchSummary importBatches={importBatches} timeZone={timeZone} />
    </main>
  )
}
