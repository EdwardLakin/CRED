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

function getSafeToken(value: string, maxLength = 80) {
  return value
    .replace(/[^a-zA-Z0-9 _/-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function getSafeReturnPath(value: string, sessionId: string) {
  return value.startsWith(`/dashboard/sessions/${sessionId}`) ? value : `/dashboard/sessions/${sessionId}`
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

function mergeGuidance(extractedData: Json, guidance: { workflow: string; step: string; label: string } | null): Json {
  if (!guidance) {
    return extractedData
  }

  const existingObject = isRecord(extractedData) ? extractedData : {}

  return {
    ...existingObject,
    guidance,
  }
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
  const guidedStep = getSafeToken(getString(formData, 'guided_step'))
  const guidedLabel = getSafeToken(getString(formData, 'guided_label'), 120)
  const sessionWorkflow = getSafeToken(getString(formData, 'session_workflow'))

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
  const guidance = guidedStep && guidedLabel && sessionWorkflow
    ? { workflow: sessionWorkflow, step: guidedStep, label: guidedLabel }
    : null

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
        extracted_data: mergeGuidance(captureMetadata.extractedData, guidance),
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
  revalidatePath(`/dashboard/sessions/${session.id}/capture`)

  return { ok: true, sessionId: session.id }
}

export async function createCapture(_previousState: CaptureActionState, formData: FormData): Promise<CaptureActionState> {
  try {
    const result = await saveCapture(formData)

    if (!result.ok) {
      return { error: result.error }
    }

    const returnPath = getSafeReturnPath(getString(formData, 'return_path'), result.sessionId)
    const separator = returnPath.includes('?') ? '&' : '?'
    redirect(`${returnPath}${separator}captureSaved=1`)
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
  extracted_data: Json
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

function getGuidanceContext(extractedData: Json | null) {
  if (!isRecord(extractedData) || !isRecord(extractedData.guidance)) {
    return null
  }

  const workflow = typeof extractedData.guidance.workflow === 'string' ? extractedData.guidance.workflow : null
  const step = typeof extractedData.guidance.step === 'string' ? extractedData.guidance.step : null
  const label = typeof extractedData.guidance.label === 'string' ? extractedData.guidance.label : null

  return workflow && step && label ? { workflow, step, label } : null
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

      const classification = await classifyCaptureImage(signedData.signedUrl, getGuidanceContext(capture.extracted_data))
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
  revalidatePath(`/dashboard/sessions/${session.id}/capture`)

  return { ok: true, message: classificationActionMessage(classifiedCount, needsReviewCount) }
}

export type CaptureExtractionActionState = {
  ok?: boolean
  message?: string
}

type ExtractionCaptureItem = PendingCaptureItem & {
  type: string
  ai_status: string | null
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
const EXTRACTABLE_CAPTURE_TYPES = ['photo', 'document']
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
  'other_document',
]
const IMAGE_STORAGE_PATH_PATTERN = /\.(jpe?g|png|webp|gif|heic|heif)$/i

const SOURCE_PRIORITIES: Record<string, Partial<Record<CaptureExtractionField | 'asset_label', number>>> = {
  vin_plate: { vin: 100 },
  unit_number: { unit_number: 100, asset_label: 90 },
  registration: { vin: 90, plate_number: 100, customer_name: 85, registration_number: 100 },
  license_plate: { plate_number: 95 },
  odometer: { odometer: 100 },
  hour_meter: { hour_meter: 100, odometer: 60 },
  info_plate: { vin: 85, manufacturer: 100, model: 100, serial_number: 100, gvwr: 100, gawr_front: 100, gawr_rear: 100, tire_size: 100 },
  work_order: { work_order_number: 100, customer_name: 75, unit_number: 70, vin: 65 },
  inspection_sheet: { document_type: 80, inspection_date: 80 },
  other_document: { document_type: 60 },
}

function extractionActionMessage(extractedCount: number, suggestionCount: number) {
  if (extractedCount === 0) {
    return 'No classified captures are ready for extraction.'
  }

  const captureWord = extractedCount === 1 ? 'capture' : 'captures'
  const suggestionWord = suggestionCount === 1 ? 'suggestion' : 'suggestions'

  return `Extracted details from ${extractedCount} ${captureWord}. ${suggestionCount} session ${suggestionWord} ready.`
}

function getDetectedType(extractedData: Json | null): CaptureClassificationType | null {
  if (!isRecord(extractedData)) {
    return null
  }

  const classification = isRecord(extractedData.classification) ? extractedData.classification : null
  const detectedType = typeof classification?.detected_type === 'string' ? classification.detected_type : null

  return EXTRACTABLE_DETECTED_TYPES.includes(detectedType as CaptureClassificationType)
    ? (detectedType as CaptureClassificationType)
    : null
}

function captureNeedsExtraction(capture: ExtractionCaptureItem) {
  if (!EXTRACTABLE_CAPTURE_TYPES.includes(capture.type) || !['classified', 'needs_review'].includes(capture.ai_status ?? '')) {
    return false
  }

  if (capture.type === 'document' && !IMAGE_STORAGE_PATH_PATTERN.test(capture.storage_path)) {
    return false
  }

  const extractedData = isRecord(capture.extracted_data) ? capture.extracted_data : null
  const extraction = extractedData && isRecord(extractedData.extraction) ? extractedData.extraction : null
  const extractionStatus = typeof extraction?.status === 'string' ? extraction.status : null

  return extractionStatus === null || ['not_started', 'pending', 'failed'].includes(extractionStatus)
}

function hasAnyExtractedField(extraction: CaptureExtractionResult) {
  return Object.values(extraction.fields).some((value) => typeof value === 'string' && value.trim().length > 0)
}

function getSuggestionPriority(sourceType: string, field: string) {
  return SOURCE_PRIORITIES[sourceType]?.[field as CaptureExtractionField] ?? 50
}

function getSuggestionCandidates(sourceType: string, fields: CaptureExtractionResult['fields']): SuggestionCandidate[] {
  const candidates: SuggestionCandidate[] = [
    { field: 'vin', value: fields.vin, reason: `Detected from ${sourceType.replace(/_/g, ' ')}` },
    { field: 'unit_number', value: fields.unit_number, reason: `Detected from ${sourceType.replace(/_/g, ' ')}` },
    { field: 'asset_label', value: fields.asset_label, reason: `Detected from ${sourceType.replace(/_/g, ' ')}` },
    { field: 'odometer', value: fields.odometer, reason: `Detected from ${sourceType.replace(/_/g, ' ')}` },
    { field: 'customer_name', value: fields.customer_name, reason: `Detected from ${sourceType.replace(/_/g, ' ')}` },
  ]

  if (sourceType === 'unit_number' && !fields.asset_label && fields.unit_number) {
    candidates.push({ field: 'asset_label', value: fields.unit_number, reason: 'Detected from unit number decal' })
  }

  if (sourceType === 'hour_meter' && fields.hour_meter && !fields.odometer) {
    candidates.push({ field: 'odometer', value: fields.hour_meter, reason: 'Detected from hour meter; no separate session hour field exists yet' })
  }

  return candidates
}

function mergeSuggestion(existing: SuggestedDetail | undefined, next: SuggestedDetail) {
  if (!existing) {
    return next
  }

  if (next.confidence < existing.confidence) {
    return existing
  }

  if (next.priority > (existing.priority ?? 0)) {
    return next
  }

  if (next.priority === (existing.priority ?? 0) && next.confidence > existing.confidence) {
    return next
  }

  return existing
}

function mergeSessionSuggestions(
  existingSuggestions: Json | null,
  capture: ExtractionCaptureItem,
  detectedType: CaptureClassificationType,
  extraction: CaptureExtractionResult,
): SuggestedDetails {
  const merged: SuggestedDetails = isRecord(existingSuggestions) ? { ...(existingSuggestions as SuggestedDetails) } : {}

  for (const candidate of getSuggestionCandidates(detectedType, extraction.fields)) {
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
  const status = extraction.confidence >= EXTRACTION_CONFIDENCE_THRESHOLD && hasAnyExtractedField(extraction) ? 'extracted' : 'needs_review'

  const { error } = await supabase
    .from('capture_items')
    .update({
      ai_status: status,
      ai_summary: getCaptureExtractionSummary(extraction),
      extracted_data: buildExtractedCaptureData(capture.extracted_data, extraction, status),
      updated_at: new Date().toISOString(),
    })
    .eq('id', capture.id)
    .eq('documentation_session_id', capture.documentation_session_id)
    .eq('organization_id', capture.organization_id)

  if (error) {
    logCaptureFailure({ step: 'capture_extraction_update', captureId: capture.id, ...getSafeErrorDetails(error) })
    throw error
  }

  return status
}

async function markCaptureExtractionFailed(
  capture: ExtractionCaptureItem,
  supabase: Awaited<ReturnType<typeof requireSessionWorkspace>>['supabase'],
  message: string,
) {
  const existingData = isRecord(capture.extracted_data) ? capture.extracted_data : {}
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
    logCaptureFailure({ step: 'capture_extraction_failure_update', captureId: capture.id, ...getSafeErrorDetails(error) })
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
    .select('id, documentation_session_id, organization_id, type, storage_path, extracted_data, ai_status')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .in('type', EXTRACTABLE_CAPTURE_TYPES)
    .in('ai_status', ['classified', 'needs_review'])
    .order('captured_at', { ascending: true })
    .limit(100)

  if (capturesError) {
    logCaptureFailure({ step: 'capture_extraction_query', ...getSafeErrorDetails(capturesError) })
    return { ok: false, message: 'Unable to load classified captures for extraction.' }
  }

  const extractableCaptures = (capturesForExtraction ?? [])
    .filter((capture): capture is ExtractionCaptureItem => Boolean(getDetectedType(capture.extracted_data)) && captureNeedsExtraction(capture))
    .slice(0, MAX_EXTRACTION_BATCH_SIZE)

  if (extractableCaptures.length === 0) {
    return { ok: false, message: 'Classify captures before extracting details.' }
  }

  let extractedCount = 0
  let suggestedDetails = isRecord(session.suggested_details) ? (session.suggested_details as Json) : {}

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
        logCaptureFailure({ step: 'capture_extraction_signed_url', captureId: capture.id, ...getSafeErrorDetails(signedUrlError) })
        await markCaptureExtractionFailed(capture, supabase, 'Unable to prepare image for extraction.')
        continue
      }

      const extraction = await extractCaptureImageDetails(signedData.signedUrl, detectedType)
      const status = await updateCaptureExtraction(capture, extraction, supabase)

      if (status === 'extracted' || status === 'needs_review') {
        extractedCount += 1
        suggestedDetails = mergeSessionSuggestions(suggestedDetails, capture, detectedType, extraction)
      }
    } catch (error) {
      if (isMissingOpenAiKeyError(error)) {
        return { ok: false, message: 'AI extraction is not configured yet.' }
      }

      logCaptureFailure({ step: 'capture_extraction_openai', captureId: capture.id, ...getSafeErrorDetails(error) })
      await markCaptureExtractionFailed(capture, supabase, 'AI extraction failed and needs review.')
    }
  }

  const suggestionCount = isRecord(suggestedDetails) ? Object.keys(suggestedDetails).length : 0

  const { error: suggestionsError } = await supabase
    .from('documentation_sessions')
    .update({ suggested_details: suggestedDetails, updated_at: new Date().toISOString() })
    .eq('id', session.id)
    .eq('organization_id', profile.organization_id)

  if (suggestionsError) {
    logCaptureFailure({ step: 'session_suggestions_update', ...getSafeErrorDetails(suggestionsError) })
    return { ok: false, message: 'Extracted capture details, but could not save session suggestions.' }
  }

  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/capture`)

  return { ok: true, message: extractionActionMessage(extractedCount, suggestionCount) }
}
