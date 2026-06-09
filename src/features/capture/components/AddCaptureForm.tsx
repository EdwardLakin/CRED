'use client'

import { useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui'
import { createCapture } from '@/features/capture/actions'
import { CAPTURE_TYPES, type CaptureType } from '@/features/capture/types'

const FILE_INPUT_CONFIG: Record<CaptureType, { accept: string; capture?: 'environment' }> = {
  photo: { accept: 'image/*', capture: 'environment' },
  vin_plate: { accept: 'image/*', capture: 'environment' },
  info_plate: { accept: 'image/*', capture: 'environment' },
  document: { accept: 'application/pdf,image/*' },
  voice_note: { accept: 'audio/*' },
}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="button button-primary touch-target" disabled={pending}>
      {pending ? 'Uploading…' : 'Add Capture'}
    </Button>
  )
}

export function AddCaptureForm({ sessionId }: { sessionId: string }) {
  const [captureType, setCaptureType] = useState<CaptureType>('photo')
  const fileConfig = useMemo(() => FILE_INPUT_CONFIG[captureType], [captureType])

  return (
    <form action={createCapture} className="capture-form form-stack">
      <input type="hidden" name="session_id" value={sessionId} />
      <div className="capture-type-grid" role="radiogroup" aria-label="Capture type">
        {CAPTURE_TYPES.map((type) => (
          <label key={type.value} className="capture-type-option">
            <input
              type="radio"
              name="type"
              value={type.value}
              checked={captureType === type.value}
              onChange={() => setCaptureType(type.value)}
            />
            <span>
              <strong>{type.label}</strong>
              <small>{type.helper}</small>
            </span>
          </label>
        ))}
      </div>

      <div className="field-stack">
        <label htmlFor="capture-file" className="label">
          Upload file
        </label>
        <input
          key={captureType}
          id="capture-file"
          name="file"
          type="file"
          accept={fileConfig.accept}
          capture={fileConfig.capture}
          required
          className="input file-input"
        />
        <p className="muted capture-upload-hint">Maximum file size is 15MB.</p>
      </div>

      <div className="form-actions capture-actions">
        <SubmitButton />
      </div>
    </form>
  )
}
