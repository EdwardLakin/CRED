'use client'

import { useActionState, useMemo, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui'
import { createCapture, type CaptureActionState } from '@/features/capture/actions'
import { MANUAL_CAPTURE_TYPES, type CaptureIntent, type CaptureType } from '@/features/capture/types'

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024
const FILE_TOO_LARGE_MESSAGE = 'That file is too large. Please upload an image under 15MB.'
const MAX_BATCH_FILES = 10
const INITIAL_CAPTURE_STATE: CaptureActionState = {}

const FILE_INPUT_CONFIG: Record<CaptureType, { accept: string; capture?: 'environment' }> = {
  photo: { accept: 'image/*', capture: 'environment' },
  vin_plate: { accept: 'image/*', capture: 'environment' },
  info_plate: { accept: 'image/*', capture: 'environment' },
  document: { accept: 'application/pdf,image/*' },
  voice_note: { accept: 'audio/*' },
}

function SubmitButton({ label = 'Upload selected file' }: { label?: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="button button-secondary touch-target" disabled={pending}>
      {pending ? 'Uploading…' : label}
    </Button>
  )
}

function getSuggestedCaptureText(sessionType?: string | null) {
  const normalizedSessionType = sessionType?.toLowerCase() ?? ''

  if (
    normalizedSessionType.includes('cvip') ||
    (normalizedSessionType.includes('commercial') && normalizedSessionType.includes('inspection'))
  ) {
    return 'Suggested: registration, VIN plate, licence plate, unit number, inspection sheet.'
  }

  if (normalizedSessionType.includes('inspection')) {
    return 'Suggested: VIN plate, info/data plate, odometer/hour meter, work order, concern area, supporting photos.'
  }

  return 'Suggested: VIN plate, documents, asset labels, field photos, supporting evidence.'
}

export function AddCaptureForm({
  sessionId,
  sessionType,
  guidedStep,
  guidedLabel,
  workflow,
  returnPath,
  captureButtonLabel = 'Capture Evidence',
}: {
  sessionId: string
  sessionType?: string | null
  guidedStep?: string
  guidedLabel?: string
  workflow?: string
  returnPath?: string
  captureButtonLabel?: string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [state, formAction] = useActionState(createCapture, INITIAL_CAPTURE_STATE)
  const [clientError, setClientError] = useState<string | null>(null)
  const [captureIntent, setCaptureIntent] = useState<CaptureIntent>('auto_image')
  const [manualType, setManualType] = useState<CaptureType>('document')
  const activeType = captureIntent === 'auto_image' ? 'photo' : manualType
  const fileConfig = useMemo(() => FILE_INPUT_CONFIG[activeType], [activeType])
  const suggestedCaptureText = useMemo(() => getSuggestedCaptureText(sessionType), [sessionType])
  const guidanceKey = guidedStep ? `${workflow ?? 'guided'}-${guidedStep}` : 'general'
  const fileInputId = `capture-file-${guidanceKey}`
  const supportsMultipleFiles = captureIntent === 'auto_image'

  function submitAfterFileSelection() {
    const files = Array.from(fileInputRef.current?.files ?? [])

    if (files.length === 0) {
      return
    }

    if (files.length > MAX_BATCH_FILES) {
      setClientError(`Upload up to ${MAX_BATCH_FILES} files at a time.`)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    if (files.some((file) => file.size > MAX_FILE_SIZE_BYTES)) {
      setClientError(FILE_TOO_LARGE_MESSAGE)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    setClientError(null)

    if (supportsMultipleFiles || files.length === 1) {
      window.setTimeout(() => formRef.current?.requestSubmit(), 0)
    }
  }

  function openAutoImagePicker() {
    setCaptureIntent('auto_image')
    window.setTimeout(() => fileInputRef.current?.click(), 0)
  }

  return (
    <form ref={formRef} action={formAction} className="capture-form form-stack">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="capture_intent" value={captureIntent} />
      <input type="hidden" name="manual_type" value={manualType} />
      {guidedStep ? <input type="hidden" name="guided_step" value={guidedStep} /> : null}
      {guidedLabel ? <input type="hidden" name="guided_label" value={guidedLabel} /> : null}
      {workflow ? <input type="hidden" name="session_workflow" value={workflow} /> : null}
      {returnPath ? <input type="hidden" name="return_path" value={returnPath} /> : null}

      {clientError || state.error ? <p className="error">{clientError ?? state.error}</p> : null}

      <div className="camera-first-panel">
        <button type="button" className="capture-evidence-button touch-target" onClick={openAutoImagePicker}>
          <span className="capture-evidence-icon" aria-hidden="true">
            📷
          </span>
          <span>
            <strong>{captureButtonLabel}</strong>
            <small>Open the camera or photo picker</small>
          </span>
        </button>
        <p className="muted capture-helper-text">
          Take or select multiple photos. CRED will save each item separately and organize them automatically.
        </p>
        <p className="muted capture-upload-hint">
          Common captures: registration, VIN plate, unit number, licence plate, inspection sheet, work order, odometer,
          info/data plate, defects.
        </p>
        <p className="muted capture-upload-hint">{suggestedCaptureText}</p>
      </div>

      <div className="field-stack capture-file-field">
        <label htmlFor={fileInputId} className="label visually-hidden">
          {captureIntent === 'auto_image' ? 'Capture evidence image' : 'Upload selected capture file'}
        </label>
        <input
          ref={fileInputRef}
          key={`${captureIntent}-${activeType}`}
          id={fileInputId}
          name="files"
          type="file"
          accept={fileConfig.accept}
          capture={fileConfig.capture}
          multiple={supportsMultipleFiles}
          required
          className="input file-input camera-file-input"
          onChange={submitAfterFileSelection}
        />
        <p className="muted capture-upload-hint">
          Maximum file size is 15MB per file. Images are queued for AI classification.
        </p>
      </div>

      <details className="advanced-capture-options">
        <summary>Advanced options</summary>
        <div className="advanced-capture-content form-stack">
          <div className="advanced-capture-actions" aria-label="Manual upload options">
            <button
              type="button"
              className="button button-secondary touch-target"
              onClick={() => {
                setCaptureIntent('manual')
                setManualType('document')
              }}
            >
              Upload Document
            </button>
            <button
              type="button"
              className="button button-secondary touch-target"
              onClick={() => {
                setCaptureIntent('manual')
                setManualType('voice_note')
              }}
            >
              Upload Audio Note
            </button>
          </div>

          <div className="field-stack">
            <label htmlFor="manual-capture-type" className="label">
              Manually choose capture type
            </label>
            <select
              id="manual-capture-type"
              className="select"
              value={manualType}
              onChange={(event) => {
                setCaptureIntent('manual')
                setManualType(event.target.value as CaptureType)
              }}
            >
              {MANUAL_CAPTURE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label} — {type.helper}
                </option>
              ))}
            </select>
            <p className="muted capture-upload-hint">
              Manual selection is optional. Field users can leave this alone and use Capture Evidence.
            </p>
          </div>

          <SubmitButton />
        </div>
      </details>
    </form>
  )
}
