import Link from 'next/link'
import { formatDateTime } from '@/features/sessions'
import type { EvidenceImportBatch, EvidenceImportCaptureItem } from '../data'

export function EvidenceImportBatchDetail({ sessionId, batch, captureItems, timeZone }: { sessionId: string; batch: EvidenceImportBatch; captureItems: EvidenceImportCaptureItem[]; timeZone: string | null }) {
  return <section className="card detail-card form-stack">
    <div className="section-header"><div><p className="eyebrow">Import batch</p><h2>{batch.status}</h2></div><Link className="button button-secondary" href={`/dashboard/sessions/${sessionId}/evidence`}>Evidence Library</Link></div>
    <dl className="metadata-list"><div><dt>Source kind</dt><dd>{batch.source_kind}</dd></div><div><dt>Processed</dt><dd>{batch.processed_count}/{batch.file_count}</dd></div><div><dt>Failed</dt><dd>{batch.failed_count}</dd></div><div><dt>Created</dt><dd>{formatDateTime(batch.created_at, timeZone)}</dd></div></dl>
    <h3>Imported evidence</h3>
    {captureItems.length === 0 ? <p className="muted">No evidence rows were created for this batch.</p> : <ul className="metadata-list">{captureItems.map((item) => <li key={item.id}><Link href={`/dashboard/sessions/${sessionId}/evidence/${item.id}`}>{item.original_filename ?? 'Evidence item'}</Link> · {item.source_kind} · {item.processing_status} · {item.evidence_review_status}</li>)}</ul>}
  </section>
}
