'use client'

import { useActionState, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { removeCaptureItem, updateCaptureReview } from '@/features/capture/actions'
import type { Json } from '@/lib/supabase/database.types'

import {
  CAPTURE_TYPE_LABELS,
  getCaptureProcessingLabel,
  getCaptureProcessingStatus,
  getSourceDocumentMetadata,
  type CaptureItem,
  type CaptureType,
} from '../types'

function isRecord(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatDateTime(value: string | null) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

const DETECTED_TYPE_LABELS: Record<string, string> = {
  registration: 'Registration',
  vin_plate: 'VIN Plate',
  license_plate: 'License Plate',
  unit_number: 'Unit Number',
  inspection_sheet: 'Inspection Sheet',
  work_order: 'Work Order',
  odometer: 'Odometer',
  hour_meter: 'Hour Meter',
  info_plate: 'Info Plate',
  brake_measurement: 'Brake Measurement',
  tire_tread_measurement: 'Tire Tread Measurement',
  battery_test: 'Battery Test',
  battery_condition: 'Battery Condition',
  fluid_level: 'Fluid Level',
  defect_photo: 'Defect Photo',
  general_evidence: 'General Evidence',
  supporting_photo: 'Supporting Photo',
  unknown: 'Unknown',
}

function formatDetectedType(value: string) {
  return DETECTED_TYPE_LABELS[value] ?? value.replace(/_/g, ' ')
}

function formatConfidence(value: Json | undefined) {
  const confidence = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(confidence) ? `${Math.round(Math.min(1, Math.max(0, confidence)) * 100)}%` : null
}

function getFieldText(value: Json | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function formatExtractedFields(fields: { [key: string]: Json | undefined }) {
  const labels: Array<[string, string]> = [
    ['component', 'Component'], ['location', 'Location'], ['measurement', 'Measurement'], ['condition', 'Condition'],
    ['recommendation', 'Recommendation'], ['severity', 'Severity'], ['vin', 'VIN'], ['unit_number', 'Unit'],
    ['asset_label', 'Asset'], ['odometer', 'Odometer'], ['hour_meter', 'Hours'], ['plate_number', 'Plate'],
    ['work_order_number', 'WO'], ['job_number', 'Job'], ['customer_name', 'Customer'], ['registration_number', 'Registration'],
    ['manufacturer', 'Manufacturer'], ['model', 'Model'], ['serial_number', 'Serial'], ['jurisdiction', 'Jurisdiction'],
  ]

  return labels
    .map(([field, label]) => {
      const value = getFieldText(fields[field])
      return value ? `${label}: ${value}` : null
    })
    .filter((value): value is string => Boolean(value))
    .slice(0, 5)
    .join(' · ')
}

function getClassificationSummary(extractedData: Json | null) {
  if (!extractedData || !isRecord(extractedData)) return { label: 'Needs classification', detectedType: null, status: 'pending', confidence: null }
  const classification = isRecord(extractedData.classification) ? extractedData.classification : null
  const detectedType = typeof classification?.detected_type === 'string' ? classification.detected_type : null
  const status = typeof classification?.status === 'string' ? classification.status : 'pending'
  if (detectedType) {
    const confidence = formatConfidence(classification?.confidence)
    return { label: `Detected: ${formatDetectedType(detectedType)}${confidence ? ` · ${confidence}` : ''}`, detectedType, status, confidence }
  }
  if (status === 'manual_document') return { label: 'Document selected manually', detectedType: 'document', status, confidence: null }
  if (status === 'manual_audio') return { label: 'Audio note selected manually', detectedType: 'voice_note', status, confidence: null }
  if (status === 'manual_text_note') return { label: 'Text note saved', detectedType: 'text_note', status, confidence: null }
  return { label: 'Needs classification', detectedType: null, status, confidence: null }
}


function getCaptureStatusVariant(status: string) {
  if (status === 'failed' || status === 'blocked_by_limit') return 'danger'
  if (status === 'needs_review') return 'attention'
  if (status === 'processing' || status === 'ready_for_review') return 'info'
  if (status === 'extracted') return 'success'
  return 'neutral'
}

function formatExtractedDataSummary(type: string, extractedData: Json | null) {
  const classification = getClassificationSummary(extractedData)
  if (!extractedData || !isRecord(extractedData)) return `${classification.label} · Extraction not started`
  const extraction = isRecord(extractedData.extraction) ? extractedData.extraction : null
  const extractionStatusRaw = typeof extraction?.status === 'string' ? extraction.status : null
  const extractionFields = extraction && isRecord(extraction.fields) ? extraction.fields : null
  const extractedFieldsSummary = extractionFields ? formatExtractedFields(extractionFields) : ''
  const extractionConfidence = formatConfidence(extraction?.confidence)

  if ((extractionStatusRaw === 'extracted' || extractionStatusRaw === 'needs_review') && extractedFieldsSummary) {
    return `${extractionStatusRaw === 'extracted' ? 'Extracted' : 'Needs review'}: ${extractedFieldsSummary}${extractionConfidence ? ` · ${extractionConfidence}` : ''}`
  }

  if (extractionStatusRaw === 'failed') return `Extraction failed${typeof extraction?.summary === 'string' ? `: ${extraction.summary}` : ''}`
  if (type === 'text_note') return 'Text note evidence · No media upload required'
  if (type === 'video') return `${classification.label} · Video still/thumbnail used for report output`
  return `${classification.label} · Extraction ${extractionStatusRaw?.replace(/_/g, ' ') ?? 'not started'}`
}

function SaveButton() {
  const { pending } = useFormStatus()
  return <button className="button button-primary touch-target" disabled={pending}>{pending ? 'Saving…' : 'Save review'}</button>
}

function MediaPreview({ note, capture, signedUrl }: { note: string; capture: CaptureItem; signedUrl?: string }) {
  const mediaKind = capture.media_kind || (capture.type === 'text_note' ? 'note' : capture.type === 'video' ? 'video' : capture.type === 'voice_note' ? 'audio' : capture.type === 'document' ? 'document' : 'image')

  return (
    <div className="evidence-media-frame">
      {mediaKind === 'note' ? (
        <div className="evidence-file-placeholder">Text note evidence</div>
      ) : signedUrl && mediaKind === 'video' ? (
        <video src={signedUrl} controls preload="metadata" className="evidence-media" />
      ) : signedUrl && mediaKind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signedUrl} alt="Captured evidence preview" className="evidence-media" />
      ) : signedUrl ? (
        <a href={signedUrl} target="_blank" rel="noreferrer" className="evidence-file-placeholder">Open {mediaKind} file</a>
      ) : (
        <div className="evidence-file-placeholder">Stored evidence</div>
      )}
      <div className="evidence-note-overlay" aria-label="Read-only note shown on report">
        <div className="evidence-note-overlay-header">
          <strong>Note shown on report</strong>
        </div>
        <span>{note}</span>
      </div>
    </div>
  )
}

function EvidenceCard({ capture, signedUrl }: { capture: CaptureItem; signedUrl?: string }) {
  const [state, formAction] = useActionState(updateCaptureReview, {})
  const initialNote = capture.technician_note ?? capture.transcript ?? ''
  const [note, setNote] = useState(initialNote)
  const [isEditing, setIsEditing] = useState(false)
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayNote = note.trim() || (capture.transcript_status === 'pending' ? 'Transcribing…' : 'Add note before finalizing')
  const focusNoteTextarea = () => {
    setIsEditing(true)
    window.setTimeout(() => {
      noteTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      noteTextareaRef.current?.focus({ preventScroll: true })
    }, 0)
  }
  const sourceDocument = getSourceDocumentMetadata(capture.extracted_data)
  const label = sourceDocument?.label ?? CAPTURE_TYPE_LABELS[capture.type as CaptureType] ?? capture.type
  const classification = getClassificationSummary(capture.extracted_data)
  const reportOrder = capture.report_order ? `Report order ${capture.report_order}` : 'Report order not set'
  const processingStatus = getCaptureProcessingStatus(capture)

  return (
    <article className="capture-list-item evidence-preview-card">
      <div className="capture-list-main">
        <div>
          <h3>{label}</h3>
          <p className="muted">Captured {formatDateTime(capture.captured_at ?? capture.created_at)}</p>
        </div>
        <span className={`ai-status-pill ${getCaptureStatusVariant(processingStatus)}`}>
          {getCaptureProcessingLabel(processingStatus)}
        </span>
      </div>

      <MediaPreview note={overlayNote} capture={capture} signedUrl={signedUrl} />

      <div className="capture-classification-row">
        {sourceDocument ? (
          <span className="classification-pill pending">
            Source Document: {sourceDocument.label}
          </span>
        ) : null}
        <span className={capture.ai_status === 'needs_review' ? 'classification-pill attention' : classification.detectedType ? 'classification-pill success' : 'classification-pill pending'}>{classification.label}</span>
        <span className="classification-pill pending">{capture.include_in_report ? 'Included in report' : 'Excluded from report'}</span>
        <span className="classification-pill pending">{reportOrder}</span>
      </div>
      <p className="capture-summary">{formatExtractedDataSummary(capture.type, capture.extracted_data)}</p>

      <div className="capture-compact-actions">
        <button
          type="button"
          className="secondary-link"
          onClick={() => {
            if (isEditing) {
              setIsEditing(false)
              return
            }

            focusNoteTextarea()
          }}
        >
          {isEditing ? 'Hide edit' : 'Edit'}
        </button>
        <form action={removeCaptureItem}>
          <input type="hidden" name="capture_id" value={capture.id} />
          <button className="secondary-link danger-link" type="submit">Remove</button>
        </form>
        {signedUrl ? <a href={signedUrl} target="_blank" rel="noreferrer" className="secondary-link capture-file-link touch-target">Open file</a> : null}
      </div>

      {isEditing ? (
        <form action={formAction} className="capture-review-form form-stack">
          <input type="hidden" name="capture_id" value={capture.id} />
          <div className="field-stack report-note-editor">
            <label htmlFor={`technician-note-${capture.id}`} className="label">Edit note shown on report</label>
            <textarea
              ref={noteTextareaRef}
              id={`technician-note-${capture.id}`}
              name="technician_note"
              className="input note-textarea prominent-note-textarea"
              value={note}
              placeholder={capture.transcript_status === 'pending' ? 'Transcribing…' : 'Type the technician note for this evidence'}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
            />
            <p className="muted note-helper-text">Changes update the note overlay and printable report.</p>
          </div>
          <div className="capture-review-controls">
            <label className="checkbox-row"><input type="checkbox" name="include_in_report" defaultChecked={capture.include_in_report} /> Include in report</label>
            <label className="report-order-field">Order <input type="number" name="report_order" className="input" min={1} defaultValue={capture.report_order ?? ''} /></label>
          </div>
          <div className="capture-card-actions">
            <SaveButton />
            {state.message ? <span className={state.ok ? 'success' : 'error'}>{state.message}</span> : null}
          </div>
        </form>
      ) : null}
    </article>
  )
}

export function CaptureList({ captures, signedUrls }: { captures: CaptureItem[]; signedUrls: Record<string, string> }) {
  const visibleCaptures = captures.filter((capture) => !capture.deleted_at)

  if (visibleCaptures.length === 0) {
    return <div className="empty-state capture-empty-state">No captures yet. Tap Capture Evidence to add photo/video evidence with a reviewable note.</div>
  }

  return <div className="capture-list evidence-feed">{visibleCaptures.map((capture) => <EvidenceCard key={capture.id} capture={capture} signedUrl={signedUrls[capture.id]} />)}</div>
}
