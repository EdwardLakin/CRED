'use client'

import { useActionState, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'

import {
  removeCaptureItem,
  updateCaptureReview,
} from '@/features/capture/actions'
import { formatDateTimeInTimeZone } from '@/lib/date-format'
import type { Json } from '@/lib/supabase/database.types'

import {
  CAPTURE_TYPE_LABELS,
  getCaptureProcessingLabel,
  getCaptureProcessingStatus,
  getSourceDocumentMetadata,
  type CaptureItem,
  type CaptureType,
} from '../types'

function isRecord(
  value: Json | undefined,
): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatDateTime(value: string | null) {
  return formatDateTimeInTimeZone(value, null)
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
  battery_tester: 'Battery Tester',
  battery_test: 'Battery Test',
  multimeter: 'Multimeter',
  amp_clamp: 'Amp Clamp',
  oscilloscope: 'Oscilloscope',
  diagnostic_scan_report: 'Diagnostic Scan Report',
  battery_condition: 'Battery Condition',
  vehicle_component: 'Vehicle Component',
  corrosion: 'Corrosion',
  fluid_leak: 'Fluid Leak',
  fluid_level: 'Fluid Level',
  tire: 'Tire',
  brake_component: 'Brake Component',
  suspension_component: 'Suspension Component',
  defect_photo: 'Defect Photo',
  general_equipment_photo: 'General Equipment Photo',
  general_evidence: 'General Evidence',
  supporting_photo: 'Supporting Photo',
  unknown: 'Unknown',
}

function formatDetectedType(value: string) {
  return DETECTED_TYPE_LABELS[value] ?? value.replace(/_/g, ' ')
}

function getConfidencePercent(value: Json | undefined) {
  const confidence = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(confidence)
    ? Math.round(Math.min(1, Math.max(0, confidence)) * 100)
    : null
}

function formatConfidence(value: Json | undefined) {
  const percent = getConfidencePercent(value)
  return percent === null ? null : `${percent}%`
}

function getConfidenceVariant(percent: number | null) {
  if (percent === null) return 'pending'
  if (percent >= 95) return 'success'
  if (percent >= 80) return 'attention'
  return 'danger'
}

function getFieldText(value: Json | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function formatExtractedFields(fields: { [key: string]: Json | undefined }) {
  const labels: Array<[string, string]> = [
    ['component', 'Component'],
    ['location', 'Location'],
    ['measurement', 'Measurement'],
    ['condition', 'Condition'],
    ['recommendation', 'Recommendation'],
    ['severity', 'Severity'],
    ['vin', 'VIN'],
    ['unit_number', 'Unit'],
    ['asset_label', 'Asset'],
    ['odometer', 'Odometer'],
    ['hour_meter', 'Hours'],
    ['plate_number', 'Plate'],
    ['work_order_number', 'WO'],
    ['job_number', 'Job'],
    ['customer_name', 'Customer'],
    ['registration_number', 'Registration'],
    ['manufacturer', 'Manufacturer'],
    ['model', 'Model'],
    ['serial_number', 'Serial'],
    ['jurisdiction', 'Jurisdiction'],
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

function getCaptureAiAnalysis(capture: CaptureItem) {
  const direct = isRecord(capture.capture_ai_analysis)
    ? capture.capture_ai_analysis
    : null
  if (direct) return direct
  const extractedData = isRecord(capture.extracted_data)
    ? capture.extracted_data
    : null
  return extractedData && isRecord(extractedData.capture_ai_analysis)
    ? extractedData.capture_ai_analysis
    : null
}

function formatJsonForEdit(value: Json | undefined) {
  if (!value || !isRecord(value)) return '{}'
  return JSON.stringify(value, null, 2)
}

function getClassificationSummary(extractedData: Json | null) {
  if (!extractedData || !isRecord(extractedData))
    return {
      label: 'Processing evidence',
      detectedType: null,
      status: 'pending',
      confidence: null,
    }
  const classification = isRecord(extractedData.classification)
    ? extractedData.classification
    : null
  const detectedType =
    typeof classification?.detected_type === 'string'
      ? classification.detected_type
      : null
  const status =
    typeof classification?.status === 'string'
      ? classification.status
      : 'pending'
  if (detectedType) {
    const confidence = formatConfidence(classification?.confidence)
    return {
      label: `Evidence: ${formatDetectedType(detectedType)}${confidence ? ` · ${confidence}` : ''}`,
      detectedType,
      status,
      confidence,
    }
  }
  if (status === 'manual_document')
    return {
      label: 'Document selected manually',
      detectedType: 'document',
      status,
      confidence: null,
    }
  if (status === 'manual_audio')
    return {
      label: 'Audio note selected manually',
      detectedType: 'voice_note',
      status,
      confidence: null,
    }
  if (status === 'manual_text_note')
    return {
      label: 'Text note saved',
      detectedType: 'text_note',
      status,
      confidence: null,
    }
  return {
    label: 'Processing evidence',
    detectedType: null,
    status,
    confidence: null,
  }
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
  if (!extractedData || !isRecord(extractedData))
    return `${classification.label} · Report details not started`
  const extraction = isRecord(extractedData.extraction)
    ? extractedData.extraction
    : null
  const extractionStatusRaw =
    typeof extraction?.status === 'string' ? extraction.status : null
  const extractionFields =
    extraction && isRecord(extraction.fields) ? extraction.fields : null
  const extractedFieldsSummary = extractionFields
    ? formatExtractedFields(extractionFields)
    : ''
  const extractionConfidence = formatConfidence(extraction?.confidence)

  if (
    (extractionStatusRaw === 'extracted' ||
      extractionStatusRaw === 'needs_review') &&
    extractedFieldsSummary
  ) {
    return `${extractionStatusRaw === 'extracted' ? 'Extracted' : 'Needs review'}: ${extractedFieldsSummary}${extractionConfidence ? ` · ${extractionConfidence}` : ''}`
  }

  if (extractionStatusRaw === 'failed')
    return `Report detail processing failed${typeof extraction?.summary === 'string' ? `: ${extraction.summary}` : ''}`
  if (type === 'text_note')
    return 'Text note evidence · No media upload required'
  if (type === 'video')
    return `${classification.label} · Video still/thumbnail used for report output`
  return `${classification.label} · Report details ${extractionStatusRaw?.replace(/_/g, ' ') ?? 'not started'}`
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button className="button button-primary touch-target" disabled={pending}>
      {pending ? 'Saving…' : 'Save review'}
    </button>
  )
}

function MediaPreview({
  note,
  capture,
  signedUrl,
}: {
  note: string
  capture: CaptureItem
  signedUrl?: string
}) {
  const mediaKind =
    capture.media_kind ||
    (capture.type === 'text_note'
      ? 'note'
      : capture.type === 'video'
        ? 'video'
        : capture.type === 'voice_note'
          ? 'audio'
          : capture.type === 'document'
            ? 'document'
            : 'image')

  return (
    <div className="evidence-media-frame">
      {mediaKind === 'note' ? (
        <div className="evidence-file-placeholder">Text note evidence</div>
      ) : signedUrl && mediaKind === 'video' ? (
        <video
          src={signedUrl}
          controls
          preload="metadata"
          className="evidence-media"
        />
      ) : signedUrl && mediaKind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={signedUrl}
          alt="Captured evidence preview"
          className="evidence-media"
        />
      ) : signedUrl ? (
        <a
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          className="evidence-file-placeholder"
        >
          Open {mediaKind} file
        </a>
      ) : (
        <div className="evidence-file-placeholder">Stored evidence</div>
      )}
      <div
        className="evidence-note-overlay"
        aria-label="Read-only note shown on report"
      >
        <div className="evidence-note-overlay-header">
          <strong>Note shown on report</strong>
        </div>
        <span>{note}</span>
      </div>
    </div>
  )
}

function EvidenceCard({
  capture,
  signedUrl,
}: {
  capture: CaptureItem
  signedUrl?: string
}) {
  const [state, formAction] = useActionState(updateCaptureReview, {})
  const initialNote = capture.technician_note ?? capture.transcript ?? ''
  const [note, setNote] = useState(initialNote)
  const [isEditing, setIsEditing] = useState(false)
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayNote =
    note.trim() ||
    (capture.transcript_status === 'pending'
      ? 'Transcribing…'
      : 'Add note before finalizing')
  const focusNoteTextarea = () => {
    setIsEditing(true)
    window.setTimeout(() => {
      noteTextareaRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
      noteTextareaRef.current?.focus({ preventScroll: true })
    }, 0)
  }
  const sourceDocument = getSourceDocumentMetadata(capture.extracted_data)
  const label =
    sourceDocument?.label ??
    CAPTURE_TYPE_LABELS[capture.type as CaptureType] ??
    capture.type
  const classification = getClassificationSummary(capture.extracted_data)
  const reportOrder = capture.report_order
    ? `Report order ${capture.report_order}`
    : 'Report order not set'
  const processingStatus = getCaptureProcessingStatus(capture)

  return (
    <article className="capture-list-item evidence-preview-card">
      <div className="capture-list-main">
        <div>
          <h3>{label}</h3>
          <p className="muted">
            Captured {formatDateTime(capture.captured_at ?? capture.created_at)}
          </p>
        </div>
        <span
          className={`ai-status-pill ${getCaptureStatusVariant(processingStatus)}`}
        >
          {getCaptureProcessingLabel(processingStatus)}
        </span>
      </div>

      <MediaPreview
        note={overlayNote}
        capture={capture}
        signedUrl={signedUrl}
      />

      <div className="capture-classification-row">
        {sourceDocument ? (
          <span className="classification-pill pending">
            Source Document: {sourceDocument.label}
          </span>
        ) : null}
        <span
          className={
            capture.ai_status === 'needs_review'
              ? 'classification-pill attention'
              : classification.detectedType
                ? 'classification-pill success'
                : 'classification-pill pending'
          }
        >
          {classification.label}
        </span>
        <span className="classification-pill pending">
          {capture.include_in_report
            ? 'Included in report'
            : 'Excluded from report'}
        </span>
        <span className="classification-pill pending">{reportOrder}</span>
      </div>
      <p className="capture-summary">
        {formatExtractedDataSummary(capture.type, capture.extracted_data)}
      </p>

      {(() => {
        const analysis = getCaptureAiAnalysis(capture)
        if (!analysis) return null
        const percent = getConfidencePercent(analysis.confidence)
        const extractedValues = isRecord(analysis.extracted_values)
          ? analysis.extracted_values
          : {}
        const generatedNote =
          typeof analysis.generated_note === 'string'
            ? analysis.generated_note
            : null
        const extractedText =
          typeof analysis.extracted_text === 'string'
            ? analysis.extracted_text
            : null
        const disabled = analysis.suggestion_disabled === true
        return (
          <div className="ai-analysis-review-card">
            <div className="capture-classification-row">
              <span className="classification-pill pending">
                AI classification:{' '}
                {typeof analysis.classification === 'string'
                  ? formatDetectedType(analysis.classification)
                  : 'Pending'}
              </span>
              <span
                className={`classification-pill ${getConfidenceVariant(percent)}`}
              >
                Confidence: {percent === null ? 'Pending' : `${percent}%`}
              </span>
              {disabled ? (
                <span className="classification-pill danger">
                  AI suggestion disabled
                </span>
              ) : null}
              {percent !== null && percent < 80 ? (
                <span className="classification-pill danger">
                  Review requested
                </span>
              ) : null}
            </div>
            {Object.keys(extractedValues).length > 0 ? (
              <pre className="ai-extracted-values">
                {formatJsonForEdit(extractedValues)}
              </pre>
            ) : null}
            {generatedNote ? (
              <p className="capture-summary">
                <strong>AI note:</strong> {generatedNote}
              </p>
            ) : null}
            {extractedText ? (
              <details>
                <summary>Raw OCR text</summary>
                <p className="muted">{extractedText}</p>
              </details>
            ) : null}
          </div>
        )
      })()}

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
          <button className="secondary-link danger-link" type="submit">
            Remove
          </button>
        </form>
        {signedUrl ? (
          <a
            href={signedUrl}
            target="_blank"
            rel="noreferrer"
            className="secondary-link capture-file-link touch-target"
          >
            Open file
          </a>
        ) : null}
      </div>

      {isEditing ? (
        <form action={formAction} className="capture-review-form form-stack">
          <input type="hidden" name="capture_id" value={capture.id} />
          <div className="field-stack report-note-editor">
            <label htmlFor={`technician-note-${capture.id}`} className="label">
              Edit note shown on report
            </label>
            <textarea
              ref={noteTextareaRef}
              id={`technician-note-${capture.id}`}
              name="technician_note"
              className="input note-textarea prominent-note-textarea"
              value={note}
              placeholder={
                capture.transcript_status === 'pending'
                  ? 'Transcribing…'
                  : 'Type the technician note for this evidence'
              }
              onChange={(event) => setNote(event.target.value)}
              rows={4}
            />
            <p className="muted note-helper-text">
              Changes update the note overlay and printable report.
            </p>
          </div>
          {(() => {
            const analysis = getCaptureAiAnalysis(capture)
            const generatedNote =
              typeof analysis?.generated_note === 'string'
                ? analysis.generated_note
                : ''
            return analysis ? (
              <div className="field-stack">
                <label
                  className="label"
                  htmlFor={`ai-generated-note-${capture.id}`}
                >
                  AI generated note (editable, optional)
                </label>
                <textarea
                  id={`ai-generated-note-${capture.id}`}
                  name="ai_generated_note"
                  className="input note-textarea"
                  defaultValue={generatedNote}
                  rows={3}
                />
                <label
                  className="label"
                  htmlFor={`ai-extracted-values-${capture.id}`}
                >
                  Extracted readings JSON (editable)
                </label>
                <textarea
                  id={`ai-extracted-values-${capture.id}`}
                  name="ai_extracted_values"
                  className="input note-textarea"
                  defaultValue={formatJsonForEdit(
                    isRecord(analysis.extracted_values)
                      ? analysis.extracted_values
                      : {},
                  )}
                  rows={5}
                />
                <input type="hidden" name="ai_suggestion_enabled" value="off" />
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    name="ai_suggestion_enabled"
                    value="on"
                    defaultChecked={analysis.suggestion_disabled !== true}
                  />{' '}
                  Use AI suggestion for this capture
                </label>
              </div>
            ) : null
          })()}
          <div className="capture-review-controls">
            <label className="checkbox-row">
              <input
                type="checkbox"
                name="include_in_report"
                defaultChecked={capture.include_in_report}
              />{' '}
              Include in report
            </label>
            <label className="report-order-field">
              Order{' '}
              <input
                type="number"
                name="report_order"
                className="input"
                min={1}
                defaultValue={capture.report_order ?? ''}
              />
            </label>
          </div>
          <div className="capture-card-actions">
            <SaveButton />
            {state.message ? (
              <span className={state.ok ? 'success' : 'error'}>
                {state.message}
              </span>
            ) : null}
          </div>
        </form>
      ) : null}
    </article>
  )
}

export function CaptureList({
  captures,
  signedUrls,
}: {
  captures: CaptureItem[]
  signedUrls: Record<string, string>
}) {
  const visibleCaptures = captures.filter((capture) => !capture.deleted_at)

  if (visibleCaptures.length === 0) {
    return (
      <div className="empty-state capture-empty-state">
        No captures yet. Tap Capture Evidence to add photo/video evidence with a
        reviewable note.
      </div>
    )
  }

  return (
    <div className="capture-list evidence-feed">
      {visibleCaptures.map((capture) => (
        <EvidenceCard
          key={capture.id}
          capture={capture}
          signedUrl={signedUrls[capture.id]}
        />
      ))}
    </div>
  )
}
