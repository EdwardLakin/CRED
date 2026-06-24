import Link from 'next/link'
import { EvidenceWorkspaceBacklinks } from '@/features/evidence/components/EvidenceWorkspaceNav'

import { EvidenceImportBatchSummary, EvidenceLibraryList } from '@/features/evidence/components/EvidenceLibraryList'
import { getEvidenceLibraryData } from '@/features/evidence/library/data'
import { requireSessionWorkspace } from '@/features/sessions/data'

export default async function EvidenceLibraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const workspace = await requireSessionWorkspace()
  const { session, evidenceItems, importBatches, signedUrls, timeZone } = await getEvidenceLibraryData(id, workspace)

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <Link href={`/dashboard/sessions/${session.id}`} className="secondary-link touch-target">← Session</Link>
          <h1>Evidence Library</h1>
          <div className="evidence-library-header-actions">
            <Link
              href={`/dashboard/sessions/${session.id}/evidence/import`}
              className="button button-primary touch-target"
            >
              Import evidence
            </Link>
            <Link
              href={`/dashboard/sessions/${session.id}/report`}
              className="button button-secondary touch-target"
            >
              Open report
            </Link>
          </div>
          <p className="muted">{session.title} · {evidenceItems.length} items</p>
        </div>
      </div>
      <EvidenceWorkspaceBacklinks
        accessSubject={workspace.profile}
        sessionId={session.id}
        current="library"
        hideReport
      />
      <EvidenceLibraryList sessionId={session.id} items={evidenceItems} importBatches={importBatches} signedUrls={signedUrls} timeZone={timeZone} />
      <EvidenceImportBatchSummary sessionId={session.id} importBatches={importBatches} timeZone={timeZone} />
    </main>
  )
}
