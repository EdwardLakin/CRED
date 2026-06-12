'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { formatBytes, getPlanLimits, requireActiveBillingAccess } from '@/features/billing'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { recordUsageEvent, requireUsageAllowance } from '@/features/usage'
import {
  buildClassifiedImageData,
  classifyCaptureImage,
  getCaptureClassificationSummary,
  getUnknownClassificationResult,
  type CaptureClassificationResult,
  type CaptureClassificationType,
} from '@/lib/openai/capture-classifier'
import {
  buildExtractedCaptureData,
  extractCaptureImageDetails,
  getCaptureExtractionSummary,
  type CaptureExtractionField,
  type CaptureExtractionResult,
} from '@/lib/openai/capture-extractor'
import type { Json } from '@/lib/supabase/database.types'

import {
  SOURCE_DOCUMENT_LABELS,
  addSourceDocumentMetadata,
  getAutoImageExtractedData,
  getCaptureEventTitle,
  getInitialExtractedData,
  getSourceDocumentMetadata,
  isCaptureIntent,
  isCaptureType,
  isSourceDocumentType,
  type CaptureIntent,
  type CaptureType,
  type SourceDocumentType,
} from './types'

const CAPTURE_BUCKET = 'documentation-captures'

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

type CaptureActionFailure = {
  ok: false
  sessionId?: string
  error: string
}

