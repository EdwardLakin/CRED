import type { CaptureItem } from '../types'
import { CAPTURE_TYPE_LABELS, getCaptureProcessingLabel, getCaptureProcessingStatus, getSourceDocumentMetadata, type CaptureType } from '../types'
import { formatDateTime } from '@/features/sessions'
import { DeleteEvidenceButton } from '@/features/capture/components/DeleteEvidenceButton'
import { EVIDENCE_CATEGORY_LABELS, normalizeEvidenceCategory } from '@/features/capture/evidence-category'
import { EvidenceImageTrigger } from '@/features/reports/review/EvidenceImageLightbox'

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

  if (sourceDocument) return `Source Document: ${sourceDocument.label} · ${typeLabel}`
  if (capture.media_kind === 'note' || capture.type === 'text_note') return 'Text Note · No file upload'
  return typeLabel
}

export function RecentCapturesList({ captures, signedUrls, limit = 6, timeZone = null, imageAiAssistEnabled = true }: { captures: CaptureItem[]; signedUrls: Record<string, string>; limit?: number; timeZone?: string | null; imageAiAssistEnabled?: boolean }) {
  const recentCaptures = captures.filter((capture) => !capture.deleted_at).slice(0, limit)

  if (recentCaptures.length === 0) {
    return <div className="empty-state capture-empty-state">No captures yet. Use Camera or Gallery to add evidence.</div>
  }

  const lightboxItems = recentCaptures
    .filter((capture) => (capture.media_kind === 'image' || capture.type === 'photo') && signedUrls[capture.id])
    .map((capture) => ({
      id: capture.id,
      src: signedUrls[capture.id],
      title: getCaptureLabel(capture),
      note: capture.technician_note?.trim() || capture.transcript?.trim() || null,
    }))

  return (
    <div className="recent-capture-list">
      {recentCaptures.map((capture) => (
        <article key={capture.id} className="recent-capture-card" data-evidence-card>
          <div>
            <h3>{getCaptureLabel(capture)}</h3>
            <p className="muted">{getCaptureMeta(capture)} · {formatDateTime(capture.captured_at ?? capture.created_at, timeZone)}</p>
            <span className="classification-pill success">{EVIDENCE_CATEGORY_LABELS[normalizeEvidenceCategory(capture.evidence_category)]}</span>
          </div>
          {(capture.media_kind === 'image' || capture.type === 'photo') && signedUrls[capture.id] ? (
            <div className="recent-capture-thumb downloadable-evidence-preview">
              <EvidenceImageTrigger items={lightboxItems} currentId={capture.id} imageClassName="pdf-safe-image" />
            </div>
          ) : null}
          <div className="capture-card-actions">
            <span className={`ai-status-pill ${getCaptureStatusVariant(getCaptureProcessingStatus(capture))}`}>
              {getCaptureProcessingLabel(getCaptureProcessingStatus(capture), imageAiAssistEnabled)}
            </span>
            {signedUrls[capture.id] ? (
              <a href={signedUrls[capture.id]} target="_blank" rel="noreferrer" className="secondary-link touch-target">
                Open
              </a>
            ) : null}
            {signedUrls[capture.id] ? (
              <a href={`/api/dashboard/sessions/${capture.documentation_session_id}/evidence/${capture.id}/media?download=1`} download aria-label={`Download original ${getCaptureLabel(capture)}`} className="secondary-link touch-target icon-download-link">
                ⬇<span className="sr-only">Download original</span>
              </a>
            ) : null}
            <DeleteEvidenceButton captureId={capture.id} />
          </div>
        </article>
      ))}
    </div>
  )
}
