import type { Json } from '@/lib/supabase/database.types'

import { CAPTURE_TYPE_LABELS, type CaptureItem, type CaptureType } from '../types'

function isRecord(value: Json | undefined): value is { [key: string]: Json | undefined } {
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

function formatDetectedType(value: string) {
  return value.replace(/_/g, ' ')
}

function getClassificationSummary(extractedData: Json | null) {
  if (!extractedData || !isRecord(extractedData)) {
    return { label: 'Needs classification', detectedType: null, status: 'pending' }
  }

  const classification = isRecord(extractedData.classification) ? extractedData.classification : null
  const detectedType = typeof classification?.detected_type === 'string' ? classification.detected_type : null
  const status = typeof classification?.status === 'string' ? classification.status : 'pending'

  if (detectedType) {
    return { label: `Detected: ${formatDetectedType(detectedType)}`, detectedType, status }
  }

  if (status === 'manual_document') {
    return { label: 'Document selected manually', detectedType: 'document', status }
  }

  if (status === 'manual_audio') {
    return { label: 'Audio note selected manually', detectedType: 'voice_note', status }
  }

  return { label: 'Needs classification', detectedType: null, status }
}

function formatExtractedDataSummary(type: string, extractedData: Json | null) {
  const classification = getClassificationSummary(extractedData)

  if (!extractedData || !isRecord(extractedData)) {
    return `${classification.label} · Extraction not started`
  }

  const extraction = isRecord(extractedData.extraction) ? extractedData.extraction : null
  const extractionStatus = typeof extraction?.status === 'string' ? extraction.status.replace(/_/g, ' ') : null

  if (classification.status === 'pending') {
    return `${classification.label} · Extraction ${extractionStatus ?? 'not started'}`
  }

  const legacyStatus = typeof extractedData.status === 'string' ? extractedData.status.replace(/_/g, ' ') : null

  if (type === 'vin_plate') {
    const vin = typeof extractedData.vin === 'string' && extractedData.vin ? extractedData.vin : 'pending OCR'
    return `VIN: ${vin} · Status: ${legacyStatus ?? classification.status.replace(/_/g, ' ')}`
  }

  if (type === 'info_plate') {
    const fieldsData = extractedData.fields ?? null
    const fields = isRecord(fieldsData) ? Object.keys(fieldsData).length : 0
    return `Fields captured: ${fields} · Status: ${legacyStatus ?? classification.status.replace(/_/g, ' ')}`
  }

  return `${classification.label} · Extraction ${extractionStatus ?? legacyStatus ?? 'not started'}`
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
        No captures yet. Tap Capture Evidence to add VIN labels, info plates, documents, damage, odometers, field
        photos, or audio notes to the record.
      </div>
    )
  }

  return (
    <div className="capture-list">
      {captures.map((capture) => {
        const label = CAPTURE_TYPE_LABELS[capture.type as CaptureType] ?? capture.type
        const signedUrl = signedUrls[capture.id]
        const classification = getClassificationSummary(capture.extracted_data)

        return (
          <article key={capture.id} className="capture-list-item">
            <div className="capture-list-main">
              <div>
                <h3>{label}</h3>
                <p className="muted">Captured {formatDateTime(capture.captured_at ?? capture.created_at)}</p>
              </div>
              <span className="ai-status-pill">AI {formatAiStatus(capture.ai_status)}</span>
            </div>
            <div className="capture-classification-row">
              <span className={classification.detectedType ? 'classification-pill' : 'classification-pill pending'}>
                {classification.label}
              </span>
              <button type="button" className="secondary-link correct-type-placeholder" disabled>
                Correct type (soon)
              </button>
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
