import { clearEvidenceDuplicate, markEvidenceDuplicate, updateEvidenceOutputInclusion, updateEvidenceReviewStatus, updateEvidenceSourceDates, updateEvidenceSourceMetadata } from '@/features/evidence/library/actions'
import { EVIDENCE_REVIEW_STATUSES, EVENT_DATE_PRECISIONS } from '@/features/evidence/constants'
import type { EvidenceLibraryItem } from '@/features/evidence/library/data'

function inputDate(value: string | null) {
  return value ? value.slice(0, 10) : ''
}

export function EvidenceReviewForm({ item }: { item: EvidenceLibraryItem }) {
  return (
    <form action={updateEvidenceReviewStatus.bind(null, item.id)} className="inline-form">
      <label className="label" htmlFor={`review-${item.id}`}>Review status</label>
      <select id={`review-${item.id}`} name="evidence_review_status" className="select" defaultValue={item.evidence_review_status}>
        {EVIDENCE_REVIEW_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
      </select>
      <button className="button button-secondary">Save</button>
    </form>
  )
}

export function EvidenceInclusionForm({ item }: { item: EvidenceLibraryItem }) {
  return (
    <form action={updateEvidenceOutputInclusion.bind(null, item.id)} className="inline-form">
      <label className="checkbox-row"><input type="checkbox" name="include_in_report" defaultChecked={item.include_in_report} /> Include in outputs</label>
      <button className="button button-secondary">Save</button>
    </form>
  )
}

export function EvidenceDateForm({ item }: { item: EvidenceLibraryItem }) {
  return (
    <form action={updateEvidenceSourceDates.bind(null, item.id)} className="form-stack">
      <div className="form-grid two-columns">
        <label className="field-stack"><span className="label">Event date</span><input className="input" type="date" name="event_date" defaultValue={inputDate(item.event_date)} /></label>
        <label className="field-stack"><span className="label">Event date precision</span><select className="select" name="event_date_precision" defaultValue={item.event_date_precision ?? ''}><option value="">Not set</option>{EVENT_DATE_PRECISIONS.map((precision) => <option key={precision} value={precision}>{precision}</option>)}</select></label>
        <label className="field-stack"><span className="label">Source created</span><input className="input" type="date" name="source_created_at" defaultValue={inputDate(item.source_created_at)} /></label>
        <label className="field-stack"><span className="label">Source sent</span><input className="input" type="date" name="source_sent_at" defaultValue={inputDate(item.source_sent_at)} /></label>
        <label className="field-stack"><span className="label">Source received</span><input className="input" type="date" name="source_received_at" defaultValue={inputDate(item.source_received_at)} /></label>
      </div>
      <button className="button button-secondary">Save dates</button>
    </form>
  )
}

export function EvidenceMetadataForm({ item }: { item: EvidenceLibraryItem }) {
  return (
    <form action={updateEvidenceSourceMetadata.bind(null, item.id)} className="form-stack">
      <label className="field-stack"><span className="label">Source URI</span><input className="input" name="source_uri" defaultValue={item.source_uri ?? ''} /></label>
      <label className="field-stack"><span className="label">Source metadata JSON</span><textarea className="input" name="source_metadata" rows={5} defaultValue={JSON.stringify(item.source_metadata ?? {}, null, 2)} /></label>
      <button className="button button-secondary">Save metadata</button>
    </form>
  )
}

export function EvidenceDuplicateForm({ item, candidates }: { item: EvidenceLibraryItem; candidates: EvidenceLibraryItem[] }) {
  return (
    <div className="form-actions">
      <form action={markEvidenceDuplicate.bind(null, item.id)} className="inline-form">
        <select className="select" name="duplicate_of_capture_item_id" defaultValue={item.duplicate_of_capture_item_id ?? ''}>
          <option value="">Duplicate of unknown item</option>
          {candidates.filter((candidate) => candidate.id !== item.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.original_filename || candidate.technician_note || candidate.id}</option>)}
        </select>
        <button className="button button-secondary">Mark duplicate</button>
      </form>
      <form action={clearEvidenceDuplicate.bind(null, item.id)}><button className="button button-secondary">Clear duplicate</button></form>
    </div>
  )
}
