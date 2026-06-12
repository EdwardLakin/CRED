'use client'

import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui'
import {
  createCaptureRecordFromUploadedFile,
  validateCaptureBillingAccess,
} from '@/features/capture/actions'
import {
  MANUAL_CAPTURE_TYPES,
  SOURCE_DOCUMENT_OPTIONS,
  type CaptureIntent,
  type CaptureType,
  type SourceDocumentType,
} from '@/features/capture/types'
import { createClient } from '@/lib/supabase/client'

const MAX_BATCH_FILES = 10
const VOICE_NOTE_TIMEOUT_MS = 60_000

type UploadStatus = 'queued' | 'uploading' | 'saved' | 'failed'

type SelectedEvidenceFile = {
  id: string
  file: File
  name: string
  type: string
  size: number
  previewUrl: string
  status: UploadStatus
  error?: string
}

type SpeechRecognitionResultLike = {
  0?: { transcript?: string }
}

type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult:
    | ((event: { results: ArrayLike<SpeechRecognitionResultLike> }) => void)
    | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  start: () => void
  stop: () => void
  abort?: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

type VoiceNoteStatus =
  | 'idle'
  | 'listening'
  | 'stopped'
  | 'cancelled'
  | 'unsupported'
  | 'denied'
  | 'error'

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

function formatFileSize(bytes: number) {
  const megabytes = bytes / (1024 * 1024)
  return `${Number.isInteger(megabytes) ? megabytes.toFixed(0) : megabytes.toFixed(1)}MB`
}

function SubmitButton({
  hasFiles,
  pending,
  hasActiveUploads,
  retryOnly,
}: {
  hasFiles: boolean
  pending: boolean
  hasActiveUploads: boolean
  retryOnly: boolean
}) {
  return (
    <Button
      type="submit"
      className="button button-primary touch-target"
      disabled={pending || hasActiveUploads || !hasFiles}
    >
      {pending || hasActiveUploads
        ? 'Uploading…'
        : retryOnly
          ? 'Retry failed upload'
          : 'Done — save evidence'}
    </Button>
  )
}

function getUploadStatusLabel(status: UploadStatus, error?: string) {
  if (status === 'uploading') return 'Uploading…'
  if (status === 'saved') return 'Saved'
  if (status === 'failed') return error ? `Upload failed — retry: ${error}` : 'Upload failed — retry'
  return 'Queued'
}