type CaptureActionSuccess = {
  ok: true
  sessionId: string
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

function getSafeToken(value: string, maxLength = 80) {
  return value
    .replace(/[^a-zA-Z0-9 _/-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function captureError(error: string, sessionId?: string): CaptureActionFailure {
  return { ok: false, sessionId, error }
}

function mimeTypeHasAllowedType(mimeType: string, captureType: CaptureType) {
  const allowedTypes = ALLOWED_MIME_TYPES[captureType]
  return allowedTypes.includes(mimeType)
}

function mimeTypeIsImage(mimeType: string) {
  return ALLOWED_MIME_TYPES.photo.includes(mimeType)
}

function mimeTypeIsVideo(mimeType: string) {
  return ALLOWED_MIME_TYPES.video.includes(mimeType)
}

function getMediaKind(
  mimeType: string,
  captureType: CaptureType,
): 'image' | 'video' | 'audio' | 'document' {
  if (
    mimeTypeIsVideo(mimeType) ||
    captureType === 'video' ||
    captureType === 'evidence_video'
  ) {
    return 'video'
  }

  if (captureType === 'voice_note') {
    return 'audio'
  }

  if (captureType === 'document' && !mimeTypeIsImage(mimeType)) {
    return 'document'
  }

  return 'image'
}

function mergeGuidance(
  extractedData: Json,
  guidance: { workflow: string; step: string; label: string } | null,
): Json {
  if (!guidance) {
    return extractedData
  }

  const existingObject = isRecord(extractedData) ? extractedData : {}

  return {
    ...existingObject,
    guidance,
  }
}

function getCaptureMetadata(
  captureIntent: CaptureIntent,
  manualCaptureType: CaptureType | null,
  sourceDocument: { type: SourceDocumentType; label: string } | null = null,
) {
  if (captureIntent === 'auto_image' || captureIntent === 'auto_evidence') {
    return {
      type: 'photo' as CaptureType,
      extractedData: getAutoImageExtractedData(),
      timelineTitle: getCaptureEventTitle('photo', 'auto_image'),
      timelineDescription: sourceDocument
        ? `${sourceDocument.label} source document captured for report detail extraction.`
        : 'Evidence captured for AI classification.',
    }
  }

  if (!manualCaptureType) {
    return null
  }

  return {
    type: manualCaptureType,
    extractedData: getInitialExtractedData(manualCaptureType),
    timelineTitle: sourceDocument
      ? `${sourceDocument.label} captured`
      : getCaptureEventTitle(manualCaptureType, 'manual'),
    timelineDescription: sourceDocument
      ? `${sourceDocument.label} source document captured for report detail extraction.`
      : 'Capture uploaded manually.',
  }
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


export async function validateCaptureBillingAccess(
  sessionId: string,
  files: { size: number; mimeType: string }[] = [],
): Promise<CaptureActionFailure | CaptureActionSuccess> {
  const trimmedSessionId = sessionId.trim()

  if (!trimmedSessionId) {
    return captureError('Missing documentation session.')
  }

  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    return captureError(billingAccess.message, trimmedSessionId)
  }

  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('id')
    .eq('id', trimmedSessionId)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) {
    return captureError('Documentation session not found.', trimmedSessionId)
  }

  for (const file of files) {
    const size = Number(file.size)
    const mimeType = file.mimeType.trim().toLowerCase()
    const isVideoUpload = mimeTypeIsVideo(mimeType)
    const limits = getPlanLimits(billingAccess.access.plan)
    const maxAllowedFileSize = isVideoUpload ? limits.maxVideoFileSizeBytes : limits.maxCaptureFileSizeBytes

    if (!Number.isFinite(size) || size <= 0) {
      return captureError('One selected file is empty. Choose another file.', session.id)
    }

    if (size > maxAllowedFileSize) {
      return captureError(
        `This file is larger than your plan allows. Maximum file size is ${formatBytes(maxAllowedFileSize)}.`,
        session.id,
      )
    }
  }

  const totalUploadBytes = files.reduce((total, file) => total + Number(file.size || 0), 0)

  if (totalUploadBytes > 0) {
    const storageAllowance = await requireUsageAllowance({
      supabase,
      organizationId: profile.organization_id,
      plan: billingAccess.access.plan,
      eventType: 'storage_bytes_added',
      quantity: totalUploadBytes,
    })

    if (!storageAllowance.ok) {
      return captureError(storageAllowance.message, session.id)
    }
  }

  return { ok: true, sessionId: session.id }
}

export type CreateUploadedCaptureRecordInput = {
  sessionId: string
  storagePath: string
  filename: string
  mimeType: string
  size: number
  captureIntent: CaptureIntent
  manualType?: CaptureType | null
  guidedStep?: string
  guidedLabel?: string
  workflow?: string
  technicianNote?: string
  transcriptStatus?:
    | 'not_started'
    | 'pending'
    | 'completed'
    | 'failed'
    | 'unavailable'
  noteSource?: 'manual' | 'voice' | 'edited'
  reportOrder?: number | null
  includeInReport?: boolean
  sourceDocumentType?: SourceDocumentType | null
  sourceDocumentLabel?: string | null
  source_document_type?: string | null
  source_document_label?: string | null
}

export type CreateUploadedCaptureRecordResult =
  | CaptureActionFailure
  | (CaptureActionSuccess & { captureItemId: string })

function uploadedStoragePathIsScoped(
  storagePath: string,
  organizationId: string,
  sessionId: string,
) {
  return storagePath.startsWith(
    `organizations/${organizationId}/sessions/${sessionId}/captures/`,
  )
}

function getUploadFileMetadata(
  extractedData: Json,
  file: { filename: string; mimeType: string; size: number },
): Json {
  const existingObject = isRecord(extractedData) ? extractedData : {}

  return {
    ...existingObject,
    upload: {
      filename: file.filename,
      mime_type: file.mimeType,
      size: file.size,
    },
  }
}

async function removeUploadedObject(
  supabase: Awaited<ReturnType<typeof requireSessionWorkspace>>['supabase'],
  storagePath: string,
) {
  const { error } = await supabase.storage
    .from(CAPTURE_BUCKET)
    .remove([storagePath])

  if (error) {
    logCaptureFailure({
      step: 'storage_cleanup',
      ...getSafeErrorDetails(error),
    })
  }
}

export async function createCaptureRecordFromUploadedFile(
  input: CreateUploadedCaptureRecordInput,
): Promise<CreateUploadedCaptureRecordResult> {
  const sessionId = input.sessionId.trim()
  const storagePath = input.storagePath.trim()
  const filename = input.filename.trim().slice(0, 255)
  const mimeType = input.mimeType.trim().toLowerCase()
  const size = Number(input.size)
  const rawCaptureIntent = input.captureIntent || 'auto_evidence'
  const guidedStep = getSafeToken(input.guidedStep ?? '')
  const guidedLabel = getSafeToken(input.guidedLabel ?? '', 120)
  const sessionWorkflow = getSafeToken(input.workflow ?? '')
  const technicianNote = (input.technicianNote ?? '').trim().slice(0, 2000)
  const transcriptStatus =
    input.transcriptStatus &&
    ['pending', 'completed', 'failed', 'unavailable'].includes(
      input.transcriptStatus,
    )
      ? input.transcriptStatus
      : 'not_started'
  const noteSource =
    input.noteSource && ['voice', 'manual', 'edited'].includes(input.noteSource)
      ? input.noteSource
      : 'manual'
  const rawSourceDocumentType =
    input.sourceDocumentType?.trim() ?? input.source_document_type?.trim() ?? ''
  const sourceDocumentType = rawSourceDocumentType
    ? isSourceDocumentType(rawSourceDocumentType)
      ? rawSourceDocumentType
      : null
    : null
  const sourceDocumentLabel = sourceDocumentType
    ? (
        input.sourceDocumentLabel?.trim() ||
        input.source_document_label?.trim() ||
        SOURCE_DOCUMENT_LABELS[sourceDocumentType]
      ).slice(0, 80)
    : null

  if (!sessionId) {
    return captureError('Missing documentation session.')
  }

  if (!storagePath || !filename || !mimeType) {
    return captureError('Missing uploaded file metadata.', sessionId)
  }

  if (!Number.isFinite(size) || size <= 0) {
    return captureError(
      'Uploaded file is empty. Choose another file.',
      sessionId,
    )
  }

  if (!isCaptureIntent(rawCaptureIntent)) {
    return captureError('Choose a valid capture mode.', sessionId)
  }

  if (rawSourceDocumentType && !sourceDocumentType) {
    return captureError('Choose a valid source document type.', sessionId)
  }

  const sourceDocument = sourceDocumentType && sourceDocumentLabel
    ? { type: sourceDocumentType, label: sourceDocumentLabel }
    : null

  const manualCaptureType =
    input.manualType && isCaptureType(input.manualType)
      ? input.manualType
      : null
  const captureMetadata = getCaptureMetadata(
    rawCaptureIntent,
    manualCaptureType,
    sourceDocument,
  )

  if (!captureMetadata) {
    return captureError('Choose a valid manual capture type.', sessionId)
  }

  const captureType = captureMetadata.type
  const guidance =
    guidedStep && guidedLabel && sessionWorkflow
      ? { workflow: sessionWorkflow, step: guidedStep, label: guidedLabel }
      : null

  if (
    (rawCaptureIntent === 'auto_image' ||
      rawCaptureIntent === 'auto_evidence') &&
    !mimeTypeIsImage(mimeType) &&
    !mimeTypeIsVideo(mimeType)
  ) {
    return captureError(
      'Capture Evidence accepts photo or video files only.',
      sessionId,
    )
  }

  if (
    rawCaptureIntent === 'manual' &&
    !mimeTypeHasAllowedType(mimeType, captureType)
  ) {
    return captureError(
      'That file type is not allowed for this capture.',
      sessionId,
    )
  }

  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    return captureError(billingAccess.message, sessionId)
  }

  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('id, organization_id')
    .eq('id', sessionId)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) {
    return captureError('Documentation session not found.', sessionId)
  }

  const limits = getPlanLimits(billingAccess.access.plan)
  const isVideoUpload = mimeTypeIsVideo(mimeType) || captureType === 'video' || captureType === 'evidence_video'
  const maxAllowedFileSize = isVideoUpload ? limits.maxVideoFileSizeBytes : limits.maxCaptureFileSizeBytes

  if (size > maxAllowedFileSize) {
    return captureError(
      `This file is larger than your plan allows. Maximum file size is ${formatBytes(maxAllowedFileSize)}.`,
      session.id,
    )
  }

  const fileSizeAllowance = await requireUsageAllowance({
    supabase,
    organizationId: profile.organization_id,
    plan: billingAccess.access.plan,
    eventType: 'storage_bytes_added',
    quantity: size,
    fileSizeBytes: size,
    isVideo: isVideoUpload,
  })

  if (!fileSizeAllowance.ok) {
    return captureError(fileSizeAllowance.message, session.id)
  }

  if (
    !uploadedStoragePathIsScoped(
      storagePath,
      profile.organization_id,
      session.id,
    )
  ) {
    return captureError(
      'Uploaded file path is not valid for this session.',
      session.id,
    )
  }

  const capturedAt = new Date().toISOString()
  const itemCaptureType =
    rawCaptureIntent === 'auto_evidence' && mimeTypeIsVideo(mimeType)
      ? 'video'
      : captureType
  const itemMediaKind = getMediaKind(mimeType, itemCaptureType)
  const baseExtractedData =
    itemMediaKind === 'video'
      ? getInitialExtractedData('video')
      : captureMetadata.extractedData
  const uploadExtractedData = getUploadFileMetadata(baseExtractedData, { filename, mimeType, size })
  const sourceExtractedData = sourceDocument
    ? addSourceDocumentMetadata(uploadExtractedData, sourceDocument)
    : uploadExtractedData
  const itemExtractedData = mergeGuidance(
    sourceExtractedData,
    guidance,
  )

  const { count: existingCaptureCount } = await supabase
    .from('capture_items')
    .select('id', { count: 'exact', head: true })
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
  const reportOrder =
    input.reportOrder &&
    Number.isInteger(input.reportOrder) &&
    input.reportOrder > 0
      ? input.reportOrder
      : (existingCaptureCount ?? 0) + 1

  const { data: captureItem, error: captureErrorResult } = await supabase
    .from('capture_items')
    .insert({
      documentation_session_id: session.id,
      organization_id: profile.organization_id,
      type: itemCaptureType,
      storage_path: storagePath,
      captured_at: capturedAt,
      ai_status: sourceDocument || itemMediaKind !== 'video' ? 'pending' : 'needs_review',
      extracted_data: itemExtractedData,
      technician_note: technicianNote || null,
      transcript:
        noteSource === 'voice' || noteSource === 'edited'
          ? technicianNote || null
          : null,
      transcript_status: technicianNote
        ? transcriptStatus === 'pending'
          ? 'pending'
          : 'completed'
        : transcriptStatus,
      note_source: technicianNote ? noteSource : 'manual',
      media_kind: itemMediaKind,
      report_order: reportOrder,
      include_in_report: input.includeInReport ?? true,
    })
    .select('id')
    .single()

  if (captureErrorResult || !captureItem) {
    logCaptureFailure({
      step: 'capture_item_insert',
      ...getSafeErrorDetails(captureErrorResult),
    })
    await removeUploadedObject(supabase, storagePath)
    return captureError(
      captureErrorResult?.message ?? 'Unable to save capture metadata.',
      session.id,
    )
  }

  const { error: timelineError } = await supabase
    .from('timeline_events')
    .insert({
      documentation_session_id: session.id,
      organization_id: profile.organization_id,
      capture_item_id: captureItem.id,
      title: sourceDocument
        ? `${sourceDocument.label} captured`
        : captureMetadata.timelineTitle,
      description: sourceDocument
        ? `${sourceDocument.label} source document captured. CRED will use it for report details when extracted.`
        : captureMetadata.timelineDescription,
      event_time: capturedAt,
      event_type: 'capture',
    })

  if (timelineError) {
    logCaptureFailure({
      step: 'timeline_event_insert',
      ...getSafeErrorDetails(timelineError),
    })
    await supabase
      .from('capture_items')
      .delete()
      .eq('id', captureItem.id)
      .eq('organization_id', profile.organization_id)
    await removeUploadedObject(supabase, storagePath)
    return captureError(timelineError.message, session.id)
  }

  try {
    await recordUsageEvent({
      supabase,
      organizationId: profile.organization_id,
      eventType: 'capture_uploaded',
      metadata: { session_id: session.id, capture_id: captureItem.id, filename, mime_type: mimeType, size },
      createdBy: profile.id,
    })
    await recordUsageEvent({
      supabase,
      organizationId: profile.organization_id,
      eventType: 'storage_bytes_added',
      quantity: size,
      metadata: { session_id: session.id, capture_id: captureItem.id, filename, mime_type: mimeType },
      createdBy: profile.id,
    })
  } catch (usageError) {
    logCaptureFailure({
      step: 'capture_usage_event_insert',
      captureId: captureItem.id,
      ...getSafeErrorDetails(usageError),
    })
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/sessions')
  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/capture`)

  return { ok: true, sessionId: session.id, captureItemId: captureItem.id }
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
  extracted_data: Json
  technician_note: string | null
  transcript: string | null
  media_kind: string
}

const MAX_CLASSIFICATION_BATCH_SIZE = 10
const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.7
const SIGNED_CLASSIFICATION_URL_SECONDS = 60 * 5

function classificationActionMessage(
  classifiedCount: number,
  needsReviewCount: number,
) {
  const total = classifiedCount + needsReviewCount

  if (total === 0) {
    return 'No pending captures need classification.'
  }

  const captureWord = total === 1 ? 'capture' : 'captures'
  const reviewSuffix =
    needsReviewCount === 1
      ? '1 needs review.'
      : `${needsReviewCount} need review.`

  return `Classified ${total} ${captureWord}. ${reviewSuffix}`
}

function getClassificationStatus(
  classification: CaptureClassificationResult,
): 'classified' | 'needs_review' {
  return classification.confidence >= CLASSIFICATION_CONFIDENCE_THRESHOLD &&
    classification.detected_type !== 'unknown'
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
      extracted_data: buildClassifiedImageData(
        capture.extracted_data,
        classification,
        status,
      ),
      updated_at: new Date().toISOString(),
    })
    .eq('id', capture.id)
    .eq('documentation_session_id', capture.documentation_session_id)
    .eq('organization_id', capture.organization_id)

  if (error) {
    logCaptureFailure({
      step: 'capture_classification_update',
      captureId: capture.id,
      ...getSafeErrorDetails(error),
    })
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

function getGuidanceContext(extractedData: Json | null) {
  if (!isRecord(extractedData) || !isRecord(extractedData.guidance)) {
    return null
  }

  const workflow =
    typeof extractedData.guidance.workflow === 'string'
      ? extractedData.guidance.workflow
      : null
  const step =
    typeof extractedData.guidance.step === 'string'
      ? extractedData.guidance.step
      : null
  const label =
    typeof extractedData.guidance.label === 'string'
      ? extractedData.guidance.label
      : null

  return workflow && step && label ? { workflow, step, label } : null
}

function captureNeedsClassification(
  capture: PendingCaptureItem & { ai_status: string | null },
) {
  const extractedData = isRecord(capture.extracted_data)
    ? capture.extracted_data
    : null
  const classification =
    extractedData && isRecord(extractedData.classification)
      ? extractedData.classification
      : null
  const classificationStatus =
    typeof classification?.status === 'string' ? classification.status : null

  return (
    capture.ai_status === 'pending' ||
    capture.ai_status === 'needs_review' ||
    classificationStatus === 'pending'
  )
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
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    return { ok: false, message: billingAccess.message }
  }

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
    .select(
      'id, documentation_session_id, organization_id, storage_path, extracted_data, ai_status, technician_note, transcript, media_kind',
    )
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .eq('type', 'photo')
    .order('captured_at', { ascending: true })
    .limit(100)

  if (pendingError) {
    logCaptureFailure({
      step: 'capture_classification_query',
      ...getSafeErrorDetails(pendingError),
    })
    return {
      ok: false,
      message: 'Unable to load pending captures for classification.',
    }
  }

  const pendingCaptures = (capturesForReview ?? [])
    .filter(captureNeedsClassification)
    .slice(0, MAX_CLASSIFICATION_BATCH_SIZE)

  if (pendingCaptures.length === 0) {
    return { ok: true, message: classificationActionMessage(0, 0) }
  }

  const aiAllowance = await requireUsageAllowance({
    supabase,
    organizationId: profile.organization_id,
    plan: billingAccess.access.plan,
    eventType: 'ai_classification',
    quantity: pendingCaptures.length,
  })

  if (!aiAllowance.ok) {
    return { ok: false, message: aiAllowance.message }
  }

  let classifiedCount = 0
  let needsReviewCount = 0

  for (const capture of pendingCaptures) {
    try {
      const { data: signedData, error: signedUrlError } = await supabase.storage
        .from(CAPTURE_BUCKET)
        .createSignedUrl(
          capture.storage_path,
          SIGNED_CLASSIFICATION_URL_SECONDS,
        )

      if (signedUrlError || !signedData?.signedUrl) {
        logCaptureFailure({
          step: 'capture_classification_signed_url',
          captureId: capture.id,
          ...getSafeErrorDetails(signedUrlError),
        })
        await markCaptureNeedsReview(
          capture,
          supabase,
          'Unable to prepare image for classification.',
        )
        needsReviewCount += 1
        continue
      }

      const classification = await classifyCaptureImage(
        signedData.signedUrl,
        getGuidanceContext(capture.extracted_data),
        capture.technician_note ?? capture.transcript ?? null,
      )
      const status = await updateCaptureClassification(
        capture,
        classification,
        supabase,
      )

      if (status === 'classified') {
        classifiedCount += 1
      } else {
        needsReviewCount += 1
      }
    } catch (error) {
      if (isMissingOpenAiKeyError(error)) {
        return {
          ok: false,
          message: 'AI classification is not configured yet.',
        }
      }

      logCaptureFailure({
        step: 'capture_classification_openai',
        captureId: capture.id,
        ...getSafeErrorDetails(error),
      })

      try {
        await markCaptureNeedsReview(
          capture,
          supabase,
          'AI classification failed and needs review.',
        )
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

  if (classifiedCount + needsReviewCount > 0) {
    await recordUsageEvent({
      supabase,
      organizationId: profile.organization_id,
      eventType: 'ai_classification',
      quantity: classifiedCount + needsReviewCount,
      metadata: { session_id: session.id },
      createdBy: profile.id,
    })
  }

  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/capture`)

  return {
    ok: true,
    message: classificationActionMessage(classifiedCount, needsReviewCount),
  }
}

export type CaptureExtractionActionState = {
  ok?: boolean
  message?: string
}

type ExtractionCaptureItem = PendingCaptureItem & {
  type: string
  ai_status: string | null
  technician_note: string | null
  transcript: string | null
  media_kind: string
}

type SuggestedDetail = {
  value: string
  source_capture_id: string
  confidence: number
  reason: string
  source_type: string
  priority: number
  applied?: boolean
}

type SuggestedDetails = Record<string, SuggestedDetail>

type SuggestionCandidate = {
  field: string
  value: string | null
  reason: string
}

const MAX_EXTRACTION_BATCH_SIZE = 10
const EXTRACTION_CONFIDENCE_THRESHOLD = 0.65
const SIGNED_EXTRACTION_URL_SECONDS = 60 * 5
const EXTRACTABLE_CAPTURE_TYPES = [
  'photo',
  'document',
  'video',
  'evidence_video',
]
const EXTRACTABLE_DETECTED_TYPES: CaptureClassificationType[] = [
  'registration',
  'vin_plate',
  'license_plate',
  'unit_number',
  'inspection_sheet',
  'work_order',
  'odometer',
  'hour_meter',
  'info_plate',
  'brake_measurement',
  'tire_tread_measurement',
  'battery_test',
  'battery_condition',
  'fluid_level',
  'defect_photo',
  'general_evidence',
  'supporting_photo',
]
const IMAGE_STORAGE_PATH_PATTERN = /\.(jpe?g|png|webp|gif|heic|heif)$/i

const SOURCE_PRIORITIES: Record<
  string,
  Partial<Record<CaptureExtractionField | 'asset_label', number>>
> = {
  vin_plate: { vin: 100 },
  unit_number: { unit_number: 100, asset_label: 90 },
  registration: {
    vin: 90,
    plate_number: 100,
    customer_name: 85,
    registration_number: 100,
  },
  license_plate: { plate_number: 95 },
  odometer: { odometer: 100 },
  hour_meter: { hour_meter: 100, odometer: 60 },
  info_plate: {
    vin: 85,
    manufacturer: 100,
    model: 100,
    serial_number: 100,
    gvwr: 100,
    gawr_front: 100,
    gawr_rear: 100,
    tire_size: 100,
  },
  work_order: {
    work_order_number: 100,
    customer_name: 75,
    unit_number: 70,
    vin: 65,
  },
  inspection_sheet: { document_type: 80, inspection_date: 80 },
  brake_measurement: {
    component: 80,
    location: 80,
    measurement: 90,
    condition: 80,
    recommendation: 70,
    severity: 70,
  },
  tire_tread_measurement: {
    component: 70,
    location: 80,
    measurement: 90,
    condition: 80,
    recommendation: 70,
    severity: 70,
  },
  battery_test: {
    component: 70,
    measurement: 80,
    condition: 80,
    recommendation: 70,
    severity: 60,
  },
  battery_condition: {
    component: 70,
    condition: 80,
    recommendation: 70,
    severity: 60,
  },
  fluid_level: {
    component: 70,
    location: 60,
    measurement: 70,
    condition: 70,
    recommendation: 60,
    severity: 60,
  },
  defect_photo: {
    component: 70,
    location: 70,
    condition: 80,
    recommendation: 70,
    severity: 70,
  },
}

function extractionActionMessage(
  extractedCount: number,
  suggestionCount: number,
) {
  if (extractedCount === 0) {
    return 'No classified captures are ready for extraction.'
  }

  const captureWord = extractedCount === 1 ? 'capture' : 'captures'
  const suggestionWord = suggestionCount === 1 ? 'suggestion' : 'suggestions'

  return `Extracted details from ${extractedCount} ${captureWord}. ${suggestionCount} session ${suggestionWord} ready.`
}

function getSourceDocumentDetectedType(
  extractedData: Json | null,
): CaptureClassificationType | 'other' | null {
  const sourceDocument = getSourceDocumentMetadata(extractedData)

  if (!sourceDocument) {
    return null
  }

  if (sourceDocument.type === 'licence_plate') {
    return 'license_plate'
  }

  if (sourceDocument.type === 'data_plate') {
    return 'info_plate'
  }

  if (sourceDocument.type === 'other') {
    return 'other'
  }

  return sourceDocument.type
}

function getDetectedType(
  extractedData: Json | null,
): CaptureClassificationType | 'other' | null {
  if (!isRecord(extractedData)) {
    return null
  }

  const sourceDocumentType = getSourceDocumentDetectedType(extractedData)

  if (sourceDocumentType) {
    return sourceDocumentType
  }

  const classification = isRecord(extractedData.classification)
    ? extractedData.classification
    : null
  const detectedType =
    typeof classification?.detected_type === 'string'
      ? classification.detected_type
      : null

  return EXTRACTABLE_DETECTED_TYPES.includes(
    detectedType as CaptureClassificationType,
  )
    ? (detectedType as CaptureClassificationType)
    : null
}

function captureNeedsExtraction(capture: ExtractionCaptureItem) {
  if (
    !EXTRACTABLE_CAPTURE_TYPES.includes(capture.type) ||
    (!getSourceDocumentMetadata(capture.extracted_data) &&
      !['classified', 'needs_review'].includes(capture.ai_status ?? ''))
  ) {
    return false
  }

  if (
    (capture.type === 'document' || capture.media_kind === 'video') &&
    !IMAGE_STORAGE_PATH_PATTERN.test(capture.storage_path)
  ) {
    return false
  }

  const extractedData = isRecord(capture.extracted_data)
    ? capture.extracted_data
    : null
  const extraction =
    extractedData && isRecord(extractedData.extraction)
      ? extractedData.extraction
      : null
  const extractionStatus =
    typeof extraction?.status === 'string' ? extraction.status : null

  return (
    extractionStatus === null ||
    ['not_started', 'pending', 'failed'].includes(extractionStatus)
  )
}

function hasAnyExtractedField(extraction: CaptureExtractionResult) {
  return Object.values(extraction.fields).some(
    (value) => typeof value === 'string' && value.trim().length > 0,
  )
}

function getSuggestionPriority(sourceType: string, field: string) {
  return SOURCE_PRIORITIES[sourceType]?.[field as CaptureExtractionField] ?? 50
}

function getSuggestionCandidates(
  sourceType: string,
  fields: CaptureExtractionResult['fields'],
): SuggestionCandidate[] {
  const candidates: SuggestionCandidate[] = [
    {
      field: 'vin',
      value: fields.vin,
      reason: `Detected from ${sourceType.replace(/_/g, ' ')}`,
    },
    {
      field: 'unit_number',
      value: fields.unit_number,
      reason: `Detected from ${sourceType.replace(/_/g, ' ')}`,
    },
    {
      field: 'asset_label',
      value: fields.asset_label,
      reason: `Detected from ${sourceType.replace(/_/g, ' ')}`,
    },
    {
      field: 'odometer',
      value: fields.odometer,
      reason: `Detected from ${sourceType.replace(/_/g, ' ')}`,
    },
    {
      field: 'customer_name',
      value: fields.customer_name,
      reason: `Detected from ${sourceType.replace(/_/g, ' ')}`,
    },
  ]

  if (
    sourceType === 'unit_number' &&
    !fields.asset_label &&
    fields.unit_number
  ) {
    candidates.push({
      field: 'asset_label',
      value: fields.unit_number,
      reason: 'Detected from unit number decal',
    })
  }

  if (sourceType === 'hour_meter' && fields.hour_meter && !fields.odometer) {
    candidates.push({
      field: 'odometer',
      value: fields.hour_meter,
      reason:
        'Detected from hour meter; no separate session hour field exists yet',
    })
  }

  return candidates
}

function mergeSuggestion(
  existing: SuggestedDetail | undefined,
  next: SuggestedDetail,
) {
  if (!existing) {
    return next
  }

  if (next.confidence < existing.confidence) {
    return existing
  }

  if (next.priority > (existing.priority ?? 0)) {
    return next
  }

  if (
    next.priority === (existing.priority ?? 0) &&
    next.confidence > existing.confidence
  ) {
    return next
  }

  return existing
}

function mergeSessionSuggestions(
  existingSuggestions: Json | null,
  capture: ExtractionCaptureItem,
  detectedType: string,
  extraction: CaptureExtractionResult,
): SuggestedDetails {
  const merged: SuggestedDetails = isRecord(existingSuggestions)
    ? { ...(existingSuggestions as SuggestedDetails) }
    : {}

  for (const candidate of getSuggestionCandidates(
    detectedType,
    extraction.fields,
  )) {
    if (!candidate.value) {
      continue
    }

    const priority = getSuggestionPriority(detectedType, candidate.field)
    const next: SuggestedDetail = {
      value: candidate.value,
      source_capture_id: capture.id,
      confidence: extraction.confidence,
      reason: candidate.reason,
      source_type: detectedType,
      priority,
    }

    merged[candidate.field] = mergeSuggestion(merged[candidate.field], next)
  }

  return merged
}

async function updateCaptureExtraction(
  capture: ExtractionCaptureItem,
  extraction: CaptureExtractionResult,
  supabase: Awaited<ReturnType<typeof requireSessionWorkspace>>['supabase'],
) {
  const status =
    extraction.confidence >= EXTRACTION_CONFIDENCE_THRESHOLD &&
    hasAnyExtractedField(extraction)
      ? 'extracted'
      : 'needs_review'

  const { error } = await supabase
    .from('capture_items')
    .update({
      ai_status: status,
      ai_summary: getCaptureExtractionSummary(extraction),
      extracted_data: buildExtractedCaptureData(
        capture.extracted_data,
        extraction,
        status,
      ),
      updated_at: new Date().toISOString(),
    })
    .eq('id', capture.id)
    .eq('documentation_session_id', capture.documentation_session_id)
    .eq('organization_id', capture.organization_id)

  if (error) {
    logCaptureFailure({
      step: 'capture_extraction_update',
      captureId: capture.id,
      ...getSafeErrorDetails(error),
    })
    throw error
  }

  return status
}

async function markCaptureExtractionFailed(
  capture: ExtractionCaptureItem,
  supabase: Awaited<ReturnType<typeof requireSessionWorkspace>>['supabase'],
  message: string,
) {
  const existingData = isRecord(capture.extracted_data)
    ? capture.extracted_data
    : {}
  const { error } = await supabase
    .from('capture_items')
    .update({
      ai_status: 'needs_review',
      extracted_data: {
        ...existingData,
        extraction: {
          status: 'failed',
          summary: message,
          confidence: 0,
          fields: {},
          notes: [message],
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', capture.id)
    .eq('documentation_session_id', capture.documentation_session_id)
    .eq('organization_id', capture.organization_id)

  if (error) {
    logCaptureFailure({
      step: 'capture_extraction_failure_update',
      captureId: capture.id,
      ...getSafeErrorDetails(error),
    })
  }
}

export async function extractCaptureDetails(
  _previousState: CaptureExtractionActionState,
  formData: FormData,
): Promise<CaptureExtractionActionState> {
  const sessionId = getString(formData, 'session_id')

  if (!sessionId) {
    return { ok: false, message: 'Missing documentation session.' }
  }

  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    return { ok: false, message: billingAccess.message }
  }

  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('id, organization_id, suggested_details')
    .eq('id', sessionId)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) {
    return { ok: false, message: 'Documentation session not found.' }
  }

  const { data: capturesForExtraction, error: capturesError } = await supabase
    .from('capture_items')
    .select(
      'id, documentation_session_id, organization_id, type, storage_path, extracted_data, ai_status, technician_note, transcript, media_kind',
    )
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .in('type', EXTRACTABLE_CAPTURE_TYPES)
    .order('captured_at', { ascending: true })
    .limit(100)

  if (capturesError) {
    logCaptureFailure({
      step: 'capture_extraction_query',
      ...getSafeErrorDetails(capturesError),
    })
    return {
      ok: false,
      message: 'Unable to load classified captures for extraction.',
    }
  }

  const extractableCaptures = (capturesForExtraction ?? [])
    .filter(
      (capture): capture is ExtractionCaptureItem =>
        Boolean(getDetectedType(capture.extracted_data)) &&
        captureNeedsExtraction(capture),
    )
    .slice(0, MAX_EXTRACTION_BATCH_SIZE)

  if (extractableCaptures.length === 0) {
    return {
      ok: false,
      message: 'Classify captures before extracting details.',
    }
  }

  const aiAllowance = await requireUsageAllowance({
    supabase,
    organizationId: profile.organization_id,
    plan: billingAccess.access.plan,
    eventType: 'ai_extraction',
    quantity: extractableCaptures.length,
  })

  if (!aiAllowance.ok) {
    return { ok: false, message: aiAllowance.message }
  }

  let extractedCount = 0
  let suggestedDetails = isRecord(session.suggested_details)
    ? (session.suggested_details as Json)
    : {}

  for (const capture of extractableCaptures) {
    const detectedType = getDetectedType(capture.extracted_data)

    if (!detectedType) {
      continue
    }

    try {
      const { data: signedData, error: signedUrlError } = await supabase.storage
        .from(CAPTURE_BUCKET)
        .createSignedUrl(capture.storage_path, SIGNED_EXTRACTION_URL_SECONDS)

      if (signedUrlError || !signedData?.signedUrl) {
        logCaptureFailure({
          step: 'capture_extraction_signed_url',
          captureId: capture.id,
          ...getSafeErrorDetails(signedUrlError),
        })
        await markCaptureExtractionFailed(
          capture,
          supabase,
          'Unable to prepare image for extraction.',
        )
        continue
      }

      const extraction = await extractCaptureImageDetails(
        signedData.signedUrl,
        detectedType,
        capture.technician_note ?? capture.transcript ?? null,
        getSourceDocumentMetadata(capture.extracted_data),
      )
      const status = await updateCaptureExtraction(
        capture,
        extraction,
        supabase,
      )

      if (status === 'extracted' || status === 'needs_review') {
        extractedCount += 1
        suggestedDetails = mergeSessionSuggestions(
          suggestedDetails,
          capture,
          detectedType,
          extraction,
        )
      }
    } catch (error) {
      if (isMissingOpenAiKeyError(error)) {
        return { ok: false, message: 'AI extraction is not configured yet.' }
      }

      logCaptureFailure({
        step: 'capture_extraction_openai',
        captureId: capture.id,
        ...getSafeErrorDetails(error),
      })
      await markCaptureExtractionFailed(
        capture,
        supabase,
        'AI extraction failed and needs review.',
      )
    }
  }

  const suggestionCount = isRecord(suggestedDetails)
    ? Object.keys(suggestedDetails).length
    : 0

  const { error: suggestionsError } = await supabase
    .from('documentation_sessions')
    .update({
      suggested_details: suggestedDetails,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.id)
    .eq('organization_id', profile.organization_id)

  if (suggestionsError) {
    logCaptureFailure({
      step: 'session_suggestions_update',
      ...getSafeErrorDetails(suggestionsError),
    })
    return {
      ok: false,
      message:
        'Extracted capture details, but could not save session suggestions.',
    }
  }

  if (extractedCount > 0) {
    await recordUsageEvent({
      supabase,
      organizationId: profile.organization_id,
      eventType: 'ai_extraction',
      quantity: extractedCount,
      metadata: { session_id: session.id },
      createdBy: profile.id,
    })
  }

  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/capture`)

  return {
    ok: true,
    message: extractionActionMessage(extractedCount, suggestionCount),
  }
}

type CaptureReviewActionState = {
  ok?: boolean
  message?: string
}

async function getAuthorizedCapture(captureId: string) {
  const { supabase, profile } = await requireSessionWorkspace()
  const { data: capture, error } = await supabase
    .from('capture_items')
    .select('id, documentation_session_id, organization_id, storage_path')
    .eq('id', captureId)
    .eq('organization_id', profile.organization_id)
    .single()

  if (error || !capture) {
    return { supabase, profile, capture: null }
  }

  return { supabase, profile, capture }
}

export async function updateCaptureReview(
  _previousState: CaptureReviewActionState,
  formData: FormData,
): Promise<CaptureReviewActionState> {
  const captureId = getString(formData, 'capture_id')
  const note = getString(formData, 'technician_note').slice(0, 2000)
  const includeInReport = getString(formData, 'include_in_report') === 'on'
  const reportOrderValue = Number(getString(formData, 'report_order'))
  const reportOrder =
    Number.isFinite(reportOrderValue) && reportOrderValue > 0
      ? Math.round(reportOrderValue)
      : null

  if (!captureId) {
    return { ok: false, message: 'Missing capture.' }
  }

  const { supabase, profile, capture } = await getAuthorizedCapture(captureId)
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    return { ok: false, message: billingAccess.message }
  }

  if (!capture) {
    return { ok: false, message: 'Capture not found.' }
  }

  const { error } = await supabase
    .from('capture_items')
    .update({
      technician_note: note || null,
      transcript: note || null,
      transcript_status: note ? 'completed' : 'not_started',
      note_source: 'edited',
      include_in_report: includeInReport,
      report_order: reportOrder,
      updated_at: new Date().toISOString(),
    })
    .eq('id', capture.id)
    .eq('organization_id', profile.organization_id)

  if (error) {
    logCaptureFailure({
      step: 'capture_review_update',
      captureId,
      ...getSafeErrorDetails(error),
    })
    return { ok: false, message: 'Unable to save note.' }
  }

  revalidatePath(`/dashboard/sessions/${capture.documentation_session_id}`)
  revalidatePath(
    `/dashboard/sessions/${capture.documentation_session_id}/capture`,
  )

  return { ok: true, message: 'Saved.' }
}

export async function removeCaptureItem(formData: FormData) {
  const captureId = getString(formData, 'capture_id')

  if (!captureId) {
    return
  }

  const { supabase, profile, capture } = await getAuthorizedCapture(captureId)
  const billingAccess = requireActiveBillingAccess(profile)

  if (!capture) {
    return
  }

  if (!billingAccess.ok) {
    redirect(
      `/dashboard/sessions/${capture.documentation_session_id}?error=${encodeURIComponent(billingAccess.message)}`,
    )
  }

  await supabase
    .from('capture_items')
    .update({
      include_in_report: false,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', capture.id)
    .eq('organization_id', profile.organization_id)

  revalidatePath(`/dashboard/sessions/${capture.documentation_session_id}`)
  revalidatePath(
    `/dashboard/sessions/${capture.documentation_session_id}/capture`,
  )
}
