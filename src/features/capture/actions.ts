'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'

import { requireSessionWorkspace } from '@/features/sessions/data'
import {
  buildClassifiedImageData,
  classifyCaptureImage,
  getCaptureClassificationSummary,
  getUnknownClassificationResult,
  type CaptureClassificationResult,
} from '@/lib/openai/capture-classifier'

import {
  getAutoImageExtractedData,
  getCaptureEventTitle,
  getInitialExtractedData,
  isCaptureIntent,
  isCaptureType,
  type CaptureIntent,
  type CaptureType,
} from './types'

const CAPTURE_BUCKET = 'documentation-captures'
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024
const MAX_BATCH_FILES = 10
const FILE_TOO_LARGE_MESSAGE = 'That file is too large. Please upload an image under 15MB.'
const BATCH_UPLOAD_ERROR_MESSAGE = 'Some files could not be uploaded. Please try again.'

const ALLOWED_MIME_TYPES: Record<CaptureType, readonly string[]> = {
  photo: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
  vin_plate: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
  info_plate: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
  document: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
  voice_note: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/aac', 'audio/x-m4a'],
}

export type CaptureActionState = {
  error?: string
}

type CaptureActionFailure = {
  ok: false
  sessionId?: string
  error: string
}

type CaptureActionSuccess = {
  ok: true
  sessionId: string
}

type UploadedCapture = {
  storagePath: string
  captureItemId?: string
}

type SafeFailureDetails = {
  step: string
  fileIndex?: number
  captureId?: string
  code?: string
  message?: string
  details?: string
  hint?: string
}

function getString(formData: FormData, field: string) {
  const value = formData.get(field)
  return typeof value === 'string' ? value.trim() : ''
}

function getUploads(formData: FormData) {
  const files = formData.getAll('files').filter((value): value is File => value instanceof File && value.size > 0)

  if (files.length > 0) {
    return files
  }

  const legacyFile = formData.get('file')
  return legacyFile instanceof File && legacyFile.size > 0 ? [legacyFile] : []
}

function captureError(error: string, sessionId?: string): CaptureActionFailure {
  return { ok: false, sessionId, error }
}

function sanitizeFilename(filename: string) {
  const sanitized = filename
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 96)

  return sanitized || 'capture-file'
}

function fileHasAllowedType(file: File, captureType: CaptureType) {
  const allowedTypes = ALLOWED_MIME_TYPES[captureType]
  return allowedTypes.includes(file.type)
}

function fileIsImage(file: File) {
  return ALLOWED_MIME_TYPES.photo.includes(file.type)
}

function getCaptureMetadata(captureIntent: CaptureIntent, manualCaptureType: CaptureType | null) {
  if (captureIntent === 'auto_image') {
    return {
      type: 'photo' as CaptureType,
      extractedData: getAutoImageExtractedData(),
      timelineTitle: getCaptureEventTitle('photo', 'auto_image'),
      timelineDescription: 'Image captured for AI classification.',
    }
  }

  if (!manualCaptureType) {
    return null
  }

  return {
    type: manualCaptureType,
    extractedData: getInitialExtractedData(manualCaptureType),
    timelineTitle: getCaptureEventTitle(manualCaptureType, 'manual'),
    timelineDescription: 'Capture uploaded manually.',
  }
}

function getUploadErrorMessage(errorMessage: string) {
  const lowerMessage = errorMessage.toLowerCase()
  const setupHint = lowerMessage.includes('bucket')
    ? ' The documentation-captures storage bucket may not be set up yet.'
    : ''
  const sizeHint = lowerMessage.includes('size') || lowerMessage.includes('large') ? ` ${FILE_TOO_LARGE_MESSAGE}` : ''
  return `Unable to upload capture.${setupHint}${sizeHint}`
}