function getFriendlyUploadError(message: string) {
  const normalized = message.toLowerCase()

  if (normalized.includes('larger than your plan') || normalized.includes('maximum file size')) {
    return 'File too large for your plan'
  }

  if (normalized.includes('storage') && (normalized.includes('limit') || normalized.includes('allowance'))) {
    return 'Storage limit reached'
  }

  if (normalized.includes('failed to fetch') || normalized.includes('network') || normalized.includes('offline')) {
    return 'Upload failed — bad connection'
  }

  return message || 'Upload failed — retry'
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
  maxCaptureFileSizeBytes,
  maxVideoFileSizeBytes,
  maxFileSizeLabel,
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
  maxCaptureFileSizeBytes: number
  maxVideoFileSizeBytes: number
  maxFileSizeLabel?: string
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const voiceNoteTimeoutRef = useRef<number | null>(
    null,
  )
  const voiceNoteBaseRef = useRef('')
  const selectedFilesRef = useRef<SelectedEvidenceFile[]>([])
  const isSavingRef = useRef(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)
  const [captureIntent, setCaptureIntent] =
    useState<CaptureIntent>('auto_evidence')
  const [manualType, setManualType] = useState<CaptureType>('document')
  const [sourceDocumentType, setSourceDocumentType] =
    useState<SourceDocumentType | null>(null)
  const selectedSourceDocument = SOURCE_DOCUMENT_OPTIONS.find(
    (option) => option.type === sourceDocumentType,
  )
  const [selectedFiles, setSelectedFiles] = useState<SelectedEvidenceFile[]>([])
  const [note, setNote] = useState('')
  const [noteSource, setNoteSource] = useState<'manual' | 'voice' | 'edited'>(
    'manual',
  )
  const [transcriptStatus, setTranscriptStatus] = useState<
    'not_started' | 'pending' | 'completed' | 'unavailable'
  >('not_started')
  const [voiceNoteStatus, setVoiceNoteStatus] =
    useState<VoiceNoteStatus>('idle')
  const [isVoiceSupported, setIsVoiceSupported] = useState<boolean | null>(null)
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
  const captureSizeLabel = maxFileSizeLabel ?? formatFileSize(maxCaptureFileSizeBytes)
  const videoSizeLabel = formatFileSize(maxVideoFileSizeBytes)
  const hasActiveUploads = selectedFiles.some((file) => file.status === 'uploading')
  const failedFiles = selectedFiles.filter((file) => file.status === 'failed')
  const uploadableFiles = failedFiles.length > 0 ? failedFiles : selectedFiles.filter((file) => file.status === 'queued')

  function getMaxFileSizeForFile(file: File) {
    return fileIsVideo(file) ? maxVideoFileSizeBytes : maxCaptureFileSizeBytes
  }

  function getFileTooLargeMessage(file: File) {
    return `This file is larger than your plan allows. ${fileIsVideo(file) ? 'Video' : 'Capture'} files can be up to ${formatFileSize(getMaxFileSizeForFile(file))}.`
  }

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

  function getSelectedEvidenceFileId(file: File, index: number) {
    return `${file.name}-${file.size}-${file.lastModified}-${index}`
  }

  function buildSelectedEvidenceFiles(files: File[]): SelectedEvidenceFile[] {
    return files.map((file, index) => ({
      id: getSelectedEvidenceFileId(file, index),
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      previewUrl: URL.createObjectURL(file),
      status: 'queued',
    }))
  }

  function updateSelectedFileStatus(fileId: string, status: UploadStatus, error?: string) {
    setSelectedFiles((currentFiles) => {
      const nextFiles = currentFiles.map((file) =>
        file.id === fileId ? { ...file, status, error } : file,
      )
      selectedFilesRef.current = nextFiles
      return nextFiles
    })
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

    const oversizedFile = files.find((file) => file.size > getMaxFileSizeForFile(file))

    if (oversizedFile) {
      setClientError(getFileTooLargeMessage(oversizedFile))
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
    const fileToRemove = selectedFilesRef.current.find((file) => file.id === fileId)

    if (fileToRemove?.status === 'uploading' || fileToRemove?.status === 'saved') {
      return
    }

    const remainingFiles = selectedFilesRef.current.filter((file) => file.id !== fileId)
    URL.revokeObjectURL(fileToRemove?.previewUrl ?? '')
    selectedFilesRef.current = remainingFiles
    setSelectedFiles(remainingFiles)

    if (fileInputRef.current && typeof DataTransfer !== 'undefined') {
      const dataTransfer = new DataTransfer()
      remainingFiles.forEach((file) => dataTransfer.items.add(file.file))
      fileInputRef.current.files = dataTransfer.files
    }

    setClientError(null)
    setActionError(null)
    setSaveMessage(null)
  }

  function openEvidencePicker() {
    setCaptureIntent('auto_evidence')
    window.setTimeout(() => fileInputRef.current?.click(), 0)
  }

  function triggerBackgroundProcessing() {
    fetch(`/api/dashboard/sessions/${sessionId}/captures/process`, {
      method: 'POST',
      keepalive: true,
    }).catch((error: unknown) => {
      console.warn('Background capture processing trigger failed', error)
    })
  }

  async function uploadSelectedFiles(filesToUpload: SelectedEvidenceFile[]) {
    const supabase = createClient()
    let savedCount = 0
    let failedCount = 0

    const accessResult = await validateCaptureBillingAccess(
      sessionId,
      filesToUpload.map((selectedFile) => ({
        size: selectedFile.file.size,
        mimeType: selectedFile.file.type,
      })),
    )

    if (!accessResult.ok) {
      const friendlyError = getFriendlyUploadError(accessResult.error)
      filesToUpload.forEach((selectedFile) =>
        updateSelectedFileStatus(selectedFile.id, 'failed', friendlyError),
      )
      setActionError(friendlyError)
      return { savedCount, failedCount: filesToUpload.length }
    }

    for (const selectedFile of filesToUpload) {
      const { file } = selectedFile
      const storagePath = `organizations/${organizationId}/sessions/${sessionId}/captures/${buildStorageFilename(file)}`

      updateSelectedFileStatus(selectedFile.id, 'uploading')

      try {
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
          sourceDocumentType: selectedSourceDocument?.type ?? null,
          sourceDocumentLabel: selectedSourceDocument?.label ?? null,
        })

        if (!result.ok) {
          await supabase.storage.from('documentation-captures').remove([storagePath])
          throw new Error(result.error)
        }

        savedCount += 1
        updateSelectedFileStatus(selectedFile.id, 'saved')
      } catch (error) {
        failedCount += 1
        const message = getFriendlyUploadError(
          error instanceof Error
            ? error.message
            : 'Upload failed. Check your connection and retry.',
        )
        updateSelectedFileStatus(selectedFile.id, 'failed', message)
      }
    }

    return { savedCount, failedCount }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSavingRef.current || isSaving || hasActiveUploads) {
      return
    }

    if (voiceNoteStatus === 'listening') {
      stopVoiceNote('Voice note stopped.')
      setClientError('Voice note stopped. Review your note, then save evidence.')
      return
    }

    const filesToUpload = uploadableFiles

    if (filesToUpload.length === 0) {
      setClientError('Choose at least one file to upload.')
      return
    }

    if (selectedFiles.length > MAX_BATCH_FILES) {
      setClientError(`Upload up to ${MAX_BATCH_FILES} files at a time.`)
      return
    }

    if (captureIntent === 'manual' && selectedFiles.length > 1) {
      setClientError('Advanced manual uploads support one file at a time.')
      return
    }

    if (filesToUpload.some(({ file }) => file.size <= 0)) {
      setClientError('One selected file is empty. Choose another file.')
      return
    }

    const oversizedFile = filesToUpload.find(
      ({ file }) => file.size > getMaxFileSizeForFile(file),
    )

    if (oversizedFile) {
      const message = 'File too large for your plan'
      updateSelectedFileStatus(oversizedFile.id, 'failed', message)
      setClientError(message)
      return
    }

    if (
      (captureIntent === 'auto_image' || captureIntent === 'auto_evidence') &&
      filesToUpload.some(({ file }) => !fileIsImage(file) && !fileIsVideo(file))
    ) {
      setClientError('Capture Evidence accepts photo or video files only.')
      return
    }

    if (
      captureIntent === 'manual' &&
      filesToUpload.some(({ file }) => !fileHasAllowedType(file, manualType))
    ) {
      setClientError('That file type is not allowed for this capture.')
      return
    }

    setClientError(null)
    setActionError(null)
    setSaveMessage(null)
    isSavingRef.current = true
    setIsSaving(true)

    try {
      const result = await uploadSelectedFiles(filesToUpload)

      if (result.savedCount > 0) {
        cleanupRecognition()
        setSaveMessage('Saved. AI is processing in the background.')
        triggerBackgroundProcessing()
        router.refresh()
      }

      if (result.failedCount > 0) {
        setActionError(
          result.savedCount > 0
            ? 'Some files were saved. Failed files are still here — retry them when your connection is better.'
            : 'Upload failed — retry when your connection is better.',
        )
        return
      }

      window.setTimeout(() => {
        resetFileSelection()
        setNote('')
        setNoteSource('manual')
        setTranscriptStatus('not_started')
        setVoiceNoteStatus(isVoiceSupported === false ? 'unsupported' : 'idle')
        setSourceDocumentType(null)
      }, 900)

      if (returnPath) {
        window.setTimeout(() => {
          window.location.assign(
            `${returnPath}${returnPath.includes('?') ? '&' : '?'}captureSaved=1`,
          )
        }, 900)
      }
    } finally {
      isSavingRef.current = false
      setIsSaving(false)
    }
  }

  const clearVoiceNoteTimeout = useCallback(() => {
    if (voiceNoteTimeoutRef.current) {
      window.clearTimeout(voiceNoteTimeoutRef.current)
      voiceNoteTimeoutRef.current = null
    }
  }, [])

  const cleanupRecognition = useCallback(() => {
    clearVoiceNoteTimeout()

    const recognition = recognitionRef.current
    if (!recognition) {
      return
    }

    recognition.onresult = null
    recognition.onerror = null
    recognition.onend = null

    try {
      if (recognition.abort) {
        recognition.abort()
      } else {
        recognition.stop()
      }
    } catch (error) {
      console.warn('Voice note cleanup failed', error)
    } finally {
      recognitionRef.current = null
    }
  }, [clearVoiceNoteTimeout])

  const stopVoiceNote = useCallback((message = 'Voice note stopped.') => {
    clearVoiceNoteTimeout()

    const recognition = recognitionRef.current
    if (recognition) {
      recognitionRef.current = null
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null

      try {
        recognition.stop()
      } catch (error) {
        console.warn('Voice note stop failed', error)
      }
    }

    setTranscriptStatus((current) =>
      current === 'pending' ? 'completed' : current,
    )
    setVoiceNoteStatus('stopped')
    setSaveMessage(message)
  }, [clearVoiceNoteTimeout])

  function cancelVoiceNote() {
    cleanupRecognition()
    setNote(voiceNoteBaseRef.current)
    setNoteSource('manual')
    setTranscriptStatus('not_started')
    setVoiceNoteStatus('cancelled')
    setSaveMessage(null)
    setClientError(null)
  }

  function clearNote() {
    if (voiceNoteStatus === 'listening') {
      cleanupRecognition()
    }

    voiceNoteBaseRef.current = ''
    setNote('')
    setNoteSource('manual')
    setTranscriptStatus('not_started')
    setVoiceNoteStatus('idle')
    setSaveMessage(null)
    setClientError(null)
  }

  function startVoiceNote() {
    if (voiceNoteStatus === 'listening') {
      return
    }

    const speechWindow = window as SpeechWindow
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition

    if (!Recognition) {
      setIsVoiceSupported(false)
      setTranscriptStatus('unavailable')
      setVoiceNoteStatus('unsupported')
      setClientError(
        'Voice notes are not supported in this browser. Type your note instead.',
      )
      return
    }

    cleanupRecognition()
    voiceNoteBaseRef.current = note.trim()

    const recognition = new Recognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript?.trim() ?? '')
        .filter(Boolean)
        .join(' ')
        .trim()

      if (!transcript) {
        return
      }

      const baseNote = voiceNoteBaseRef.current
      setNote(baseNote ? `${baseNote} ${transcript}` : transcript)
      setNoteSource('voice')
    }
    recognition.onerror = (event) => {
      cleanupRecognition()
      setTranscriptStatus('not_started')

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setVoiceNoteStatus('denied')
        setClientError(
          'Microphone permission was denied. Type your note instead.',
        )
        return
      }

      setVoiceNoteStatus('error')
      setClientError('Voice note stopped. Type your note instead.')
    }
    recognition.onend = () => {
      clearVoiceNoteTimeout()
      recognitionRef.current = null
      setTranscriptStatus((current) =>
        current === 'pending' ? 'completed' : current,
      )
      setVoiceNoteStatus((current) =>
        current === 'listening' ? 'stopped' : current,
      )
    }

    recognitionRef.current = recognition
    setTranscriptStatus('pending')
    setVoiceNoteStatus('listening')
    setClientError(null)
    setSaveMessage(null)

    voiceNoteTimeoutRef.current = window.setTimeout(() => {
      stopVoiceNote('Voice note stopped.')
    }, VOICE_NOTE_TIMEOUT_MS)

    try {
      recognition.start()
    } catch {
      cleanupRecognition()
      setTranscriptStatus('not_started')
      setVoiceNoteStatus('error')
      setClientError('Voice note stopped. Type your note instead.')
    }
  }

  useEffect(() => {
    const supportCheckId = window.setTimeout(() => {
      const speechWindow = window as SpeechWindow
      const Recognition =
        speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition

      setIsVoiceSupported(Boolean(Recognition))
      if (!Recognition) {
        setTranscriptStatus('unavailable')
        setVoiceNoteStatus('unsupported')
      }
    }, 0)

    return () => window.clearTimeout(supportCheckId)
  }, [])

  useEffect(() => {
    function stopOnPageExit() {
      cleanupRecognition()
    }

    window.addEventListener('pagehide', stopOnPageExit)
    window.addEventListener('beforeunload', stopOnPageExit)

    return () => {
      window.removeEventListener('pagehide', stopOnPageExit)
      window.removeEventListener('beforeunload', stopOnPageExit)
      cleanupRecognition()
    }
  }, [cleanupRecognition])

  return (
    <form onSubmit={handleSubmit} className="capture-form form-stack">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="capture_intent" value={captureIntent} />
      <input type="hidden" name="manual_type" value={manualType} />
      <input type="hidden" name="transcript_status" value={transcriptStatus} />
      <input type="hidden" name="note_source" value={noteSource} />
      {selectedSourceDocument ? (
        <>
          <input type="hidden" name="source_document_type" value={selectedSourceDocument.type} />
          <input type="hidden" name="source_document_label" value={selectedSourceDocument.label} />
        </>
      ) : null}
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
      {saveMessage ? <p className="success">{saveMessage}</p> : null}

      <div className="source-document-shortcuts field-stack">
        <div>
          <p className="eyebrow">Source Document</p>
          <p className="muted capture-upload-hint">
            Source documents help CRED fill in report details. Capture them whenever it fits your workflow.
          </p>
          <p className="muted capture-upload-hint">CRED organizes it later.</p>
        </div>
        <div className="source-document-chip-row" aria-label="Source document shortcuts">
          {SOURCE_DOCUMENT_OPTIONS.map((option) => {
            const selected = selectedSourceDocument?.type === option.type

            return (
              <button
                key={option.type}
                type="button"
                className={selected ? 'source-document-chip active' : 'source-document-chip'}
                aria-pressed={selected}
                onClick={() =>
                  setSourceDocumentType((current) =>
                    current === option.type ? null : option.type,
                  )
                }
                disabled={isSaving || hasActiveUploads}
              >
                {option.label}
              </button>
            )
          })}
        </div>
        {selectedSourceDocument ? (
          <div className="selected-source-document-row">
            <span className="classification-pill pending">
              Source Document: {selectedSourceDocument.label}
            </span>
            <button
              type="button"
              className="secondary-link"
              onClick={() => setSourceDocumentType(null)}
              disabled={isSaving || hasActiveUploads}
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>

      <div className="camera-first-panel">
        <button
          type="button"
          className="capture-evidence-button touch-target"
          onClick={openEvidencePicker}
          disabled={isSaving || hasActiveUploads}
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
          disabled={isSaving || hasActiveUploads}
        />
        {selectedFiles.length > 0 ? (
          <div className="selected-evidence-list">
            <strong>
              {selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'} in this upload
            </strong>
            {selectedFiles.map((file) => (
              <span key={file.id}>
                {file.name} — {getUploadStatusLabel(file.status, file.error)}
              </span>
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
                    {selectedSourceDocument ? (
                      <p className="muted">
                        Source Document: {selectedSourceDocument.label}
                      </p>
                    ) : null}
                  </div>
                  <span className="ai-status-pill draft-status-pill">
                    {getUploadStatusLabel(file.status, file.error)}
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
                      {note.trim() || 'Add note before saving'}
                    </span>
                  </div>
                </div>

                <div className="draft-evidence-preview-footer">
                  <span className="muted draft-evidence-filename">
                    {file.name}
                  </span>
                  {file.status === 'failed' ? (
                    <>
                      <button
                        type="submit"
                        className="secondary-link"
                        disabled={isSaving || hasActiveUploads}
                      >
                        Retry failed upload
                      </button>
                      <button
                        type="button"
                        className="secondary-link danger-link"
                        onClick={() => removeSelectedFile(file.id)}
                        disabled={isSaving || hasActiveUploads}
                      >
                        Remove failed upload
                      </button>
                    </>
                  ) : file.status === 'queued' ? (
                    <button
                      type="button"
                      className="secondary-link danger-link"
                      onClick={() => removeSelectedFile(file.id)}
                      disabled={isSaving || hasActiveUploads}
                    >
                      Remove selected file
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
        <p className="muted capture-upload-hint">
          Maximum file size is {captureSizeLabel} per capture file and {videoSizeLabel} per video. Photos and videos are queued for AI review.
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
          placeholder="Speak or type what matters: location, component, measurement, condition, recommendation."
          onChange={(event) => {
            setNote(event.target.value)
            setNoteSource(noteSource === 'voice' ? 'edited' : 'manual')
            if (voiceNoteStatus === 'listening') {
              stopVoiceNote('Voice note stopped.')
            }
          }}
          rows={4}
        />
        <p className="muted note-helper-text">
          Changes update the note overlay and printable report. Manual typing works even if voice is unavailable.
        </p>
        {isVoiceSupported === false ? (
          <p className="muted capture-upload-hint" role="status">
            Voice notes are not supported in this browser. Type your note instead.
          </p>
        ) : (
          <div className="capture-note-actions" aria-label="Voice note controls">
            <button
              type="button"
              className="button button-secondary touch-target"
              onClick={startVoiceNote}
              disabled={isSaving || hasActiveUploads || voiceNoteStatus === 'listening'}
            >
              Start Voice Note
            </button>
            <button
              type="button"
              className="button button-secondary touch-target"
              onClick={() => stopVoiceNote('Voice note stopped.')}
              disabled={isSaving || voiceNoteStatus !== 'listening'}
              aria-label="Stop Voice Note"
            >
              Stop
            </button>
            <button
              type="button"
              className="button button-secondary touch-target"
              onClick={cancelVoiceNote}
              disabled={isSaving || voiceNoteStatus !== 'listening'}
            >
              Cancel Voice Note
            </button>
            <button
              type="button"
              className="button button-secondary touch-target"
              onClick={clearNote}
              disabled={isSaving || (!note && voiceNoteStatus !== 'listening')}
            >
              Clear Note
            </button>
            <span className="muted" role="status" aria-live="polite">
              {voiceNoteStatus === 'listening'
                ? 'Listening…'
                : voiceNoteStatus === 'denied'
                  ? 'Microphone permission was denied. Type your note instead.'
                  : voiceNoteStatus === 'unsupported'
                    ? 'Voice notes are not supported in this browser. Type your note instead.'
                    : voiceNoteStatus === 'stopped'
                      ? 'Voice note stopped.'
                      : 'Editable before and after saving'}
            </span>
          </div>
        )}
      </div>

      <SubmitButton
        hasFiles={uploadableFiles.length > 0}
        pending={isSaving}
        hasActiveUploads={hasActiveUploads}
        retryOnly={failedFiles.length > 0}
      />

      {stickyDoneHref ? (
        <div className="guided-sticky-actions focused-capture-done-actions">
          <button
            type="button"
            className="button button-primary touch-target"
            onClick={openEvidencePicker}
            disabled={isSaving || hasActiveUploads}
          >
            Capture
          </button>
          {hasActiveUploads || isSaving ? (
            <button type="button" className="button button-secondary touch-target" disabled>
              Done
            </button>
          ) : (
            <Link href={stickyDoneHref} className="button button-secondary touch-target">
              Done
            </Link>
          )}
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
