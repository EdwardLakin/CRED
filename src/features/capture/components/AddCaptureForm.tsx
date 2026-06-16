'use client'

import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui'
import {
  createCaptureRecordFromUploadedFile,
  createTextNoteCaptureRecord,
  updateCaptureItemNote,
  validateCaptureBillingAccess,
} from '@/features/capture/actions'
import {
  type CaptureIntent,
  type CaptureType,
} from '@/features/capture/types'
import { createClient } from '@/lib/supabase/client'

const MAX_BATCH_FILES = 10
const VOICE_NOTE_TIMEOUT_MS = 60_000
const MEDIA_NOTE_AUTOSAVE_DELAY_MS = 800

type UploadStatus = 'queued' | 'uploading' | 'saved' | 'ai_queued' | 'needs_queue_retry' | 'failed'
type DiagnosticEvidenceRole = 'meter_reading_photo' | 'scan_tool_screenshot' | 'connector_photo' | 'wiring_reference' | 'voice_note' | 'technician_note' | 'other'

const DIAGNOSTIC_EVIDENCE_ROLE_OPTIONS: Array<{ value: DiagnosticEvidenceRole; label: string }> = [
  { value: 'meter_reading_photo', label: 'Meter reading photo' },
  { value: 'scan_tool_screenshot', label: 'Scan tool screenshot' },
  { value: 'connector_photo', label: 'Connector photo' },
  { value: 'wiring_reference', label: 'Wiring reference' },
  { value: 'voice_note', label: 'Voice note' },
  { value: 'technician_note', label: 'Technician note' },
  { value: 'other', label: 'Other' },
]

type SelectedEvidenceFile = {
  id: string
  file: File
  name: string
  type: string
  size: number
  previewUrl: string
  status: UploadStatus
  error?: string
  note: string
  captureItemId?: string
  noteSaveStatus?: 'idle' | 'unsaved' | 'saving' | 'saved' | 'failed'
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
  text_note: { accept: '' },
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
  text_note: [],
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
  hasEvidence,
  pending,
  retryOnly,
}: {
  hasEvidence: boolean
  pending: boolean
  retryOnly: boolean
}) {
  return (
    <Button
      type="submit"
      className="button button-primary touch-target"
      disabled={pending || !hasEvidence}
    >
      {pending
        ? 'Saving…'
        : retryOnly
          ? 'Retry failed upload'
          : 'Save general note'}
    </Button>
  )
}

function getUploadStatusLabel(status: UploadStatus, error?: string) {
  if (status === 'uploading') return 'Uploading'
  if (status === 'ai_queued') return 'Saved — AI queued'
  if (status === 'needs_queue_retry') return 'Saved — AI retry needed'
  if (status === 'saved') return 'Saved'
  if (status === 'failed') return error ?? 'Upload failed. Please retry.'
  return 'Queued'
}

function getNoteSaveStatusLabel(status: SelectedEvidenceFile['noteSaveStatus']) {
  if (status === 'unsaved') return 'Unsaved'
  if (status === 'saving') return 'Saving…'
  if (status === 'saved') return 'Saved'
  if (status === 'failed') return 'Save failed'
  return 'Unsaved until media upload completes'
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

  return message || 'Upload failed. Please retry.'
}