function getSafeErrorDetails(error: unknown) {
  if (!error || typeof error !== 'object') {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  const record = error as Record<string, unknown>
  return {
    code: typeof record.code === 'string' ? record.code : undefined,
    message: typeof record.message === 'string' ? record.message : undefined,
    details: typeof record.details === 'string' ? record.details : undefined,
    hint: typeof record.hint === 'string' ? record.hint : undefined,
  }
}

function logCaptureFailure(details: SafeFailureDetails) {
  console.error('Capture batch upload failed', details)
}

async function cleanupBatch(
  uploadedCaptures: UploadedCapture[],
  supabase: Awaited<ReturnType<typeof requireSessionWorkspace>>['supabase'],
) {
  const captureItemIds = uploadedCaptures.flatMap((capture) => (capture.captureItemId ? [capture.captureItemId] : []))
  const storagePaths = uploadedCaptures.map((capture) => capture.storagePath)

  if (captureItemIds.length > 0) {
    await supabase.from('timeline_events').delete().in('capture_item_id', captureItemIds)
    await supabase.from('capture_items').delete().in('id', captureItemIds)
  }

  if (storagePaths.length > 0) {
    await supabase.storage.from(CAPTURE_BUCKET).remove(storagePaths)
  }
}

async function saveCapture(formData: FormData): Promise<CaptureActionFailure | CaptureActionSuccess> {
  const sessionId = getString(formData, 'session_id')
  const rawCaptureIntent = getString(formData, 'capture_intent') || 'auto_image'
  const rawManualCaptureType = getString(formData, 'manual_type')
  const files = getUploads(formData)

  if (!sessionId) {
    return captureError('Missing documentation session.')
  }

  if (!isCaptureIntent(rawCaptureIntent)) {
    return captureError('Choose a valid capture mode.', sessionId)
  }

  const manualCaptureType = isCaptureType(rawManualCaptureType) ? rawManualCaptureType : null
  const captureMetadata = getCaptureMetadata(rawCaptureIntent, manualCaptureType)

  if (!captureMetadata) {
    return captureError('Choose a valid manual capture type.', sessionId)
  }

  const captureType = captureMetadata.type

  if (files.length === 0) {
    return captureError('Choose at least one file to upload.', sessionId)
  }

  if (files.length > MAX_BATCH_FILES) {
    return captureError(`Upload up to ${MAX_BATCH_FILES} files at a time.`, sessionId)
  }

  if (rawCaptureIntent === 'manual' && files.length > 1) {
    return captureError('Advanced manual uploads support one file at a time.', sessionId)
  }

  for (const [fileIndex, file] of files.entries()) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return captureError(FILE_TOO_LARGE_MESSAGE, sessionId)
    }

    if (rawCaptureIntent === 'auto_image' && !fileIsImage(file)) {
      return captureError('Capture Evidence accepts image files only.', sessionId)
    }

    if (rawCaptureIntent === 'manual' && !fileHasAllowedType(file, captureType)) {
      return captureError('That file type is not allowed for this capture.', sessionId)
    }

    if (file.size === 0) {
      return captureError(`File ${fileIndex + 1} is empty. Choose another file.`, sessionId)
    }
  }

  const { supabase, profile } = await requireSessionWorkspace()
  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('id, organization_id')
    .eq('id', sessionId)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) {
    return captureError('Documentation session not found.', sessionId)
  }

  const uploadedCaptures: UploadedCapture[] = []

  for (const [fileIndex, file] of files.entries()) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safeFilename = sanitizeFilename(file.name)
    const storagePath = `organizations/${profile.organization_id}/sessions/${session.id}/captures/${timestamp}-${crypto.randomUUID()}-${safeFilename}`
    uploadedCaptures.push({ storagePath })

    const { error: uploadError } = await supabase.storage.from(CAPTURE_BUCKET).upload(storagePath, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    })

    if (uploadError) {
      logCaptureFailure({ step: 'storage_upload', fileIndex, ...getSafeErrorDetails(uploadError) })
      await cleanupBatch(uploadedCaptures, supabase)
      const errorMessage = files.length === 1 ? getUploadErrorMessage(uploadError.message) : BATCH_UPLOAD_ERROR_MESSAGE
      return captureError(errorMessage, session.id)
    }

    const capturedAt = new Date().toISOString()
    const { data: captureItem, error: captureErrorResult } = await supabase
      .from('capture_items')
      .insert({
        documentation_session_id: session.id,
        organization_id: profile.organization_id,
        type: captureType,
        storage_path: storagePath,
        captured_at: capturedAt,
        ai_status: 'pending',
        extracted_data: captureMetadata.extractedData,
      })
      .select('id')
      .single()

    if (captureErrorResult || !captureItem) {
      logCaptureFailure({ step: 'capture_item_insert', fileIndex, ...getSafeErrorDetails(captureErrorResult) })
      await cleanupBatch(uploadedCaptures, supabase)
      const errorMessage = files.length === 1 ? captureErrorResult?.message ?? 'Unable to save capture metadata.' : BATCH_UPLOAD_ERROR_MESSAGE
      return captureError(errorMessage, session.id)
    }

    uploadedCaptures[fileIndex].captureItemId = captureItem.id

    const { error: timelineError } = await supabase.from('timeline_events').insert({
      documentation_session_id: session.id,
      organization_id: profile.organization_id,
      capture_item_id: captureItem.id,
      title: captureMetadata.timelineTitle,
      description: captureMetadata.timelineDescription,
      event_time: capturedAt,
      event_type: 'capture',
    })

    if (timelineError) {
      logCaptureFailure({ step: 'timeline_event_insert', fileIndex, ...getSafeErrorDetails(timelineError) })
      await cleanupBatch(uploadedCaptures, supabase)
      const errorMessage = files.length === 1 ? timelineError.message : BATCH_UPLOAD_ERROR_MESSAGE
      return captureError(errorMessage, session.id)
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/sessions')
  revalidatePath(`/dashboard/sessions/${session.id}`)

  return { ok: true, sessionId: session.id }
}

