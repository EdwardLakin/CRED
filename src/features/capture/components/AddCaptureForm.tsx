'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui'
import { createCapture, type CaptureActionState } from '@/features/capture/actions'
import { MANUAL_CAPTURE_TYPES, type CaptureIntent, type CaptureType } from '@/features/capture/types'

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024
const FILE_TOO_LARGE_MESSAGE = 'That file is too large. Please upload evidence under 100MB.'
const MAX_BATCH_FILES = 10
const INITIAL_CAPTURE_STATE: CaptureActionState = {}

type SelectedEvidenceFile = {
  id: string
  name: string
  type: string
  size: number
  previewUrl: string
}

type SpeechRecognitionConstructor = new () => {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

const FILE_INPUT_CONFIG: Record<CaptureType | 'auto_evidence', { accept: string; capture?: 'environment' }> = {
  auto_evidence: { accept: 'image/*,video/*', capture: 'environment' },
  photo: { accept: 'image/*', capture: 'environment' },
  vin_plate: { accept: 'image/*', capture: 'environment' },
  info_plate: { accept: 'image/*', capture: 'environment' },
  document: { accept: 'application/pdf,image/*' },
  voice_note: { accept: 'audio/*' },
  video: { accept: 'video/*', capture: 'environment' },
  evidence_video: { accept: 'video/*', capture: 'environment' },
}

function SubmitButton({ hasFiles }: { hasFiles: boolean }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="button button-primary touch-target" disabled={pending || !hasFiles}>
      {pending ? 'Saving…' : 'Done — save evidence'}
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
  helperText = 'Take or select photos/videos, add a quick voice or typed note, then tap Done.',
  commonCaptureText = 'Common captures: registration, VIN plate, unit number, licence plate, inspection sheet, work order, odometer, info/data plate, defects.',
  showSuggestedCaptureText = true,
}: {
  sessionId: string
  sessionType?: string | null
  guidedStep?: string
  guidedLabel?: string
  workflow?: string
  returnPath?: string
  captureButtonLabel?: string
  helperText?: string
  commonCaptureText?: string
  showSuggestedCaptureText?: boolean
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<InstanceType<SpeechRecognitionConstructor> | null>(null)
  const selectedFilesRef = useRef<SelectedEvidenceFile[]>([])
  const [state, formAction] = useActionState(createCapture, INITIAL_CAPTURE_STATE)
  const [clientError, setClientError] = useState<string | null>(null)
  const [captureIntent, setCaptureIntent] = useState<CaptureIntent>('auto_evidence')
  const [manualType, setManualType] = useState<CaptureType>('document')
  const [selectedFiles, setSelectedFiles] = useState<SelectedEvidenceFile[]>([])
  const [note, setNote] = useState('')
  const [noteSource, setNoteSource] = useState<'manual' | 'voice' | 'edited'>('manual')
  const [transcriptStatus, setTranscriptStatus] = useState<'not_started' | 'pending' | 'completed' | 'unavailable'>('not_started')
  const activeType = captureIntent === 'auto_evidence' || captureIntent === 'auto_image' ? 'auto_evidence' : manualType
  const fileConfig = useMemo(() => FILE_INPUT_CONFIG[activeType], [activeType])
  const suggestedCaptureText = useMemo(() => getSuggestedCaptureText(sessionType), [sessionType])
  const guidanceKey = guidedStep ? `${workflow ?? 'guided'}-${guidedStep}` : 'general'
  const fileInputId = `capture-file-${guidanceKey}`
  const supportsMultipleFiles = captureIntent === 'auto_evidence' || captureIntent === 'auto_image'

  useEffect(() => {
    return () => {
      selectedFilesRef.current.forEach((file) => URL.revokeObjectURL(file.previewUrl))
    }
  }, [])

  function replaceSelectedFiles(files: SelectedEvidenceFile[]) {
    selectedFilesRef.current.forEach((file) => URL.revokeObjectURL(file.previewUrl))
    selectedFilesRef.current = files
    setSelectedFiles(files)
  }

  function resetFileSelection() {
    replaceSelectedFiles([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function buildSelectedEvidenceFiles(files: File[]): SelectedEvidenceFile[] {
    return files.map((file, index) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
      name: file.name,
      type: file.type,
      size: file.size,
      previewUrl: URL.createObjectURL(file),
    }))
  }

  function validateFileSelection() {
    const files = Array.from(fileInputRef.current?.files ?? [])

    if (files.length === 0) {
      replaceSelectedFiles([])
      setClientError(null)
      return
    }

    if (files.length > MAX_BATCH_FILES) {
      setClientError(`Upload up to ${MAX_BATCH_FILES} files at a time.`)
      resetFileSelection()
      return
    }

    if (files.some((file) => file.size > MAX_FILE_SIZE_BYTES)) {
      setClientError(FILE_TOO_LARGE_MESSAGE)
      resetFileSelection()
      return
    }

    replaceSelectedFiles(buildSelectedEvidenceFiles(files))
    setClientError(null)
  }

  function removeSelectedFile(fileId: string) {
    const input = fileInputRef.current
    if (!input?.files) {
      return
    }

    const remainingFiles = Array.from(input.files).filter((file, index) => `${file.name}-${file.size}-${file.lastModified}-${index}` !== fileId)
    const dataTransfer = new DataTransfer()
    remainingFiles.forEach((file) => dataTransfer.items.add(file))
    input.files = dataTransfer.files
    replaceSelectedFiles(buildSelectedEvidenceFiles(remainingFiles))
    setClientError(null)
  }

  function openEvidencePicker() {
    setCaptureIntent('auto_evidence')
    window.setTimeout(() => fileInputRef.current?.click(), 0)
  }

  function startVoiceNote() {
    const speechWindow = window as SpeechWindow
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition

    if (!Recognition) {
      setTranscriptStatus('unavailable')
      setClientError('Microphone transcription is unavailable on this device. Type the note instead.')
      return
    }

    const recognition = new Recognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0].transcript).join(' ')
      setNote(transcript)
      setNoteSource('voice')
    }
    recognition.onend = () => setTranscriptStatus((current) => (current === 'pending' ? 'completed' : current))
    recognitionRef.current = recognition
    setTranscriptStatus('pending')
    setClientError(null)
    recognition.start()
  }

  return (
    <form ref={formRef} action={formAction} className="capture-form form-stack">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="capture_intent" value={captureIntent} />
      <input type="hidden" name="manual_type" value={manualType} />
      <input type="hidden" name="transcript_status" value={transcriptStatus} />
      <input type="hidden" name="note_source" value={noteSource} />
      {guidedStep ? <input type="hidden" name="guided_step" value={guidedStep} /> : null}
      {guidedLabel ? <input type="hidden" name="guided_label" value={guidedLabel} /> : null}
      {workflow ? <input type="hidden" name="session_workflow" value={workflow} /> : null}
      {returnPath ? <input type="hidden" name="return_path" value={returnPath} /> : null}

      {clientError || state.error ? <p className="error">{clientError ?? state.error}</p> : null}

      <div className="camera-first-panel">
        <button type="button" className="capture-evidence-button touch-target" onClick={openEvidencePicker}>
          <span className="capture-evidence-icon" aria-hidden="true">📷</span>
          <span>
            <strong>{captureButtonLabel}</strong>
            <small>Open camera for photo or video</small>
          </span>
        </button>
        <p className="muted capture-helper-text">{helperText}</p>
        {commonCaptureText ? <p className="muted capture-upload-hint">{commonCaptureText}</p> : null}
        {showSuggestedCaptureText ? <p className="muted capture-upload-hint">{suggestedCaptureText}</p> : null}
      </div>

      <div className="field-stack capture-file-field">
        <label htmlFor={fileInputId} className="label visually-hidden">Capture evidence file</label>
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
          onChange={validateFileSelection}
        />
        {selectedFiles.length > 0 ? (
          <div className="selected-evidence-list">
            <strong>{selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'} ready</strong>
            {selectedFiles.map((file) => <span key={file.id}>{file.name}</span>)}
          </div>
        ) : null}
        {selectedFiles.length > 0 ? (
          <div className="draft-evidence-preview-list" aria-label="Draft evidence previews">
            {selectedFiles.map((file) => (
              <article key={file.id} className="capture-list-item evidence-preview-card draft-evidence-preview-card">
                <div className="capture-list-main">
                  <div>
                    <h3>{file.name}</h3>
                    <p className="muted">Draft evidence preview</p>
                  </div>
                  <span className="ai-status-pill draft-status-pill">Ready to save</span>
                </div>

                <div className="evidence-media-frame">
                  {file.type.startsWith('video/') ? (
                    <video src={file.previewUrl} controls preload="metadata" className="evidence-media" />
                  ) : file.type.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.previewUrl} alt={`Draft preview for ${file.name}`} className="evidence-media" />
                  ) : (
                    <div className="evidence-file-placeholder">Preview unavailable for {file.type || 'this file type'}</div>
                  )}
                  <div className="evidence-note-overlay" aria-label="Read-only note shown on report">
                    <div className="evidence-note-overlay-header">
                      <strong>Note shown on report</strong>
                      <button
                        type="button"
                        className="evidence-note-edit-link"
                        onClick={() => {
                          noteTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          noteTextareaRef.current?.focus({ preventScroll: true })
                        }}
                      >
                        Edit note
                      </button>
                    </div>
                    <span>{note.trim() || (transcriptStatus === 'pending' ? 'Transcribing…' : 'Add note before saving')}</span>
                  </div>
                </div>

                <div className="draft-evidence-preview-footer">
                  <span className="muted draft-evidence-filename">{file.name}</span>
                  <button type="button" className="secondary-link danger-link" onClick={() => removeSelectedFile(file.id)}>
                    Remove selected file
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
        <p className="muted capture-upload-hint">Maximum file size is 100MB per file. Photos and videos are queued for AI review.</p>
      </div>

      <div className="field-stack capture-note-composer report-note-editor">
        <label htmlFor={`technician-note-${guidanceKey}`} className="label">Edit note shown on report</label>
        <textarea
          ref={noteTextareaRef}
          id={`technician-note-${guidanceKey}`}
          name="technician_note"
          className="input note-textarea prominent-note-textarea"
          value={note}
          placeholder={transcriptStatus === 'pending' ? 'Transcribing…' : 'Speak or type what matters: location, component, measurement, condition, recommendation.'}
          onChange={(event) => {
            setNote(event.target.value)
            setNoteSource(noteSource === 'voice' ? 'edited' : 'manual')
            if (transcriptStatus === 'pending') {
              recognitionRef.current?.stop()
              setTranscriptStatus('completed')
            }
          }}
          rows={4}
        />
        <p className="muted note-helper-text">Changes update the note overlay and exported PDF.</p>
        <div className="capture-note-actions">
          <button type="button" className="button button-secondary touch-target" onClick={startVoiceNote}>
            {transcriptStatus === 'pending' ? 'Listening…' : 'Add voice note'}
          </button>
          <span className="muted">{transcriptStatus === 'pending' ? 'Transcribing…' : transcriptStatus === 'unavailable' ? 'Mic unavailable — type note' : 'Editable before and after saving'}</span>
        </div>
      </div>

      <SubmitButton hasFiles={selectedFiles.length > 0} />

      <details className="advanced-capture-options">
        <summary>Advanced upload options</summary>
        <div className="advanced-capture-content form-stack">
          <div className="advanced-capture-actions" aria-label="Manual upload options">
            <button type="button" className="button button-secondary touch-target" onClick={() => { setCaptureIntent('manual'); setManualType('document') }}>Upload Document</button>
            <button type="button" className="button button-secondary touch-target" onClick={() => { setCaptureIntent('manual'); setManualType('video') }}>Upload Video</button>
            <button type="button" className="button button-secondary touch-target" onClick={() => { setCaptureIntent('manual'); setManualType('voice_note') }}>Upload Audio Note</button>
          </div>
          <div className="field-stack">
            <label htmlFor="manual-capture-type" className="label">Manually choose capture type</label>
            <select id="manual-capture-type" className="select" value={manualType} onChange={(event) => { setCaptureIntent('manual'); setManualType(event.target.value as CaptureType) }}>
              {MANUAL_CAPTURE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label} — {type.helper}</option>)}
            </select>
          </div>
        </div>
      </details>
    </form>
  )
}
