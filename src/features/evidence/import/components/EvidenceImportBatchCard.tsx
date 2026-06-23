import Link from 'next/link'
import { formatDateTime } from '@/features/sessions'
import type { EvidenceImportBatch } from '../data'

export function EvidenceImportBatchCard({ sessionId, batch, timeZone }: { sessionId: string; batch: EvidenceImportBatch; timeZone: string | null }) {
  return <article className="card detail-card">
    <div className="section-header"><div><p className="eyebrow">{batch.source_kind}</p><h3>{batch.status}</h3></div><Link className="secondary-link" href={`/dashboard/sessions/${sessionId}/evidence/import/${batch.id}`}>Review batch</Link></div>
    <dl className="metadata-list">
      <div><dt>Processed</dt><dd>{batch.processed_count}/{batch.file_count}</dd></div>
      <div><dt>Failed</dt><dd>{batch.failed_count}</dd></div>
      <div><dt>Created</dt><dd>{formatDateTime(batch.created_at, timeZone)}</dd></div>
    </dl>
  </article>
}