export async function createCapture(_previousState: CaptureActionState, formData: FormData): Promise<CaptureActionState> {
  try {
    const result = await saveCapture(formData)

    if (!result.ok) {
      return { error: result.error }
    }

    redirect(`/dashboard/sessions/${result.sessionId}?captureSaved=1`)
  } catch (error) {
    if (isRedirectError(error)) {
      throw error
    }

    console.error('Capture upload failed', error)
    return { error: 'Unable to upload capture. Please try again.' }
  }
}


export type CaptureClassificationActionState = {
  ok?: boolean
  message?: string
}

type PendingCaptureItem = {
  id: string
  documentation_session_id: string
  organization_id: string
  storage_path: string
  extracted_data: import('@/lib/supabase/database.types').Json
}

const MAX_CLASSIFICATION_BATCH_SIZE = 10
const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.7
const SIGNED_CLASSIFICATION_URL_SECONDS = 60 * 5

function classificationActionMessage(classifiedCount: number, needsReviewCount: number) {
  const total = classifiedCount + needsReviewCount

  if (total === 0) {
    return 'No pending captures need classification.'
  }

  const captureWord = total === 1 ? 'capture' : 'captures'
  const reviewSuffix = needsReviewCount === 1 ? '1 needs review.' : `${needsReviewCount} need review.`

  return `Classified ${total} ${captureWord}. ${reviewSuffix}`
}

function getClassificationStatus(classification: CaptureClassificationResult): 'classified' | 'needs_review' {
  return classification.confidence >= CLASSIFICATION_CONFIDENCE_THRESHOLD && classification.detected_type !== 'unknown'
    ? 'classified'
    : 'needs_review'
}

async function updateCaptureClassification(
  capture: PendingCaptureItem,
  classification: CaptureClassificationResult,
  supabase: Awaited<ReturnType<typeof requireSessionWorkspace>>['supabase'],
) {
  const status = getClassificationStatus(classification)
  const { error } = await supabase
    .from('capture_items')
    .update({
      ai_status: status,
      ai_summary: getCaptureClassificationSummary(classification),
      extracted_data: buildClassifiedImageData(capture.extracted_data, classification, status),
      updated_at: new Date().toISOString(),
    })
    .eq('id', capture.id)
    .eq('documentation_session_id', capture.documentation_session_id)
    .eq('organization_id', capture.organization_id)

  if (error) {
    logCaptureFailure({ step: 'capture_classification_update', captureId: capture.id, ...getSafeErrorDetails(error) })
    throw error
  }

  return status
}

