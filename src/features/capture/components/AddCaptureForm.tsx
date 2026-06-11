'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui'
import { createCaptureRecordFromUploadedFile } from '@/features/capture/actions'
import {
  MANUAL_CAPTURE_TYPES,
  type CaptureIntent,
  type CaptureType,
} from '@/features/capture/types'
import { createClient } from '@/lib/supabase/client'

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024
const FILE_TOO_LARGE_MESSAGE =
  'That file is too large. Please upload evidence under 100MB.'
const MAX_BATCH_FILES = 10
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
  onresult:
    | ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void)
    | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

const FILE_INPUT_CONFIG: Record<
  CaptureType | 'auto_evidence',
  { accept: string; capture?: 'environment' }
> = {
  auto_evidence: { accept: 'image/*,video/*', capture: 'environment' },
  photo: { accept: 'image/*', capture: 'environment' },
  vin_plate: { accept: 'image/*', capture: 'environment' },
  info_plate: { accept: 'image/*', capture: 'environment' },
  document: { accept: 'application/pdf,image/*' },
  voice_note: { accept: 'audio/*' },
  video: { accept: 'video/*', capture: 'environment' },
  evidence_video: { accept: 'video/*', capture: 'environment' },
}

const ALLOWED_MIME_TYPES: Record<CaptureType, readonly string[]> = {
  photo: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
  ],
  vin_plate: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
  ],
  info_plate: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
  ],
  document: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
  ],
  voice_note: [
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/webm',
    'audio/ogg',
    'audio/aac',
    'audio/x-m4a',
  ],
  video: [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'video/mpeg',
  ],
  evidence_video: [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'video/mpeg',
  ],
}

function sanitizeFilename(filename: string) {
  const sanitized = filename
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 96)

  return sanitized || 'capture-file'
}

function buildStorageFilename(file: File) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const uniqueId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `${timestamp}-${uniqueId}-${sanitizeFilename(file.name)}`
}

function fileIsImage(file: File) {
  return ALLOWED_MIME_TYPES.photo.includes(file.type.toLowerCase())
}

function fileIsVideo(file: File) {
  return ALLOWED_MIME_TYPES.video.includes(file.type.toLowerCase())
}

function fileHasAllowedType(file: File, captureType: CaptureType) {
  return ALLOWED_MIME_TYPES[captureType].includes(file.type.toLowerCase())
}

function SubmitButton({
  hasFiles,
  pending,
}: {
  hasFiles: boolean
  pending: boolean
}) {
  return (
    <Button
      type="submit"
      className="button button-primary touch-target"
      disabled={pending || !hasFiles}
    >
      {pending ? 'Saving…' : 'Done — save evidence'}
    </Button>
  )
}

