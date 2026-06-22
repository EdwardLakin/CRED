import { formatDateTime } from '@/features/sessions'
import type { EvidenceLibraryBatch, EvidenceLibraryItem } from '@/features/evidence/library/data'
import { EvidenceDateForm, EvidenceDuplicateForm, EvidenceInclusionForm, EvidenceMetadataForm, EvidenceReviewForm } from './EvidenceForms'
import { EvidencePreview } from './EvidencePreview'

function show(value: string | null | undefined) { return value?.trim() || 'Not available' }
function fmt(value: string | null, timeZone: string | null) { return value ? formatDateTime(value, timeZone) : 'Not set' }

export function EvidenceDetail({ item, allItems, relatedImportBatch, signedUrl, timeZone }: { item: EvidenceLibraryItem; allItems: EvidenceLibraryItem[]; relatedImportBatch: EvidenceLibraryBatch | null; signedUrl?: string; timeZone: string | null }) {
  return (
    <div className="evidence-detail-layout">
      <section className="card detail-card form-stack">
        <EvidencePreview item={item} signedUrl={signedUrl} large />
        <dl className="metadata-list">
          <div><dt>Original filename</dt><dd>{item.original_filename ?? 'Not available'}</dd></div>
          <div><dt>Media/source kind</dt><dd>{item.media_kind} · {item.source_kind}</dd></div>
          <div><dt>Processing/AI status</dt><dd>{item.processing_status}{item.ai_status ? ` · ${item.ai_status}` : ''}</dd></div>
          <div><dt>Captured/imported</dt><dd>{fmt(item.captured_at ?? item.created_at, timeZone)}</dd></div>
          <div><dt>Event date</dt><dd>{fmt(item.event_date, timeZone)} · {item.event_date_precision ?? 'precision not set'}</dd></div>
          <div><dt>Source dates</dt><dd>Created {fmt(item.source_created_at, timeZone)} · Sent {fmt(item.source_sent_at, timeZone)} · Received {fmt(item.source_received_at, timeZone)}</dd></div>
          <div><dt>Duplicate status</dt><dd>{item.duplicate_status}{item.duplicate_of_capture_item_id ? ` of ${item.duplicate_of_capture_item_id}` : ''}</dd></div>
          <div><dt>Related import batch</dt><dd>{relatedImportBatch ? `${relatedImportBatch.source_kind} · ${relatedImportBatch.status}` : 'Not available'}</dd></div>
        </dl>
      </section>
      <section className="card detail-card form-stack"><h2>Evidence text</h2><h3>Note</h3><p>{show(item.technician_note)}</p><h3>Transcript</h3><p>{show(item.transcript)}</p><h3>OCR text</h3><pre className="text-block">{show(item.ocr_text)}</pre><h3>Extracted data</h3><pre className="text-block">{JSON.stringify(item.extracted_data ?? {}, null, 2)}</pre></section>
      <section className="card detail-card form-stack"><h2>Review and output</h2><EvidenceReviewForm item={item} /><EvidenceInclusionForm item={item} /><EvidenceDuplicateForm item={item} candidates={allItems} /></section>
      <section className="card detail-card form-stack"><h2>Evidence dates</h2><EvidenceDateForm item={item} /></section>
      <section className="card detail-card form-stack"><h2>Source metadata</h2><EvidenceMetadataForm item={item} /></section>
    </div>
  )
}