async function markCaptureNeedsReview(
  capture: PendingCaptureItem,
  supabase: Awaited<ReturnType<typeof requireSessionWorkspace>>['supabase'],
  reason: string,
) {
  const classification = getUnknownClassificationResult(reason)
  await updateCaptureClassification(capture, classification, supabase)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function captureNeedsClassification(capture: PendingCaptureItem & { ai_status: string | null }) {
  const extractedData = isRecord(capture.extracted_data) ? capture.extracted_data : null
  const classification = extractedData && isRecord(extractedData.classification) ? extractedData.classification : null
  const classificationStatus = typeof classification?.status === 'string' ? classification.status : null

  return capture.ai_status === 'pending' || capture.ai_status === 'needs_review' || classificationStatus === 'pending'
}

function isMissingOpenAiKeyError(error: unknown) {
  return error instanceof Error && error.message === 'OPENAI_API_KEY_MISSING'
}

export async function classifyPendingCaptures(
  _previousState: CaptureClassificationActionState,
  formData: FormData,
): Promise<CaptureClassificationActionState> {
  const sessionId = getString(formData, 'session_id')

  if (!sessionId) {
    return { ok: false, message: 'Missing documentation session.' }
  }

  const { supabase, profile } = await requireSessionWorkspace()
  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('id, organization_id')
    .eq('id', sessionId)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) {
    return { ok: false, message: 'Documentation session not found.' }
  }

  const { data: capturesForReview, error: pendingError } = await supabase
    .from('capture_items')
    .select('id, documentation_session_id, organization_id, storage_path, extracted_data, ai_status')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .eq('type', 'photo')
    .order('captured_at', { ascending: true })
    .limit(100)

  if (pendingError) {
    logCaptureFailure({ step: 'capture_classification_query', ...getSafeErrorDetails(pendingError) })
    return { ok: false, message: 'Unable to load pending captures for classification.' }
  }

  const pendingCaptures = (capturesForReview ?? [])
    .filter(captureNeedsClassification)
    .slice(0, MAX_CLASSIFICATION_BATCH_SIZE)

  if (pendingCaptures.length === 0) {
    return { ok: true, message: classificationActionMessage(0, 0) }
  }

  let classifiedCount = 0
  let needsReviewCount = 0

  for (const capture of pendingCaptures) {
    try {
      const { data: signedData, error: signedUrlError } = await supabase.storage
        .from(CAPTURE_BUCKET)
        .createSignedUrl(capture.storage_path, SIGNED_CLASSIFICATION_URL_SECONDS)

      if (signedUrlError || !signedData?.signedUrl) {
        logCaptureFailure({
          step: 'capture_classification_signed_url',
          captureId: capture.id,
          ...getSafeErrorDetails(signedUrlError),
        })
        await markCaptureNeedsReview(capture, supabase, 'Unable to prepare image for classification.')
        needsReviewCount += 1
        continue
      }

      const classification = await classifyCaptureImage(signedData.signedUrl)
      const status = await updateCaptureClassification(capture, classification, supabase)

      if (status === 'classified') {
        classifiedCount += 1
      } else {
        needsReviewCount += 1
      }
    } catch (error) {
      if (isMissingOpenAiKeyError(error)) {
        return { ok: false, message: 'AI classification is not configured yet.' }
      }

      logCaptureFailure({
        step: 'capture_classification_openai',
        captureId: capture.id,
        ...getSafeErrorDetails(error),
      })

      try {
        await markCaptureNeedsReview(capture, supabase, 'AI classification failed and needs review.')
      } catch (updateError) {
        logCaptureFailure({
          step: 'capture_classification_failure_update',
          captureId: capture.id,
          ...getSafeErrorDetails(updateError),
        })
      }

      needsReviewCount += 1
    }
  }

  revalidatePath(`/dashboard/sessions/${session.id}`)

  return { ok: true, message: classificationActionMessage(classifiedCount, needsReviewCount) }
}
