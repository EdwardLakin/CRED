import type { CaptureItem } from '../types'
import { CAPTURE_TYPE_LABELS, getCaptureProcessingLabel, getCaptureProcessingStatus, getSourceDocumentMetadata, type CaptureType } from '../types'
import { formatDateTime } from '@/features/sessions'

function getCaptureLabel(capture: CaptureItem) {
  const sourceDocument = getSourceDocumentMetadata(capture.extracted_data)
  const note = capture.technician_note?.trim() || capture.transcript?.trim()
  return note || sourceDocument?.label || CAPTURE_TYPE_LABELS[capture.type as CaptureType] || 'Captured evidence'
}


function getCaptureStatusVariant(status: string) {
  if (status === 'failed' || status === 'blocked_by_limit') return 'danger'
  if (status === 'needs_review') return 'attention'
  if (status === 'processing' || status === 'ready_for_review') return 'info'
  if (status === 'extracted') return 'success'
  return 'neutral'
}

function getCaptureMeta(capture: CaptureItem) {
  const sourceDocument = getSourceDocumentMetadata(capture.extracted_data)
  const typeLabel = CAPTURE_TYPE_LABELS[capture.type as CaptureType] ?? capture.type

  return sourceDocument
    ? `Source Document: ${sourceDocument.label} · ${typeLabel}`
    : typeLabel
}

export function RecentCapturesList({ captures, signedUrls, limit = 6 }: { captures: CaptureItem[]; signedUrls: Record<string, string>; limit?: number }) {
  const recentCaptures = captures.filter((capture) => !capture.deleted_at).slice(0, limit)

  if (recentCaptures.length === 0) {
    return <div className="empty-state capture-empty-state">No captures yet. Use the large Capture Evidence button to add photos, videos, or voice-noted evidence.</div>
  }

  return (
    <div className="recent-capture-list">
      {recentCaptures.map((capture) => (
        <article key={capture.id} className="recent-capture-card">
          <div>
            <h3>{getCaptureLabel(capture)}</h3>
            <p className="muted">{getCaptureMeta(capture)} · {formatDateTime(capture.captured_at ?? capture.created_at)}</p>
          </div>
          <div className="capture-card-actions">
            <span className={`ai-status-pill ${getCaptureStatusVariant(getCaptureProcessingStatus(capture))}`}>
              {getCaptureProcessingLabel(getCaptureProcessingStatus(capture))}
            </span>
            {signedUrls[capture.id] ? (
              <a href={signedUrls[capture.id]} target="_blank" rel="noreferrer" className="secondary-link touch-target">
                Open
              </a>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  )
}