export function AddCaptureForm({
  sessionId,
  organizationId,
  guidedStep,
  guidedLabel,
  workflow,
  returnPath,
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
  const uploadStartedFileIdsRef = useRef(new Set<string>())
  const noteAutosaveTimeoutsRef = useRef(new Map<string, number>())
  const [actionError, setActionError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)
  const [captureIntent, setCaptureIntent] =
    useState<CaptureIntent>('auto_evidence')
  const [diagnosticEvidenceRole, setDiagnosticEvidenceRole] = useState<DiagnosticEvidenceRole>('other')
  const manualType: CaptureType = 'document'
  const [preferCameraCapture, setPreferCameraCapture] = useState(true)
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
  const isDiagnosticProcedureAttachment = workflow === 'diagnostic_procedure'
  const activeType =
    captureIntent === 'auto_evidence' || captureIntent === 'auto_image'
      ? 'auto_evidence'
      : manualType
  const fileConfig = useMemo(() => {
    const config = FILE_INPUT_CONFIG[activeType]
    return preferCameraCapture ? config : { accept: config.accept }
  }, [activeType, preferCameraCapture])
  const guidanceKey = guidedStep
    ? `${workflow ?? 'guided'}-${guidedStep}`
    : 'general'
  const fileInputId = `capture-file-${guidanceKey}`
  const supportsMultipleFiles =
    captureIntent === 'auto_evidence' || captureIntent === 'auto_image'
  const captureSizeLabel = maxFileSizeLabel ?? formatFileSize(maxCaptureFileSizeBytes)
  const videoSizeLabel = formatFileSize(maxVideoFileSizeBytes)
  const failedFiles = selectedFiles.filter((file) => file.status === 'failed')
  const uploadableFiles = failedFiles.length > 0 ? failedFiles : selectedFiles.filter((file) => file.status === 'queued')

  function getMaxFileSizeForFile(file: File) {
    return fileIsVideo(file) ? maxVideoFileSizeBytes : maxCaptureFileSizeBytes
  }

  function getFileTooLargeMessage(file: File) {
    return `This file is larger than your plan allows. ${fileIsVideo(file) ? 'Video' : 'Capture'} files can be up to ${formatFileSize(getMaxFileSizeForFile(file))}.`
  }

  useEffect(() => {
    const noteAutosaveTimeouts = noteAutosaveTimeoutsRef.current

    return () => {
      noteAutosaveTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId))
      noteAutosaveTimeouts.clear()
      selectedFilesRef.current.forEach((file) =>
        URL.revokeObjectURL(file.previewUrl),
      )
    }
  }, [])

  function replaceSelectedFiles(files: SelectedEvidenceFile[]) {
    selectedFilesRef.current.forEach((file) =>
      URL.revokeObjectURL(file.previewUrl),
    )
    uploadStartedFileIdsRef.current = new Set(
      files
        .filter((file) => file.status === 'uploading' || file.status === 'saved')
        .map((file) => file.id),
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
      id: `${getSelectedEvidenceFileId(file, index)}-${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`,
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      previewUrl: URL.createObjectURL(file),
      status: 'queued',
      note: '',
      noteSaveStatus: 'idle',
    }))
  }

  function updateSelectedFileStatus(fileId: string, status: UploadStatus, error?: string, captureItemId?: string) {
    setSelectedFiles((currentFiles) => {
      const nextFiles = currentFiles.map((file) =>
        file.id === fileId ? { ...file, status, error, ...(captureItemId ? { captureItemId } : {}) } : file,
      )
      selectedFilesRef.current = nextFiles
      return nextFiles
    })
  }

  function updateSelectedFileNoteStatus(fileId: string, noteSaveStatus: SelectedEvidenceFile['noteSaveStatus']) {
    setSelectedFiles((currentFiles) => {
      const nextFiles = currentFiles.map((file) =>
        file.id === fileId ? { ...file, noteSaveStatus } : file,
      )
      selectedFilesRef.current = nextFiles
      return nextFiles
    })
  }

  async function validateFileSelection() {
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

    const evidenceFiles = buildSelectedEvidenceFiles(files)
    const nextFiles = [...selectedFilesRef.current, ...evidenceFiles]
    selectedFilesRef.current = nextFiles
    setSelectedFiles(nextFiles)
    setClientError(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    if (captureIntent === 'auto_image' || captureIntent === 'auto_evidence') {
      void autoSaveSelectedMedia(evidenceFiles)
    }
  }


  function updateSelectedFileNote(fileId: string, noteValue: string) {
    setSelectedFiles((currentFiles) => {
      const nextFiles = currentFiles.map((file) =>
        file.id === fileId
          ? {
              ...file,
              note: noteValue,
              noteSaveStatus: (file.captureItemId ? 'unsaved' : 'idle') as SelectedEvidenceFile['noteSaveStatus'],
            }
          : file,
      )
      selectedFilesRef.current = nextFiles
      return nextFiles
    })

    scheduleSelectedFileNoteSave(fileId)
  }

  function scheduleSelectedFileNoteSave(fileId: string) {
    const existingTimeout = noteAutosaveTimeoutsRef.current.get(fileId)
    if (existingTimeout) {
      window.clearTimeout(existingTimeout)
    }

    const file = selectedFilesRef.current.find((current) => current.id === fileId)
    if (!file?.captureItemId) return

    const timeoutId = window.setTimeout(() => {
      noteAutosaveTimeoutsRef.current.delete(fileId)
      void saveSelectedFileNote(fileId)
    }, MEDIA_NOTE_AUTOSAVE_DELAY_MS)
    noteAutosaveTimeoutsRef.current.set(fileId, timeoutId)
  }

  async function saveSelectedFileNote(fileId: string) {
    const file = selectedFilesRef.current.find((current) => current.id === fileId)
    if (!file?.captureItemId) return true

    updateSelectedFileNoteStatus(fileId, 'saving')

    const result = await updateCaptureItemNote({
      sessionId,
      captureItemId: file.captureItemId,
      technicianNote: file.note,
    })

    updateSelectedFileNoteStatus(fileId, result.ok ? 'saved' : 'failed')
    return result.ok
  }

  async function flushMediaNoteSaves() {
    noteAutosaveTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    noteAutosaveTimeoutsRef.current.clear()

    const filesNeedingSave = selectedFilesRef.current.filter(
      (file) => file.captureItemId && (file.noteSaveStatus === 'unsaved' || file.noteSaveStatus === 'failed'),
    )

    if (filesNeedingSave.length === 0) return true

    const results = await Promise.all(filesNeedingSave.map((file) => saveSelectedFileNote(file.id)))
    return results.every(Boolean)
  }

  function hasUnsavedMediaNotes() {
    return selectedFilesRef.current.some((file) =>
      file.captureItemId && (file.noteSaveStatus === 'unsaved' || file.noteSaveStatus === 'saving' || file.noteSaveStatus === 'failed'),
    )
  }

  function saveSelectedFileNoteFromButton(fileId: string) {
    const existingTimeout = noteAutosaveTimeoutsRef.current.get(fileId)
    if (existingTimeout) {
      window.clearTimeout(existingTimeout)
      noteAutosaveTimeoutsRef.current.delete(fileId)
    }

    void saveSelectedFileNote(fileId)
      .then((result) => {
        if (!result) setClientError('Could not save one media note. Try again before leaving.')
      })
      .catch(() => {
        updateSelectedFileNoteStatus(fileId, 'failed')
        setClientError('Could not save one media note. Try again before leaving.')
      })
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

  async function openCameraPicker() {
    await flushMediaNoteSaves()
    setCaptureIntent('auto_evidence')
    setPreferCameraCapture(true)
    window.setTimeout(() => fileInputRef.current?.click(), 0)
  }

  async function openGalleryPicker() {
    await flushMediaNoteSaves()
    setCaptureIntent('auto_evidence')
    setPreferCameraCapture(false)
    window.setTimeout(() => fileInputRef.current?.click(), 0)
  }

  function focusTextNote() {
    noteTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    noteTextareaRef.current?.focus({ preventScroll: true })
  }

  function triggerBackgroundProcessing() {
    fetch(`/api/dashboard/sessions/${sessionId}/captures/process`, {
      method: 'POST',
      keepalive: true,
    }).catch((error: unknown) => {
      console.warn('Background capture processing trigger failed', error)
    })
  }

  async function autoSaveSelectedMedia(filesToSave: SelectedEvidenceFile[]) {
    const pendingFiles = filesToSave.filter((file) => {
      if (uploadStartedFileIdsRef.current.has(file.id)) {
        return false
      }

      uploadStartedFileIdsRef.current.add(file.id)
      return true
    })

    if (pendingFiles.length === 0) {
      return
    }

    setActionError(null)
    setSaveMessage(`Uploading ${pendingFiles.length} file${pendingFiles.length === 1 ? '' : 's'} in background…`)

    try {
      const result = await uploadSelectedFiles(pendingFiles)

      if (result.savedCount > 0) {
        cleanupRecognition()
        setSaveMessage(isDiagnosticProcedureAttachment ? `${result.savedCount} attachment${result.savedCount === 1 ? '' : 's'} saved for this procedure step.` : `${result.savedCount} capture${result.savedCount === 1 ? '' : 's'} saved. AI processing will retry if needed.`)
        triggerBackgroundProcessing()
        router.refresh()
      }

      if (result.failedCount > 0) {
        pendingFiles
          .filter((file) => selectedFilesRef.current.find((current) => current.id === file.id)?.status === 'failed')
          .forEach((file) => uploadStartedFileIdsRef.current.delete(file.id))
        setActionError(
          result.savedCount > 0
            ? 'Some files were saved. Failed files are still here — retry them when your connection is better.'
            : 'Upload failed — retry when your connection is better.',
        )
      }
    } finally {
      // Background uploads should not block camera/gallery controls.
    }
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
          technicianNote: selectedFile.note,
          transcriptStatus,
          noteSource,
          reportOrder: null,
          includeInReport: true,
          sourceDocumentType: null,
          sourceDocumentLabel: null,
          diagnosticEvidenceRole: isDiagnosticProcedureAttachment ? diagnosticEvidenceRole : null,
        })

        if (!result.ok) {
          await supabase.storage.from('documentation-captures').remove([storagePath])
          throw new Error(result.error)
        }

        savedCount += 1
        updateSelectedFileStatus(
          selectedFile.id,
          result.processingStatus === 'queued' ? 'ai_queued' : result.processingStatus === 'needs_queue_retry' ? 'needs_queue_retry' : 'saved',
          undefined,
          result.captureItemId,
        )
        const latestFile = selectedFilesRef.current.find((current) => current.id === selectedFile.id)
        if (latestFile?.note && latestFile.note !== selectedFile.note) {
          updateSelectedFileNoteStatus(selectedFile.id, 'unsaved')
          scheduleSelectedFileNoteSave(selectedFile.id)
        } else {
          updateSelectedFileNoteStatus(selectedFile.id, 'saved')
        }
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

  async function saveTextNoteOnly() {
    const result = await createTextNoteCaptureRecord({
      sessionId,
      guidedStep,
      guidedLabel,
      workflow,
      technicianNote: note,
      noteSource,
      reportOrder: null,
      includeInReport: true,
      diagnosticEvidenceRole: isDiagnosticProcedureAttachment ? diagnosticEvidenceRole : null,
    })

    if (!result.ok) {
      setActionError(result.error)
      return false
    }

    cleanupRecognition()
    setSaveMessage('Saved. Keep capturing or tap Done.')
    router.refresh()
    return true
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSavingRef.current || isSaving) {
      return
    }

    if (voiceNoteStatus === 'listening') {
      stopVoiceNote('Voice note stopped.')
      setClientError('Voice note stopped. Review your note, then save evidence.')
      return
    }

    const filesToUpload = uploadableFiles
    const hasTextNote = note.trim().length > 0

    if (filesToUpload.length === 0 && !hasTextNote) {
      setClientError('Choose a file or type a text note to save evidence.')
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
      const result = filesToUpload.length > 0
        ? await uploadSelectedFiles(filesToUpload)
        : { savedCount: (await saveTextNoteOnly()) ? 1 : 0, failedCount: 0 }

      if (result.savedCount > 0 && filesToUpload.length > 0) {
        cleanupRecognition()
        setSaveMessage('Saved. Keep capturing or tap Done.')
        triggerBackgroundProcessing()
        router.refresh()
      }

      if (result.savedCount === 0 && filesToUpload.length === 0) {
        return
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
        setPreferCameraCapture(true)
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

    function warnAboutUnsavedMediaNotes(event: BeforeUnloadEvent) {
      if (!hasUnsavedMediaNotes()) return

      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('pagehide', stopOnPageExit)
    window.addEventListener('beforeunload', stopOnPageExit)
    window.addEventListener('beforeunload', warnAboutUnsavedMediaNotes)

    return () => {
      window.removeEventListener('pagehide', stopOnPageExit)
      window.removeEventListener('beforeunload', stopOnPageExit)
      window.removeEventListener('beforeunload', warnAboutUnsavedMediaNotes)
      cleanupRecognition()
    }
  }, [cleanupRecognition])

  async function handleDoneNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (!hasUnsavedMediaNotes()) return

    event.preventDefault()
    const saved = await flushMediaNoteSaves()
    if (saved && stickyDoneHref) {
      router.push(stickyDoneHref)
      return
    }

    setClientError('Could not save one media note. Try again before leaving.')
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
      {isDiagnosticProcedureAttachment ? (
        <label className="field-stack capture-secondary-panel">
          <span className="label">Evidence role for this step attachment</span>
          <select className="input" value={diagnosticEvidenceRole} onChange={(event) => setDiagnosticEvidenceRole(event.target.value as DiagnosticEvidenceRole)} disabled={isSaving}>
            {DIAGNOSTIC_EVIDENCE_ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      ) : null}

      {clientError || actionError ? (
        <p className="error">{clientError ?? actionError}</p>
      ) : null}
      {saveMessage ? <p className="success">{saveMessage}</p> : null}

      <div className="capture-start-panel field-stack">
        <div>
          <p className="eyebrow">Fast capture</p>
          <h2>Capture evidence</h2>
        </div>
        <div className="capture-primary-action-grid" aria-label="Primary capture actions">
          <button
            type="button"
            className="capture-evidence-button touch-target"
            onClick={openCameraPicker}
            disabled={isSaving}
          >
            <span className="capture-evidence-icon" aria-hidden="true">📷</span>
            <span><strong>Camera</strong><small>Take photo, then add note</small></span>
          </button>
          <button
            type="button"
            className="capture-evidence-button touch-target"
            onClick={openGalleryPicker}
            disabled={isSaving}
          >
            <span className="capture-evidence-icon" aria-hidden="true">🖼️</span>
            <span><strong>Gallery</strong><small>Choose media, then add note</small></span>
          </button>
          <button
            type="button"
            className="capture-evidence-button touch-target"
            onClick={startVoiceNote}
            disabled={isSaving || voiceNoteStatus === 'listening'}
          >
            <span className="capture-evidence-icon" aria-hidden="true">🎙️</span>
            <span><strong>Voice Note</strong><small>Speak context quickly</small></span>
          </button>
          <button
            type="button"
            className="capture-evidence-button touch-target"
            onClick={focusTextNote}
            disabled={isSaving}
          >
            <span className="capture-evidence-icon" aria-hidden="true">✍️</span>
            <span><strong>Text Note</strong><small>Type what matters</small></span>
          </button>
        </div>
      </div>

      <div className="field-stack capture-file-field capture-secondary-panel">
        <label htmlFor={fileInputId} className="label visually-hidden">
          Capture evidence file
        </label>
        <input
          ref={fileInputRef}
          key={`${captureIntent}-${activeType}-${preferCameraCapture ? 'camera' : 'gallery'}`}
          id={fileInputId}
          type="file"
          accept={fileConfig.accept}
          capture={fileConfig.capture}
          multiple={supportsMultipleFiles}
          className="input file-input camera-file-input"
          onChange={validateFileSelection}
          disabled={isSaving}
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
                      <strong>Attached note</strong>
                      <button
                        type="button"
                        className="evidence-note-edit-link"
                        onClick={() => {
                          const input = document.getElementById(`file-note-${file.id}`)
                          input?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          input?.focus({ preventScroll: true })
                        }}
                      >
                        Edit note
                      </button>
                    </div>
                    <span>
                      {file.note.trim() || 'Optional: type a note for this media'}
                    </span>
                  </div>
                </div>

                <label className="field-stack" htmlFor={`file-note-${file.id}`}>
                  <span className="label">Note/caption for this image</span>
                  <textarea
                    id={`file-note-${file.id}`}
                    className="input note-textarea"
                    value={file.note}
                    placeholder="Optional note for only this image."
                    onChange={(event) => updateSelectedFileNote(file.id, event.target.value)}
                    rows={3}
                  />
                  <span
                    className={file.noteSaveStatus === 'failed' ? 'error' : 'muted'}
                    role="status"
                    aria-live="polite"
                  >
                    {getNoteSaveStatusLabel(file.noteSaveStatus)}
                  </span>
                </label>

                <div className="draft-evidence-preview-footer">
                  <span className="muted draft-evidence-filename">
                    {file.name}
                  </span>
                  {file.captureItemId ? (
                    <button
                      type="button"
                      className="secondary-link"
                      onClick={() => saveSelectedFileNoteFromButton(file.id)}
                      disabled={file.noteSaveStatus === 'saving'}
                    >
                      Save this note
                    </button>
                  ) : null}
                  {file.status === 'failed' ? (
                    <>
                      <button
                        type="submit"
                        className="secondary-link"
                        disabled={isSaving}
                      >
                        Retry failed upload
                      </button>
                      <button
                        type="button"
                        className="secondary-link danger-link"
                        onClick={() => removeSelectedFile(file.id)}
                        disabled={isSaving}
                      >
                        Remove failed upload
                      </button>
                    </>
                  ) : file.status === 'queued' ? (
                    <button
                      type="button"
                      className="secondary-link danger-link"
                      onClick={() => removeSelectedFile(file.id)}
                      disabled={isSaving}
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
          Maximum file size is {captureSizeLabel} per capture file and {videoSizeLabel} per video.
        </p>
      </div>

      <div className="field-stack capture-note-composer report-note-editor capture-secondary-panel">
        <label htmlFor={`technician-note-${guidanceKey}`} className="label">
          General note without media
        </label>
        <textarea
          ref={noteTextareaRef}
          id={`technician-note-${guidanceKey}`}
          name="technician_note"
          className="input note-textarea prominent-note-textarea"
          value={note}
          placeholder={isDiagnosticProcedureAttachment ? 'Speak or type step documentation: reading, connector/pin context, scan screenshot context, or technician note.' : 'Speak or type what matters: location, component, measurement, condition, recommendation.'}
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
          {isDiagnosticProcedureAttachment ? 'Use this for text-only or voice-only documentation for the OEM procedure step. Media captions save inside each media card above.' : 'Use this only for text-only evidence, voice-only evidence, or a general note without media. Media captions save inside each media card above.'}
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
              disabled={isSaving || voiceNoteStatus === 'listening'}
            >
              Start
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
        hasEvidence={uploadableFiles.length > 0 || note.trim().length > 0}
        pending={isSaving}
        retryOnly={failedFiles.length > 0}
      />

      {stickyDoneHref ? (
        <div className="guided-sticky-actions focused-capture-done-actions">
          <button
            type="button"
            className="button button-primary touch-target"
            onClick={openCameraPicker}
            disabled={isSaving}
          >
            Camera
          </button>
          {isSaving ? (
            <button type="button" className="button button-secondary touch-target" disabled>
              Done
            </button>
          ) : (
            <Link href={stickyDoneHref} className="button button-secondary touch-target" onClick={handleDoneNavigation}>
              Done
            </Link>
          )}
        </div>
      ) : null}

    </form>
  )
}