function getSuggestedCaptureText(sessionType?: string | null) {
  const normalizedSessionType = sessionType?.toLowerCase() ?? ''

  if (
    normalizedSessionType.includes('cvip') ||
    (normalizedSessionType.includes('commercial') &&
      normalizedSessionType.includes('inspection'))
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
  organizationId,
  sessionType,
  guidedStep,
  guidedLabel,
  workflow,
  returnPath,
  captureButtonLabel = 'Capture Evidence',
  helperText = 'Take or select photos/videos, add a quick voice or typed note, then tap Done.',
  commonCaptureText = 'Common captures: registration, VIN plate, unit number, licence plate, inspection sheet, work order, odometer, info/data plate, defects.',
  showSuggestedCaptureText = true,
  stickyDoneHref,
}: {
  sessionId: string
  organizationId: string
  sessionType?: string | null
  guidedStep?: string
  guidedLabel?: string
  workflow?: string
  returnPath?: string
  captureButtonLabel?: string
  helperText?: string
  commonCaptureText?: string
  showSuggestedCaptureText?: boolean
  stickyDoneHref?: string
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef =
    useRef<InstanceType<SpeechRecognitionConstructor> | null>(null)
  const selectedFilesRef = useRef<SelectedEvidenceFile[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)
  const [captureIntent, setCaptureIntent] =
    useState<CaptureIntent>('auto_evidence')
  const [manualType, setManualType] = useState<CaptureType>('document')
  const [selectedFiles, setSelectedFiles] = useState<SelectedEvidenceFile[]>([])
  const [note, setNote] = useState('')
  const [noteSource, setNoteSource] = useState<'manual' | 'voice' | 'edited'>(
    'manual',
  )
  const [transcriptStatus, setTranscriptStatus] = useState<
    'not_started' | 'pending' | 'completed' | 'unavailable'
  >('not_started')
  const activeType =
    captureIntent === 'auto_evidence' || captureIntent === 'auto_image'
      ? 'auto_evidence'
      : manualType
  const fileConfig = useMemo(() => FILE_INPUT_CONFIG[activeType], [activeType])
  const suggestedCaptureText = useMemo(
    () => getSuggestedCaptureText(sessionType),
    [sessionType],
  )
  const guidanceKey = guidedStep
    ? `${workflow ?? 'guided'}-${guidedStep}`
    : 'general'
  const fileInputId = `capture-file-${guidanceKey}`
  const supportsMultipleFiles =
    captureIntent === 'auto_evidence' || captureIntent === 'auto_image'

  useEffect(() => {
    return () => {
      selectedFilesRef.current.forEach((file) =>
        URL.revokeObjectURL(file.previewUrl),
      )
    }
  }, [])

  function replaceSelectedFiles(files: SelectedEvidenceFile[]) {
    selectedFilesRef.current.forEach((file) =>
      URL.revokeObjectURL(file.previewUrl),
    )
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

    if (
      (captureIntent === 'auto_image' || captureIntent === 'auto_evidence') &&
      files.some((file) => !fileIsImage(file) && !fileIsVideo(file))
    ) {
      setClientError('Capture Evidence accepts photo or video files only.')
      resetFileSelection()
      return
    }

    if (
      captureIntent === 'manual' &&
      files.some((file) => !fileHasAllowedType(file, manualType))
    ) {
      setClientError('That file type is not allowed for this capture.')
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

    const remainingFiles = Array.from(input.files).filter(
      (file, index) =>
        `${file.name}-${file.size}-${file.lastModified}-${index}` !== fileId,
    )
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const files = Array.from(fileInputRef.current?.files ?? [])

    if (files.length === 0) {
      setClientError('Choose at least one file to upload.')
      return
    }

    if (files.length > MAX_BATCH_FILES) {
      setClientError(`Upload up to ${MAX_BATCH_FILES} files at a time.`)
      return
    }

    if (captureIntent === 'manual' && files.length > 1) {
      setClientError('Advanced manual uploads support one file at a time.')
      return
    }

    if (files.some((file) => file.size <= 0)) {
      setClientError('One selected file is empty. Choose another file.')
      return
    }

    if (files.some((file) => file.size > MAX_FILE_SIZE_BYTES)) {
      setClientError(FILE_TOO_LARGE_MESSAGE)
      return
    }

    if (
      (captureIntent === 'auto_image' || captureIntent === 'auto_evidence') &&
      files.some((file) => !fileIsImage(file) && !fileIsVideo(file))
    ) {
      setClientError('Capture Evidence accepts photo or video files only.')
      return
    }

    if (
      captureIntent === 'manual' &&
      files.some((file) => !fileHasAllowedType(file, manualType))
    ) {
      setClientError('That file type is not allowed for this capture.')
      return
    }

    setClientError(null)
    setActionError(null)
    setIsSaving(true)

    const supabase = createClient()
    const uploadedPaths: string[] = []

    try {
      for (const file of files) {
        const storagePath = `organizations/${organizationId}/sessions/${sessionId}/captures/${buildStorageFilename(file)}`
        const { error: uploadError } = await supabase.storage
          .from('documentation-captures')
          .upload(storagePath, file, {
            cacheControl: '3600',
            contentType: file.type,
            upsert: false,
          })

        if (uploadError) {
          throw new Error(uploadError.message)
        }

        uploadedPaths.push(storagePath)

        const result = await createCaptureRecordFromUploadedFile({
          sessionId,
          storagePath,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          captureIntent,
          manualType: captureIntent === 'manual' ? manualType : null,
          guidedStep,
          guidedLabel,
          workflow,
          technicianNote: note,
          transcriptStatus,
          noteSource,
          reportOrder: null,
          includeInReport: true,
        })

        if (!result.ok) {
          await supabase.storage
            .from('documentation-captures')
            .remove([storagePath])
          throw new Error(result.error)
        }

        uploadedPaths.pop()
      }

      resetFileSelection()
      setNote('')
      setNoteSource('manual')
      setTranscriptStatus('not_started')
      router.refresh()

      if (returnPath) {
        window.location.assign(
          `${returnPath}${returnPath.includes('?') ? '&' : '?'}captureSaved=1`,
        )
      }
    } catch (error) {
      if (uploadedPaths.length > 0) {
        await supabase.storage
          .from('documentation-captures')
          .remove(uploadedPaths)
      }

      setActionError(
        error instanceof Error
          ? error.message
          : 'Unable to upload capture. Please try again.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  function startVoiceNote() {
    const speechWindow = window as SpeechWindow
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition

    if (!Recognition) {
      setTranscriptStatus('unavailable')
      setClientError(
        'Microphone transcription is unavailable on this device. Type the note instead.',
      )
      return
    }

    const recognition = new Recognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(' ')
      setNote(transcript)
      setNoteSource('voice')
    }
    recognition.onend = () =>
      setTranscriptStatus((current) =>
        current === 'pending' ? 'completed' : current,
      )
    recognitionRef.current = recognition
    setTranscriptStatus('pending')
    setClientError(null)
    recognition.start()
  }

  return (
    <form onSubmit={handleSubmit} className="capture-form form-stack">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="capture_intent" value={captureIntent} />
      <input type="hidden" name="manual_type" value={manualType} />
      <input type="hidden" name="transcript_status" value={transcriptStatus} />
      <input type="hidden" name="note_source" value={noteSource} />
      {guidedStep ? (
        <input type="hidden" name="guided_step" value={guidedStep} />
      ) : null}
      {guidedLabel ? (
        <input type="hidden" name="guided_label" value={guidedLabel} />
      ) : null}
      {workflow ? (
        <input type="hidden" name="session_workflow" value={workflow} />
      ) : null}
      {returnPath ? (
        <input type="hidden" name="return_path" value={returnPath} />
      ) : null}

      {clientError || actionError ? (
        <p className="error">{clientError ?? actionError}</p>
      ) : null}

      <div className="camera-first-panel">
        <button
          type="button"
          className="capture-evidence-button touch-target"
          onClick={openEvidencePicker}
        >
          <span className="capture-evidence-icon" aria-hidden="true">
            📷
          </span>
          <span>
            <strong>{captureButtonLabel}</strong>
            <small>Open camera for photo or video</small>
          </span>
        </button>
        <p className="muted capture-helper-text">{helperText}</p>
        {commonCaptureText ? (
          <p className="muted capture-upload-hint">{commonCaptureText}</p>
        ) : null}
        {showSuggestedCaptureText ? (
          <p className="muted capture-upload-hint">{suggestedCaptureText}</p>
        ) : null}
      </div>

      <div className="field-stack capture-file-field">
        <label htmlFor={fileInputId} className="label visually-hidden">
          Capture evidence file
        </label>
        <input
          ref={fileInputRef}
          key={`${captureIntent}-${activeType}`}
          id={fileInputId}
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
            <strong>
              {selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'}{' '}
              ready
            </strong>
            {selectedFiles.map((file) => (
              <span key={file.id}>{file.name}</span>
            ))}
          </div>
        ) : null}
        {selectedFiles.length > 0 ? (
          <div
            className="draft-evidence-preview-list"
            aria-label="Draft evidence previews"
          >
            {selectedFiles.map((file) => (
              <article
                key={file.id}
                className="capture-list-item evidence-preview-card draft-evidence-preview-card"
              >
                <div className="capture-list-main">
                  <div>
                    <h3>{file.name}</h3>
                    <p className="muted">Draft evidence preview</p>
                  </div>
                  <span className="ai-status-pill draft-status-pill">
                    Ready to save
                  </span>
                </div>

                <div className="evidence-media-frame">
                  {file.type.startsWith('video/') ? (
                    <video
                      src={file.previewUrl}
                      controls
                      preload="metadata"
                      className="evidence-media"
                    />
                  ) : file.type.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={file.previewUrl}
                      alt={`Draft preview for ${file.name}`}
                      className="evidence-media"
                    />
                  ) : (
                    <div className="evidence-file-placeholder">
                      Preview unavailable for {file.type || 'this file type'}
                    </div>
                  )}
                  <div
                    className="evidence-note-overlay"
                    aria-label="Read-only note shown on report"
                  >
                    <div className="evidence-note-overlay-header">
                      <strong>Note shown on report</strong>
                      <button
                        type="button"
                        className="evidence-note-edit-link"
                        onClick={() => {
                          noteTextareaRef.current?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center',
                          })
                          noteTextareaRef.current?.focus({
                            preventScroll: true,
                          })
                        }}
                      >
                        Edit note
                      </button>
                    </div>
                    <span>
                      {note.trim() ||
                        (transcriptStatus === 'pending'
                          ? 'Transcribing…'
                          : 'Add note before saving')}
                    </span>
                  </div>
                </div>

                <div className="draft-evidence-preview-footer">
                  <span className="muted draft-evidence-filename">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    className="secondary-link danger-link"
                    onClick={() => removeSelectedFile(file.id)}
                  >
                    Remove selected file
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
        <p className="muted capture-upload-hint">
          Maximum file size is 100MB per file. Photos and videos are queued for
          AI review.
        </p>
      </div>

      <div className="field-stack capture-note-composer report-note-editor">
        <label htmlFor={`technician-note-${guidanceKey}`} className="label">
          Edit note shown on report
        </label>
        <textarea
          ref={noteTextareaRef}
          id={`technician-note-${guidanceKey}`}
          name="technician_note"
          className="input note-textarea prominent-note-textarea"
          value={note}
          placeholder={
            transcriptStatus === 'pending'
              ? 'Transcribing…'
              : 'Speak or type what matters: location, component, measurement, condition, recommendation.'
          }
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
        <p className="muted note-helper-text">
          Changes update the note overlay and exported PDF.
        </p>
        <div className="capture-note-actions">
          <button
            type="button"
            className="button button-secondary touch-target"
            onClick={startVoiceNote}
          >
            {transcriptStatus === 'pending' ? 'Listening…' : 'Add voice note'}
          </button>
          <span className="muted">
            {transcriptStatus === 'pending'
              ? 'Transcribing…'
              : transcriptStatus === 'unavailable'
                ? 'Mic unavailable — type note'
                : 'Editable before and after saving'}
          </span>
        </div>
      </div>

      <SubmitButton hasFiles={selectedFiles.length > 0} pending={isSaving} />

      {stickyDoneHref ? (
        <div className="guided-sticky-actions focused-capture-done-actions">
          <button
            type="button"
            className="button button-primary touch-target"
            onClick={openEvidencePicker}
          >
            Capture
          </button>
          <Link href={stickyDoneHref} className="button button-secondary touch-target">
            Done
          </Link>
        </div>
      ) : null}

      <details className="advanced-capture-options">
        <summary>Advanced upload options</summary>
        <div className="advanced-capture-content form-stack">
          <div
            className="advanced-capture-actions"
            aria-label="Manual upload options"
          >
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
                setManualType('video')
              }}
            >
              Upload Video
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
          </div>
        </div>
      </details>
    </form>
  )
}
