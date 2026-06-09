'use client'

import { useActionState, useMemo, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui'
import { createCapture, type CaptureActionState } from '@/features/capture/actions'
import { MANUAL_CAPTURE_TYPES, type CaptureIntent, type CaptureType } from '@/features/capture/types'

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024
const FILE_TOO_LARGE_MESSAGE = 'That file is too large. Please upload an image under 15MB.'
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

export function AddCaptureForm({ sessionId }: { sessionId: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [state, formAction] = useActionState(createCapture, INITIAL_CAPTURE_STATE)
  const [clientError, setClientError] = useState<string | null>(null)
  const [captureIntent, setCaptureIntent] = useState<CaptureIntent>('auto_image')
  const [manualType, setManualType] = useState<CaptureType>('document')
  const activeType = captureIntent === 'auto_image' ? 'photo' : manualType
  const fileConfig = useMemo(() => FILE_INPUT_CONFIG[activeType], [activeType])
  const fileInputId = 'capture-file'

  function submitAfterFileSelection() {
    const file = fileInputRef.current?.files?.[0]

    if (!file) {
      return
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setClientError(FILE_TOO_LARGE_MESSAGE)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    setClientError(null)
    window.setTimeout(() => formRef.current?.requestSubmit(), 0)
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

      {clientError || state.error ? <p className="error">{clientError ?? state.error}</p> : null}

      <div className="camera-first-panel">
        <button type="button" className="capture-evidence-button touch-target" onClick={openAutoImagePicker}>
          <span className="capture-evidence-icon" aria-hidden="true">
            📷
          </span>
          <span>
            <strong>Capture Evidence</strong>
            <small>Open the camera or photo picker</small>
          </span>
        </button>
        <p className="muted capture-helper-text">
          Take photos of VIN labels, info plates, documents, damage, odometers, or field conditions. CRED will organize
          them automatically.
        </p>
      </div>

      <div className="field-stack capture-file-field">
        <label htmlFor={fileInputId} className="label visually-hidden">
          {captureIntent === 'auto_image' ? 'Capture evidence image' : 'Upload selected capture file'}
        </label>
        <input
          ref={fileInputRef}
          key={`${captureIntent}-${activeType}`}
          id={fileInputId}
          name="file"
          type="file"
          accept={fileConfig.accept}
          capture={fileConfig.capture}
          required
          className="input file-input camera-file-input"
          onChange={submitAfterFileSelection}
        />
        <p className="muted capture-upload-hint">Maximum file size is 15MB. Images are queued for AI classification.</p>
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
