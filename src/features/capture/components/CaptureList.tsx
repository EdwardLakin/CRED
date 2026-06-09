import type { Json } from '@/lib/supabase/database.types'

import { CAPTURE_TYPE_LABELS, type CaptureItem, type CaptureType } from '../types'

function isRecord(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not available'
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatAiStatus(status: string | null) {
  return status ? status.replace(/_/g, ' ') : 'not started'
}

function formatExtractedDataSummary(type: string, extractedData: Json | null) {
  if (!extractedData || !isRecord(extractedData)) {
    return 'No extracted data yet.'
  }

  const status = typeof extractedData.status === 'string' ? extractedData.status.replace(/_/g, ' ') : 'pending'

  if (type === 'vin_plate') {
    const vin = typeof extractedData.vin === 'string' && extractedData.vin ? extractedData.vin : 'pending OCR'
    return `VIN: ${vin} · Status: ${status}`
  }

  if (type === 'info_plate') {
    const fieldsData = extractedData.fields ?? null
    const fields = isRecord(fieldsData) ? Object.keys(fieldsData).length : 0
    return `Fields captured: ${fields} · Status: ${status}`
  }

  return `Status: ${status}`
}

export function CaptureList({
  captures,
  signedUrls,
}: {
  captures: CaptureItem[]
  signedUrls: Record<string, string>
}) {
  if (captures.length === 0) {
    return (
      <div className="empty-state capture-empty-state">
        No captures yet. Add a VIN plate, info/data plate, document, field photo, or voice note to begin the record.
      </div>
    )
  }

  return (
    <div className="capture-list">
      {captures.map((capture) => {
        const label = CAPTURE_TYPE_LABELS[capture.type as CaptureType] ?? capture.type
        const signedUrl = signedUrls[capture.id]

        return (
          <article key={capture.id} className="capture-list-item">
            <div className="capture-list-main">
              <div>
                <h3>{label}</h3>
                <p className="muted">Captured {formatDateTime(capture.captured_at ?? capture.created_at)}</p>
              </div>
              <span className="ai-status-pill">AI {formatAiStatus(capture.ai_status)}</span>
            </div>
            <p className="capture-summary">{formatExtractedDataSummary(capture.type, capture.extracted_data)}</p>
            {signedUrl ? (
              <a href={signedUrl} target="_blank" rel="noreferrer" className="secondary-link capture-file-link touch-target">
                Open file
              </a>
            ) : (
              <p className="muted capture-storage-path">Stored at {capture.storage_path}</p>
            )}
          </article>
        )
      })}
    </div>
  )
}
