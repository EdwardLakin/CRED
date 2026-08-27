import Link from 'next/link'
import { EVENT_DATE_PRECISIONS } from '@/features/evidence/constants'
import { updateBatchEvidenceEventDate, updateBatchEvidenceOutputInclusion, updateBatchEvidenceReviewStatus } from '../actions'
import type { EvidenceImportCaptureItem } from '../data'

function excerpt(item: EvidenceImportCaptureItem) { return (item.technician_note || item.ocr_text || item.ai_summary || '').slice(0, 180) }
function inputDate(value: string | null) { return value ? value.slice(0, 10) : '' }

export function EvidenceImportReviewItem({ sessionId, batchId, item }: { sessionId: string; batchId: string; item: EvidenceImportCaptureItem }) {
  const reviewAction = updateBatchEvidenceReviewStatus.bind(null, sessionId, batchId, item.id)
  const outputAction = updateBatchEvidenceOutputInclusion.bind(null, sessionId, batchId, item.id)
  const dateAction = updateBatchEvidenceEventDate.bind(null, sessionId, batchId, item.id)
  return <article className="card detail-card">
    <div className="section-header"><div><p className="eyebrow">{item.media_kind} · {item.mime_type ?? item.type}</p><h3>{item.original_filename ?? item.technician_note ?? 'Imported item'}</h3></div><div className="evidence-file-preview">{item.media_kind || 'file'}</div></div>
    <dl className="metadata-list"><div><dt>Processing status</dt><dd>{item.processing_status}</dd></div><div><dt>AI/OCR status</dt><dd>{item.ai_status ?? item.transcript_status}</dd></div><div><dt>Item review status</dt><dd>{item.evidence_review_status}</dd></div><div><dt>Include in outputs</dt><dd>{item.include_in_report ? 'Included' : 'Excluded'}</dd></div><div><dt>Source/event date</dt><dd>{item.event_date ?? item.source_created_at ?? item.captured_at} · {item.event_date_precision ?? 'not set'}</dd></div></dl>
    {excerpt(item) ? <p className="muted">{excerpt(item)}</p> : <p className="muted">No technician note or OCR excerpt is available yet.</p>}
    <div className="button-row"><form action={reviewAction}><input type="hidden" name="evidence_review_status" value="reviewed" /><button className="button" type="submit">Mark reviewed</button></form><form action={reviewAction}><input type="hidden" name="evidence_review_status" value="needs_followup" /><button className="button button-secondary" type="submit">Mark needs follow-up</button></form><form action={reviewAction}><input type="hidden" name="evidence_review_status" value="excluded" /><button className="button button-secondary" type="submit">Exclude from item review</button></form><form action={outputAction}><input type="hidden" name="include_in_report" value="true" /><button className="button button-secondary" type="submit">Include in outputs</button></form><form action={outputAction}><input type="hidden" name="include_in_report" value="false" /><button className="button button-secondary" type="submit">Exclude from outputs</button></form><Link className="button button-secondary" href={`/dashboard/sessions/${sessionId}/evidence/${item.id}`}>Open full item details</Link></div>
    <form action={dateAction} className="form-grid"><label>Event date<input className="input" type="date" name="event_date" defaultValue={inputDate(item.event_date)} /></label><label>Date precision<select className="select" name="event_date_precision" defaultValue={item.event_date_precision ?? ''}><option value="">Not set</option>{EVENT_DATE_PRECISIONS.map((precision) => <option key={precision} value={precision}>{precision}</option>)}</select></label><button className="button button-secondary" type="submit">Update event date / date precision</button></form>
  </article>
}
