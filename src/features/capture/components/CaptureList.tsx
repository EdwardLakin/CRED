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

const DETECTED_TYPE_LABELS: Record<string, string> = {
  registration: 'Registration',
  vin_plate: 'VIN Plate',
  license_plate: 'Licence Plate',
  unit_number: 'Unit Number',
  inspection_sheet: 'Inspection Sheet',
  work_order: 'Work Order',
  odometer: 'Odometer',
  hour_meter: 'Hour Meter',
  info_plate: 'Info Plate',
  damage_or_defect: 'Damage or Defect',
  general_field_photo: 'General Field Photo',
  other_document: 'Other Document',
  unknown: 'Unknown',
}

function formatDetectedType(value: string) {
  return DETECTED_TYPE_LABELS[value] ?? value.replace(/_/g, ' ')
}

function formatConfidence(value: Json | undefined) {
  const confidence = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(confidence)) {
    return null
  }

  return `${Math.round(Math.min(1, Math.max(0, confidence)) * 100)}%`
}


function getFieldText(value: Json | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function formatExtractedFields(fields: { [key: string]: Json | undefined }) {
  const labels: Array<[string, string]> = [
    ['vin', 'VIN'],
    ['unit_number', 'Unit'],
    ['asset_label', 'Asset'],
    ['odometer', 'Odometer'],
    ['hour_meter', 'Hours'],
    ['plate_number', 'Plate'],
    ['work_order_number', 'WO'],
    ['customer_name', 'Customer'],
    ['registration_number', 'Registration'],
    ['manufacturer', 'Manufacturer'],
    ['model', 'Model'],
    ['serial_number', 'Serial'],
  ]

  return labels
    .map(([field, label]) => {
      const value = getFieldText(fields[field])
      return value ? `${label} ${value}` : null
    })
    .filter((value): value is string => Boolean(value))
    .slice(0, 4)
    .join(', ')
}

function getClassificationSummary(extractedData: Json | null) {
  if (!extractedData || !isRecord(extractedData)) {
    return { label: 'Needs classification', detectedType: null, status: 'pending', confidence: null }
  }

  const classification = isRecord(extractedData.classification) ? extractedData.classification : null
  const detectedType = typeof classification?.detected_type === 'string' ? classification.detected_type : null
  const status = typeof classification?.status === 'string' ? classification.status : 'pending'

  if (detectedType) {
    const confidence = formatConfidence(classification?.confidence)
    const confidenceLabel = confidence ? ` · ${confidence}` : ''
    return { label: `Detected: ${formatDetectedType(detectedType)}${confidenceLabel}`, detectedType, status, confidence }
  }

  if (status === 'manual_document') {
    return { label: 'Document selected manually', detectedType: 'document', status, confidence: null }
  }

  if (status === 'manual_audio') {
    return { label: 'Audio note selected manually', detectedType: 'voice_note', status, confidence: null }
  }

  return { label: 'Needs classification', detectedType: null, status, confidence: null }
}

function formatExtractedDataSummary(type: string, extractedData: Json | null) {
  const classification = getClassificationSummary(extractedData)

  if (!extractedData || !isRecord(extractedData)) {
    return `${classification.label} · Extraction not started`
  }

  const extraction = isRecord(extractedData.extraction) ? extractedData.extraction : null
  const extractionStatusRaw = typeof extraction?.status === 'string' ? extraction.status : null
  const extractionStatus = extractionStatusRaw?.replace(/_/g, ' ') ?? null
  const extractionFields = extraction && isRecord(extraction.fields) ? extraction.fields : null
  const extractedFieldsSummary = extractionFields ? formatExtractedFields(extractionFields) : ''
  const extractionConfidence = formatConfidence(extraction?.confidence)

  if (extractionStatusRaw === 'extracted' && extractedFieldsSummary) {
    return `Extracted: ${extractedFieldsSummary}${extractionConfidence ? ` · ${extractionConfidence}` : ''}`
  }

  if (extractionStatusRaw === 'needs_review') {
    return `Needs review${extractedFieldsSummary ? `: ${extractedFieldsSummary}` : ''}${extractionConfidence ? ` · ${extractionConfidence}` : ''}`
  }

  if (extractionStatusRaw === 'failed') {
    return `Extraction failed${typeof extraction?.summary === 'string' ? `: ${extraction.summary}` : ''}`
  }

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
              <span className={capture.ai_status === 'needs_review' ? 'ai-status-pill needs-review' : 'ai-status-pill'}>
                {capture.ai_status === 'needs_review' ? 'Needs review' : `AI ${formatAiStatus(capture.ai_status)}`}
              </span>
            </div>
            <div className="capture-classification-row">
              <span
                className={
                  capture.ai_status === 'needs_review'
                    ? 'classification-pill needs-review'
                    : classification.detectedType
                      ? 'classification-pill'
                      : 'classification-pill pending'
                }
              >
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
