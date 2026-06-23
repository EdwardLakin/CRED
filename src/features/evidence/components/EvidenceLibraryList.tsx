import Link from 'next/link'

import { formatDateTime } from '@/features/sessions'
import type { EvidenceLibraryBatch, EvidenceLibraryItem } from '@/features/evidence/library/data'
import { EvidencePreview } from './EvidencePreview'
import { EvidenceInclusionForm, EvidenceReviewForm } from './EvidenceForms'

function fmt(value: string | null, timeZone: string | null) { return value ? formatDateTime(value, timeZone) : 'Not set' }

export function EvidenceLibraryList({ sessionId, items, importBatches, signedUrls, timeZone }: { sessionId: string; items: EvidenceLibraryItem[]; importBatches: EvidenceLibraryBatch[]; signedUrls: Record<string, string>; timeZone: string | null }) {
  if (items.length === 0) return <div className="empty-state">No evidence items yet.</div>
  const batchById = new Map(importBatches.map((batch) => [batch.id, batch]))
  return (
    <div className="evidence-library-grid">
      {items.map((item) => (
        <article key={item.id} className="card evidence-card">
          <EvidencePreview item={item} signedUrl={signedUrls[item.id]} />
          <div className="evidence-card-body">
            <h2><Link href={`/dashboard/sessions/${sessionId}/evidence/${item.id}`}>{item.original_filename || item.technician_note || 'Evidence item'}</Link></h2>
            <dl className="metadata-list">
              <div><dt>Media/source</dt><dd>{item.media_kind} · {item.source_kind}</dd></div>
              <div><dt>Processing/AI</dt><dd>{item.processing_status}{item.ai_status ? ` · ${item.ai_status}` : ''}</dd></div>
              <div><dt>Captured/imported</dt><dd>{fmt(item.captured_at ?? item.created_at, timeZone)}</dd></div>
              <div><dt>Source/event dates</dt><dd>Event: {fmt(item.event_date, timeZone)} · Created: {fmt(item.source_created_at, timeZone)}</dd></div>
              <div><dt>Duplicate status</dt><dd>{item.duplicate_status}{item.duplicate_of_capture_item_id ? ` of ${item.duplicate_of_capture_item_id}` : ''}</dd></div>
              {item.import_batch_id ? <div><dt>Import batch</dt><dd>{batchById.get(item.import_batch_id)?.status ?? item.import_batch_id}</dd></div> : null}
            </dl>
            <EvidenceReviewForm item={item} />
            <EvidenceInclusionForm item={item} />
          </div>
        </article>
      ))}
    </div>
  )
}

export function EvidenceImportBatchSummary({ sessionId, importBatches, timeZone }: { sessionId: string; importBatches: EvidenceLibraryBatch[]; timeZone: string | null }) {
  return (
    <section className="card detail-card form-stack">
      <div><p className="eyebrow">Import batches</p><h2>Related imports</h2></div>
      {importBatches.length === 0 ? <p className="muted">No import batches for this session.</p> : (
        <div className="metadata-list">{importBatches.map((batch) => <div key={batch.id}><dt>{batch.source_kind} · {batch.status}</dt><dd>{batch.processed_count}/{batch.file_count} processed · {batch.failed_count} failed · {fmt(batch.created_at, timeZone)} · <Link href={`/dashboard/sessions/${sessionId}/evidence/import/${batch.id}`}>Review batch</Link></dd></div>)}</div>
      )}
    </section>
  )
}
