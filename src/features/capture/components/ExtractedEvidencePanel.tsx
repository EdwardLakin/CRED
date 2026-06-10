import type { Json } from '@/lib/supabase/database.types'

import type { CaptureItem } from '../types'

const FIELD_LABELS: Record<string, string> = {
  vin: 'VIN',
  unit_number: 'Unit Number',
  asset_label: 'Asset Label',
  odometer: 'Odometer',
  hour_meter: 'Hour Meter',
  plate_number: 'Licence Plate',
  work_order_number: 'Work Order #',
  customer_name: 'Customer',
  registration_number: 'Registration #',
  registered_owner: 'Registered Owner',
  manufacturer: 'Manufacturer',
  model: 'Model',
  serial_number: 'Serial #',
  gvwr: 'GVWR',
  gawr_front: 'GAWR Front',
  gawr_rear: 'GAWR Rear',
  tire_size: 'Tire Size',
  tire_pressure: 'Tire Pressure',
  document_type: 'Document Type',
  inspection_date: 'Inspection Date',
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

const APPLIABLE_SESSION_FIELDS = new Set(['asset_label', 'vin', 'odometer', 'unit_number', 'customer_name'])

type EvidenceFieldRow = {
  field: string
  label: string
  value: string
  canApply: boolean
}

type EvidenceCapture = {
  id: string
  capturedAt: string | null
  sourceLabel: string
  confidence: string | null
  summary: string | null
  notes: string[]
  sourceUrl: string | null
  storagePath: string
  fields: EvidenceFieldRow[]
}

function isRecord(value: Json | null | undefined): value is { [key: string]: Json | undefined } {
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

function formatConfidence(value: Json | undefined) {
  const confidence = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(confidence)) {
    return null
  }

  return `${Math.round(Math.min(1, Math.max(0, confidence)) * 100)}% confidence`
}

function titleCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function getFieldLabel(field: string) {
  return FIELD_LABELS[field] ?? titleCase(field)
}

function getSourceLabel(extractedData: Json | null) {
  if (!isRecord(extractedData)) {
    return 'Capture'
  }

  const classification = isRecord(extractedData.classification) ? extractedData.classification : null
  const label = typeof classification?.label === 'string' && classification.label.trim() ? classification.label.trim() : null
  const detectedType = typeof classification?.detected_type === 'string' && classification.detected_type.trim() ? classification.detected_type.trim() : null

  return label ?? (detectedType ? DETECTED_TYPE_LABELS[detectedType] ?? titleCase(detectedType) : 'Capture')
}

function getText(value: Json | undefined, maxLength = 400) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function formatFieldValue(value: Json | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'string') {
    return getText(value, 600)
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (Array.isArray(value)) {
    const values = value.map((item) => formatFieldValue(item)).filter((item): item is string => Boolean(item))
    return values.length > 0 ? values.join(', ') : null
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
      .map(([key, entryValue]) => {
        const formatted = formatFieldValue(entryValue)
        return formatted ? `${getFieldLabel(key)}: ${formatted}` : null
      })
      .filter((entry): entry is string => Boolean(entry))

    return entries.length > 0 ? entries.join('; ') : null
  }

  return null
}

function getNotes(value: Json | undefined) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((note) => formatFieldValue(note)).filter((note): note is string => Boolean(note)).slice(0, 6)
}

function getEvidenceCapture(capture: CaptureItem, signedUrl: string | undefined): EvidenceCapture | null {
  const extractedData = isRecord(capture.extracted_data) ? capture.extracted_data : null
  const extraction = extractedData && isRecord(extractedData.extraction) ? extractedData.extraction : null

  if (!extraction) {
    return null
  }

  const fields = isRecord(extraction.fields) ? extraction.fields : null

  if (!fields) {
    return null
  }

  const fieldRows = Object.entries(fields)
    .map(([field, value]) => {
      const formattedValue = formatFieldValue(value)

      if (!formattedValue) {
        return null
      }

      return {
        field,
        label: getFieldLabel(field),
        value: formattedValue,
        canApply: APPLIABLE_SESSION_FIELDS.has(field),
      }
    })
    .filter((row): row is EvidenceFieldRow => Boolean(row))

  if (fieldRows.length === 0) {
    return null
  }

  return {
    id: capture.id,
    capturedAt: capture.captured_at ?? capture.created_at,
    sourceLabel: getSourceLabel(capture.extracted_data),
    confidence: formatConfidence(extraction.confidence),
    summary: getText(extraction.summary, 260),
    notes: getNotes(extraction.notes),
    sourceUrl: signedUrl ?? null,
    storagePath: capture.storage_path,
    fields: fieldRows,
  }
}

export function ExtractedEvidencePanel({
  captures,
  signedUrls,
}: {
  captures: CaptureItem[]
  signedUrls: Record<string, string>
}) {
  const evidenceCaptures = captures
    .map((capture) => getEvidenceCapture(capture, signedUrls[capture.id]))
    .filter((capture): capture is EvidenceCapture => Boolean(capture))

  return (
    <section className="card detail-card extracted-evidence-card form-stack">
      <div>
        <h2>Extracted Evidence</h2>
        <p className="muted">Extracted Evidence is for review. Apply trusted values to Session Details below.</p>
      </div>

      {evidenceCaptures.length === 0 ? (
        <div className="empty-state extracted-evidence-empty-state">
          No extracted evidence yet. Classify captures, then extract details to review values from VIN plates,
          registrations, work orders, and info tags.
        </div>
      ) : (
        <div className="extracted-evidence-list">
          {evidenceCaptures.map((capture) => (
            <article key={capture.id} className="extracted-evidence-item">
              <div className="extracted-evidence-header">
                <div>
                  <span className="classification-pill evidence-source-pill">From {capture.sourceLabel}</span>
                  <p className="muted evidence-captured-at">Captured {formatDateTime(capture.capturedAt)}</p>
                </div>
                {capture.confidence ? <span className="evidence-confidence">{capture.confidence}</span> : null}
              </div>

              {capture.summary ? <p className="capture-summary evidence-summary">{capture.summary}</p> : null}

              <div className="evidence-field-list">
                {capture.fields.map((field) => (
                  <div key={field.field} className="evidence-field-row">
                    <span className="evidence-field-label">{field.label}</span>
                    <span className="evidence-field-value">{field.value}</span>
                    {field.canApply ? <span className="can-apply-badge">Can apply to Session Details</span> : null}
                  </div>
                ))}
              </div>

              {capture.notes.length > 0 ? (
                <div className="evidence-notes">
                  <strong>Notes</strong>
                  <ul>
                    {capture.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {capture.sourceUrl ? (
                <a href={capture.sourceUrl} target="_blank" rel="noreferrer" className="secondary-link capture-file-link touch-target">
                  Open source file
                </a>
              ) : (
                <p className="muted capture-storage-path">Stored at {capture.storagePath}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
