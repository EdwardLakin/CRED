'use server'

import { revalidatePath } from 'next/cache'

import {
  formatBytes,
  getPlanLimits,
  requireActiveBillingAccess,
} from '@/features/billing'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { queueCaptureAnalysisJobs } from '@/lib/capture-processing/queue'
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
  buildCaptureAiAnalysis,
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

type CaptureActionFailure = {
  ok: false
  sessionId?: string
  error: string
}

type CaptureActionSuccess = {
  ok: true
  sessionId: string
  processingStatus?: 'saved' | 'queued' | 'needs_queue_retry'
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
): 'image' | 'video' | 'audio' | 'document' | 'note' {
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

  if (captureType === 'text_note') {
    return 'note'
  }

  if (captureType === 'document' && !mimeTypeIsImage(mimeType)) {
    return 'document'
  }

  return 'image'
}

function mergeGuidance(
  extractedData: Json,
  guidance: { workflow: string; step: string; label: string; evidenceRole?: DiagnosticEvidenceRole | null } | null,
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
    const maxAllowedFileSize = isVideoUpload
      ? limits.maxVideoFileSizeBytes
      : limits.maxCaptureFileSizeBytes

    if (!Number.isFinite(size) || size <= 0) {
      return captureError(
        'One selected file is empty. Choose another file.',
        session.id,
      )
    }

    if (size > maxAllowedFileSize) {
      return captureError(
        `This file is larger than your plan allows. Maximum file size is ${formatBytes(maxAllowedFileSize)}.`,
        session.id,
      )
    }
  }

  const totalUploadBytes = files.reduce(
    (total, file) => total + Number(file.size || 0),
    0,
  )

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

export type CreateTextNoteCaptureRecordInput = {
  sessionId: string
  guidedStep?: string
  guidedLabel?: string
  workflow?: string
  technicianNote: string
  noteSource?: 'manual' | 'voice' | 'edited'
  reportOrder?: number | null
  includeInReport?: boolean
  diagnosticEvidenceRole?: DiagnosticEvidenceRole | null
}

const DIAGNOSTIC_EVIDENCE_ROLES = new Set(['meter_reading_photo', 'scan_tool_screenshot', 'connector_photo', 'wiring_reference', 'voice_note', 'technician_note', 'other'])

export type DiagnosticEvidenceRole = 'meter_reading_photo' | 'scan_tool_screenshot' | 'connector_photo' | 'wiring_reference' | 'voice_note' | 'technician_note' | 'other'

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
  diagnosticEvidenceRole?: DiagnosticEvidenceRole | null
}

export type CreateUploadedCaptureRecordResult =
  | CaptureActionFailure
  | (CaptureActionSuccess & { captureItemId: string })

export type CreateTextNoteCaptureRecordResult =
  | CaptureActionFailure
  | (CaptureActionSuccess & { captureItemId: string })

function getTextNoteExtractedData(
  noteLength: number,
  guidance: { workflow: string; step: string; label: string; evidenceRole?: DiagnosticEvidenceRole | null } | null,
): Json {
  const baseData = getInitialExtractedData('text_note')
  const baseObject = isRecord(baseData) ? baseData : {}

  return addDiagnosticStepMetadata(
    mergeGuidance(
      {
        ...baseObject,
        note: {
          length: noteLength,
          saved_without_media: true,
        },
      },
      guidance,
    ),
    guidance,
  )
}

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

function addDiagnosticStepMetadata(
  extractedData: Json,
  guidance: { workflow: string; step: string; label: string; evidenceRole?: DiagnosticEvidenceRole | null } | null,
): Json {
  if (!guidance || guidance.workflow !== 'diagnostic_procedure') {
    return extractedData
  }

  const existingObject = isRecord(extractedData) ? extractedData : {}
  return {
    ...existingObject,
    diagnostic_step: {
      workflow: 'diagnostic_procedure',
      step_id: guidance.step,
      label: guidance.label,
      documentation_support_only: true,
      ...(guidance.evidenceRole ? { evidence_role: guidance.evidenceRole } : {}),
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

export async function createTextNoteCaptureRecord(
  input: CreateTextNoteCaptureRecordInput,
): Promise<CreateTextNoteCaptureRecordResult> {
  const sessionId = input.sessionId.trim()
  const guidedStep = getSafeToken(input.guidedStep ?? '')
  const guidedLabel = getSafeToken(input.guidedLabel ?? '', 120)
  const sessionWorkflow = getSafeToken(input.workflow ?? '')
  const technicianNote = input.technicianNote.trim().slice(0, 2000)
  const noteSource =
    input.noteSource && ['voice', 'manual', 'edited'].includes(input.noteSource)
      ? input.noteSource
      : 'manual'
  const evidenceRole = input.diagnosticEvidenceRole && DIAGNOSTIC_EVIDENCE_ROLES.has(input.diagnosticEvidenceRole) ? input.diagnosticEvidenceRole : null
  const guidance =
    guidedStep && guidedLabel && sessionWorkflow
      ? { workflow: sessionWorkflow, step: guidedStep, label: guidedLabel, evidenceRole }
      : null

  if (!sessionId) {
    return captureError('Missing documentation session.')
  }

  if (!technicianNote) {
    return captureError('Type a note before saving text evidence.', sessionId)
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
  const capturedAt = new Date().toISOString()
  const extractedData = getTextNoteExtractedData(
    technicianNote.length,
    guidance,
  )

  const { data: captureItem, error: captureErrorResult } = await supabase
    .from('capture_items')
    .insert({
      documentation_session_id: session.id,
      organization_id: profile.organization_id,
      type: 'text_note',
      storage_path: null,
      captured_at: capturedAt,
      ai_status: 'extracted',
      ai_summary: 'Text note saved as evidence.',
      extracted_data: extractedData,
      technician_note: technicianNote,
      transcript:
        noteSource === 'voice' || noteSource === 'edited'
          ? technicianNote
          : null,
      transcript_status: 'completed',
      note_source: noteSource,
      media_kind: 'note',
      report_order: reportOrder,
      include_in_report: input.includeInReport ?? true,
    })
    .select('id')
    .single()

  if (captureErrorResult || !captureItem) {
    logCaptureFailure({
      step: 'text_note_capture_item_insert',
      ...getSafeErrorDetails(captureErrorResult),
    })
    return captureError(
      captureErrorResult?.message ?? 'Unable to save text note evidence.',
      session.id,
    )
  }

  const { error: timelineError } = await supabase
    .from('timeline_events')
    .insert({
      documentation_session_id: session.id,
      organization_id: profile.organization_id,
      capture_item_id: captureItem.id,
      title: 'Text note captured',
      description: 'Text note saved as evidence without a media upload.',
      event_time: capturedAt,
      event_type: 'capture',
    })

  if (timelineError) {
    logCaptureFailure({
      step: 'text_note_timeline_event_insert',
      ...getSafeErrorDetails(timelineError),
    })
    await supabase
      .from('capture_items')
      .delete()
      .eq('id', captureItem.id)
      .eq('organization_id', profile.organization_id)
    return captureError(timelineError.message, session.id)
  }

  try {
    await recordUsageEvent({
      supabase,
      organizationId: profile.organization_id,
      eventType: 'capture_uploaded',
      metadata: {
        session_id: session.id,
        capture_id: captureItem.id,
        capture_type: 'text_note',
      },
      createdBy: profile.id,
    })
  } catch (usageError) {
    logCaptureFailure({
      step: 'text_note_capture_usage_event_insert',
      captureId: captureItem.id,
      ...getSafeErrorDetails(usageError),
    })
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/sessions')
  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/capture`)
  revalidatePath(`/dashboard/sessions/${session.id}/report`)

  return { ok: true, sessionId: session.id, captureItemId: captureItem.id, processingStatus: 'saved' }
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

  const sourceDocument =
    sourceDocumentType && sourceDocumentLabel
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
  const evidenceRole = input.diagnosticEvidenceRole && DIAGNOSTIC_EVIDENCE_ROLES.has(input.diagnosticEvidenceRole) ? input.diagnosticEvidenceRole : null
  const guidance =
    guidedStep && guidedLabel && sessionWorkflow
      ? { workflow: sessionWorkflow, step: guidedStep, label: guidedLabel, evidenceRole }
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
  const isVideoUpload =
    mimeTypeIsVideo(mimeType) ||
    captureType === 'video' ||
    captureType === 'evidence_video'
  const maxAllowedFileSize = isVideoUpload
    ? limits.maxVideoFileSizeBytes
    : limits.maxCaptureFileSizeBytes

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
  const uploadExtractedData = getUploadFileMetadata(baseExtractedData, {
    filename,
    mimeType,
    size,
  })
  const sourceExtractedData = sourceDocument
    ? addSourceDocumentMetadata(uploadExtractedData, sourceDocument)
    : uploadExtractedData
  const itemExtractedData = addDiagnosticStepMetadata(
    mergeGuidance(sourceExtractedData, guidance),
    guidance,
  )

  const { data: existingCapture, error: existingCaptureError } = await supabase
    .from('capture_items')
    .select('id')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .eq('storage_path', storagePath)
    .is('deleted_at', null)
    .maybeSingle()

  if (existingCaptureError) {
    logCaptureFailure({
      step: 'capture_item_duplicate_check',
      ...getSafeErrorDetails(existingCaptureError),
    })
    return captureError(existingCaptureError.message, session.id)
  }

  if (existingCapture) {
    if (!mimeTypeIsImage(mimeType)) {
      return { ok: true, sessionId: session.id, captureItemId: existingCapture.id, processingStatus: 'saved' }
    }

    try {
      await queueCaptureAnalysisJobs({
        supabase,
        organizationId: profile.organization_id,
        sessionId: session.id,
        captureItemId: existingCapture.id,
        metadata: { filename, mime_type: mimeType, capture_intent: rawCaptureIntent, repaired_duplicate: true },
      })
      return { ok: true, sessionId: session.id, captureItemId: existingCapture.id, processingStatus: 'queued' }
    } catch (queueError) {
      logCaptureFailure({
        step: 'capture_processing_queue_duplicate_repair',
        captureId: existingCapture.id,
        ...getSafeErrorDetails(queueError),
      })
      await supabase
        .from('capture_items')
        .update({ processing_status: 'needs_queue_retry', ai_status: 'needs_review', ai_summary: 'Saved. AI processing needs retry.' })
        .eq('id', existingCapture.id)
        .eq('organization_id', profile.organization_id)
      return { ok: true, sessionId: session.id, captureItemId: existingCapture.id, processingStatus: 'needs_queue_retry' }
    }
  }

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
      ai_status: itemMediaKind === 'image' ? 'queued' : 'needs_review',
      processing_status: itemMediaKind === 'image' ? 'uploaded' : 'needs_review',
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
      captureId: captureItem.id,
      ...getSafeErrorDetails(timelineError),
    })
    // Timeline/audit decoration must not make evidence disappear after the
    // binary object and capture row are durable. Evidence persistence is the
    // source of truth; downstream enrichment can be retried independently.
  }

  if (itemMediaKind === 'image') {
    try {
      await queueCaptureAnalysisJobs({
        supabase,
        organizationId: profile.organization_id,
        sessionId: session.id,
        captureItemId: captureItem.id,
        metadata: { filename, mime_type: mimeType, capture_intent: rawCaptureIntent },
      })
    } catch (queueError) {
      logCaptureFailure({
        step: 'capture_processing_queue_insert',
        captureId: captureItem.id,
        ...getSafeErrorDetails(queueError),
      })
      await supabase
        .from('capture_items')
        .update({ processing_status: 'needs_queue_retry', ai_status: 'needs_review', ai_summary: 'Saved. AI processing needs retry.' })
        .eq('id', captureItem.id)
        .eq('organization_id', profile.organization_id)
      // The file and capture row are durable. Queue repair/backfill will pick this up later.
      return { ok: true, sessionId: session.id, captureItemId: captureItem.id, processingStatus: 'needs_queue_retry' }
    }
  }

  try {
    await recordUsageEvent({
      supabase,
      organizationId: profile.organization_id,
      eventType: 'capture_uploaded',
      metadata: {
        session_id: session.id,
        capture_id: captureItem.id,
        filename,
        mime_type: mimeType,
        size,
      },
      createdBy: profile.id,
    })
    await recordUsageEvent({
      supabase,
      organizationId: profile.organization_id,
      eventType: 'storage_bytes_added',
      quantity: size,
      metadata: {
        session_id: session.id,
        capture_id: captureItem.id,
        filename,
        mime_type: mimeType,
      },
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

  return { ok: true, sessionId: session.id, captureItemId: captureItem.id, processingStatus: itemMediaKind === 'image' ? 'queued' : 'saved' }
}

export type CaptureClassificationActionState = {
  ok?: boolean
  message?: string
}

type PendingCaptureItem = {
  id: string
  documentation_session_id: string
  organization_id: string
  storage_path: string | null
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
    return 'No pending captures need processing.'
  }

  const captureWord = total === 1 ? 'capture' : 'captures'
  const reviewSuffix =
    needsReviewCount === 1
      ? '1 needs review.'
      : `${needsReviewCount} need review.`

  return `Processed ${total} ${captureWord}. ${reviewSuffix}`
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
  const analyzedAt = new Date().toISOString()

  const { error } = await supabase
    .from('capture_items')
    .update({
      ai_status: status,
      ai_summary: getCaptureClassificationSummary(classification),
      capture_ai_analysis: {
        classification: classification.detected_type,
        confidence: classification.confidence,
        extracted_text: null,
        extracted_values: {},
        generated_note: null,
        generated_observation: null,
        generated_recommendation: null,
        ai_status: status,
        analyzed_at: analyzedAt,
      },
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
): capture is PendingCaptureItem & {
  ai_status: string | null
  storage_path: string
} {
  if (!capture.storage_path) return false
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

function mergeProcessingState(
  extractedData: Json | null,
  processing: Record<string, Json>,
): Json {
  const existingObject = isRecord(extractedData) ? extractedData : {}
  return {
    ...existingObject,
    processing: {
      ...(isRecord(existingObject.processing) ? existingObject.processing : {}),
      ...processing,
    },
  }
}

async function updateCaptureProcessingState(
  capture: PendingCaptureItem,
  supabase: Awaited<ReturnType<typeof requireSessionWorkspace>>['supabase'],
  status:
    | 'pending'
    | 'processing'
    | 'extracted'
    | 'needs_review'
    | 'failed'
    | 'blocked_by_limit',
  stage: string,
  message?: string,
) {
  const now = new Date().toISOString()
  const processing: Record<string, Json> = {
    status,
    stage,
    ...(status === 'processing' ? { started_at: now } : { completed_at: now }),
    ...(message ? { error_message: message } : {}),
  }

  const { error } = await supabase
    .from('capture_items')
    .update({
      ai_status: status === 'pending' ? 'pending' : status,
      extracted_data: mergeProcessingState(capture.extracted_data, processing),
      updated_at: now,
    })
    .eq('id', capture.id)
    .eq('documentation_session_id', capture.documentation_session_id)
    .eq('organization_id', capture.organization_id)

  if (error) {
    logCaptureFailure({
      step: 'capture_processing_state_update',
      captureId: capture.id,
      ...getSafeErrorDetails(error),
    })
  }
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
    return 'No captures are ready for report detail processing.'
  }

  const captureWord = extractedCount === 1 ? 'capture' : 'captures'
  const suggestionWord = suggestionCount === 1 ? 'suggestion' : 'suggestions'

  return `Prepared report details from ${extractedCount} ${captureWord}. ${suggestionCount} session ${suggestionWord} ready.`
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

  if (sourceDocument.type === 'other' || sourceDocument.type === 'diagnostic_procedure') {
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
    (!capture.storage_path ||
      !IMAGE_STORAGE_PATH_PATTERN.test(capture.storage_path))
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
      ocr_text: extraction.extracted_text,
      capture_ai_analysis: buildCaptureAiAnalysis(
        capture.extracted_data,
        extraction,
        status,
      ),
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
      message: 'Unable to load captures for report detail processing.',
    }
  }

  const extractableCaptures = (capturesForExtraction ?? [])
    .filter(
      (capture): capture is ExtractionCaptureItem & { storage_path: string } =>
        Boolean(capture.storage_path) &&
        Boolean(getDetectedType(capture.extracted_data)) &&
        captureNeedsExtraction(capture),
    )
    .slice(0, MAX_EXTRACTION_BATCH_SIZE)

  if (extractableCaptures.length === 0) {
    return {
      ok: false,
      message: 'Process captures before preparing report details.',
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
          'Unable to prepare image for report detail processing.',
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

export type BackgroundCaptureProcessingSummary = {
  ok: boolean
  message: string
  processed: number
  skipped: number
  failed: number
  pending: number
  blockedByLimit: number
}

type ProcessableCaptureItem = ExtractionCaptureItem & {
  deleted_at: string | null
}

function captureAlreadyExtracted(capture: ProcessableCaptureItem) {
  const extractedData = isRecord(capture.extracted_data)
    ? capture.extracted_data
    : null
  const extraction =
    extractedData && isRecord(extractedData.extraction)
      ? extractedData.extraction
      : null
  const extractionStatus =
    typeof extraction?.status === 'string' ? extraction.status : null
  return capture.ai_status === 'extracted' || extractionStatus === 'extracted'
}

function captureHasImageFile(capture: ProcessableCaptureItem) {
  return (
    capture.media_kind === 'image' ||
    Boolean(
      capture.storage_path &&
      IMAGE_STORAGE_PATH_PATTERN.test(capture.storage_path),
    )
  )
}

async function markCaptureUnsupportedForBackground(
  capture: ProcessableCaptureItem,
  supabase: Awaited<ReturnType<typeof requireSessionWorkspace>>['supabase'],
  reason: string,
) {
  await updateCaptureProcessingState(
    capture,
    supabase,
    'needs_review',
    'unsupported',
    reason,
  )
}

export async function processPendingCapturesForSession(
  sessionId: string,
): Promise<BackgroundCaptureProcessingSummary> {
  const trimmedSessionId = sessionId.trim()
  const summary: BackgroundCaptureProcessingSummary = {
    ok: true,
    message: 'No pending evidence needed processing.',
    processed: 0,
    skipped: 0,
    failed: 0,
    pending: 0,
    blockedByLimit: 0,
  }

  if (!trimmedSessionId) {
    return { ...summary, ok: false, message: 'Missing documentation session.' }
  }

  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    return { ...summary, ok: false, message: billingAccess.message }
  }

  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('id, organization_id, suggested_details')
    .eq('id', trimmedSessionId)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) {
    return {
      ...summary,
      ok: false,
      message: 'Documentation session not found.',
    }
  }

  const { data: captures, error: capturesError } = await supabase
    .from('capture_items')
    .select(
      'id, documentation_session_id, organization_id, type, storage_path, extracted_data, ai_status, technician_note, transcript, media_kind, deleted_at',
    )
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .order('captured_at', { ascending: true })
    .limit(100)

  if (capturesError) {
    logCaptureFailure({
      step: 'background_capture_processing_query',
      ...getSafeErrorDetails(capturesError),
    })
    return {
      ...summary,
      ok: false,
      message: 'Unable to load pending evidence.',
    }
  }

  const processableCaptures = (captures ?? [])
    .filter(
      (capture): capture is ProcessableCaptureItem =>
        !capture.deleted_at &&
        !captureAlreadyExtracted(capture as ProcessableCaptureItem),
    )
    .slice(0, MAX_CLASSIFICATION_BATCH_SIZE)

  if (processableCaptures.length === 0) {
    return summary
  }

  let suggestedDetails = isRecord(session.suggested_details)
    ? (session.suggested_details as Json)
    : {}

  for (const capture of processableCaptures) {
    const sourceDocument = getSourceDocumentMetadata(capture.extracted_data)

    if (
      !EXTRACTABLE_CAPTURE_TYPES.includes(capture.type) ||
      !captureHasImageFile(capture)
    ) {
      await markCaptureUnsupportedForBackground(
        capture,
        supabase,
        capture.media_kind === 'video'
          ? 'Video-only evidence is saved for report review and can be processed later when thumbnail extraction is available.'
          : 'This evidence type is saved but is not supported by background extraction yet.',
      )
      summary.skipped += 1
      continue
    }

    try {
      await updateCaptureProcessingState(
        capture,
        supabase,
        'processing',
        sourceDocument ? 'extraction' : 'classification',
      )

      let workingCapture: ProcessableCaptureItem = capture
      if (!sourceDocument && captureNeedsClassification(capture)) {
        const classificationAllowance = await requireUsageAllowance({
          supabase,
          organizationId: profile.organization_id,
          plan: billingAccess.access.plan,
          eventType: 'ai_classification',
          quantity: 1,
        })

        if (!classificationAllowance.ok) {
          await updateCaptureProcessingState(
            capture,
            supabase,
            'blocked_by_limit',
            'classification',
            classificationAllowance.message,
          )
          summary.blockedByLimit += 1
          continue
        }

        const { data: signedData, error: signedUrlError } =
          await supabase.storage
            .from(CAPTURE_BUCKET)
            .createSignedUrl(
              capture.storage_path,
              SIGNED_CLASSIFICATION_URL_SECONDS,
            )

        if (signedUrlError || !signedData?.signedUrl) {
          logCaptureFailure({
            step: 'background_capture_classification_signed_url',
            captureId: capture.id,
            ...getSafeErrorDetails(signedUrlError),
          })
          await markCaptureNeedsReview(
            capture,
            supabase,
            'Unable to prepare image for classification.',
          )
          summary.failed += 1
          continue
        }

        const classification = await classifyCaptureImage(
          signedData.signedUrl,
          getGuidanceContext(capture.extracted_data),
          capture.technician_note ?? capture.transcript ?? null,
        )
        await updateCaptureClassification(capture, classification, supabase)
        await recordUsageEvent({
          supabase,
          organizationId: profile.organization_id,
          eventType: 'ai_classification',
          quantity: 1,
          metadata: {
            session_id: session.id,
            capture_id: capture.id,
            background: true,
          },
          createdBy: profile.id,
        })
        workingCapture = {
          ...capture,
          ai_status: getClassificationStatus(classification),
          extracted_data: buildClassifiedImageData(
            capture.extracted_data,
            classification,
            getClassificationStatus(classification),
          ),
        }
      }

      const detectedType = getDetectedType(workingCapture.extracted_data)

      if (!detectedType || !captureNeedsExtraction(workingCapture)) {
        summary.skipped += 1
        continue
      }

      const extractionAllowance = await requireUsageAllowance({
        supabase,
        organizationId: profile.organization_id,
        plan: billingAccess.access.plan,
        eventType: 'ai_extraction',
        quantity: 1,
      })

      if (!extractionAllowance.ok) {
        await updateCaptureProcessingState(
          workingCapture,
          supabase,
          'blocked_by_limit',
          'extraction',
          extractionAllowance.message,
        )
        summary.blockedByLimit += 1
        continue
      }

      if (!workingCapture.storage_path) {
        await markCaptureExtractionFailed(
          workingCapture,
          supabase,
          'No media file is available for report detail processing.',
        )
        summary.failed += 1
        continue
      }

      await updateCaptureProcessingState(
        workingCapture,
        supabase,
        'processing',
        'extraction',
      )

      const { data: signedData, error: signedUrlError } = await supabase.storage
        .from(CAPTURE_BUCKET)
        .createSignedUrl(
          workingCapture.storage_path,
          SIGNED_EXTRACTION_URL_SECONDS,
        )

      if (signedUrlError || !signedData?.signedUrl) {
        logCaptureFailure({
          step: 'background_capture_extraction_signed_url',
          captureId: workingCapture.id,
          ...getSafeErrorDetails(signedUrlError),
        })
        await markCaptureExtractionFailed(
          workingCapture,
          supabase,
          'Unable to prepare image for report detail processing.',
        )
        summary.failed += 1
        continue
      }

      const extraction = await extractCaptureImageDetails(
        signedData.signedUrl,
        detectedType,
        workingCapture.technician_note ?? workingCapture.transcript ?? null,
        getSourceDocumentMetadata(workingCapture.extracted_data),
      )
      await updateCaptureExtraction(workingCapture, extraction, supabase)
      suggestedDetails = mergeSessionSuggestions(
        suggestedDetails,
        workingCapture,
        detectedType,
        extraction,
      )
      await recordUsageEvent({
        supabase,
        organizationId: profile.organization_id,
        eventType: 'ai_extraction',
        quantity: 1,
        metadata: {
          session_id: session.id,
          capture_id: workingCapture.id,
          background: true,
        },
        createdBy: profile.id,
      })
      summary.processed += 1
    } catch (error) {
      if (isMissingOpenAiKeyError(error)) {
        await updateCaptureProcessingState(
          capture,
          supabase,
          'failed',
          'configuration',
          'AI processing is not configured yet.',
        )
      } else {
        logCaptureFailure({
          step: 'background_capture_processing',
          captureId: capture.id,
          ...getSafeErrorDetails(error),
        })
        await updateCaptureProcessingState(
          capture,
          supabase,
          'failed',
          'processing',
          'AI processing failed. Retry from the session or report page.',
        )
      }
      summary.failed += 1
    }
  }

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
      step: 'background_session_suggestions_update',
      ...getSafeErrorDetails(suggestionsError),
    })
  }

  const { count: pendingCount } = await supabase
    .from('capture_items')
    .select('id', { count: 'exact', head: true })
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .in('ai_status', ['pending', 'processing', 'blocked_by_limit'])

  summary.pending = pendingCount ?? 0
  summary.ok = summary.failed === 0
  summary.message =
    summary.blockedByLimit > 0
      ? 'AI usage limit reached. Evidence is saved and can be retried after allowance resets.'
      : `Processed ${summary.processed} capture${summary.processed === 1 ? '' : 's'} in the background.`

  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/capture`)
  revalidatePath(`/dashboard/sessions/${session.id}/report`)

  return summary
}

export async function processPendingCaptures(
  _previousState: CaptureExtractionActionState,
  formData: FormData,
): Promise<CaptureExtractionActionState> {
  const sessionId = getString(formData, 'session_id')
  const summary = await processPendingCapturesForSession(sessionId)
  return { ok: summary.ok, message: summary.message }
}

type CaptureReviewActionState = {
  ok?: boolean
  message?: string
}

async function getAuthorizedCapture(captureId: string) {
  const { supabase, profile } = await requireSessionWorkspace()
  const { data: capture, error } = await supabase
    .from('capture_items')
    .select(
      'id, documentation_session_id, organization_id, storage_path, extracted_data, capture_ai_analysis',
    )
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
  const aiSuggestionEnabled =
    getString(formData, 'ai_suggestion_enabled') !== 'off'
  const generatedNote = getString(formData, 'ai_generated_note').slice(0, 600)
  const extractedValuesRaw = getString(formData, 'ai_extracted_values').slice(
    0,
    4000,
  )
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

  const currentAnalysis = isRecord(capture.capture_ai_analysis)
    ? capture.capture_ai_analysis
    : isRecord(capture.extracted_data) &&
        isRecord(capture.extracted_data.capture_ai_analysis)
      ? capture.extracted_data.capture_ai_analysis
      : {}
  let parsedExtractedValues: Json = isRecord(currentAnalysis.extracted_values)
    ? currentAnalysis.extracted_values
    : {}

  if (extractedValuesRaw) {
    try {
      const parsed = JSON.parse(extractedValuesRaw)
      parsedExtractedValues = isRecord(parsed)
        ? (parsed as Json)
        : parsedExtractedValues
    } catch {
      return { ok: false, message: 'Extracted values must be valid JSON.' }
    }
  }

  const updatedAnalysis: Json = {
    ...currentAnalysis,
    extracted_values: parsedExtractedValues,
    generated_note: generatedNote || null,
    suggestion_disabled: !aiSuggestionEnabled,
    reviewed_at: new Date().toISOString(),
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
      capture_ai_analysis: updatedAnalysis,
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

export async function removeCaptureItem(formData: FormData): Promise<{ ok: boolean; error?: string; sessionId?: string }> {
  const captureId = getString(formData, 'capture_id')

  if (!captureId) {
    return { ok: false, error: 'Missing evidence item.' }
  }

  const { supabase, profile, capture } = await getAuthorizedCapture(captureId)
  const billingAccess = requireActiveBillingAccess(profile)

  if (!capture) {
    return { ok: false, error: 'Evidence item not found.' }
  }

  if (!billingAccess.ok) {
    return { ok: false, error: billingAccess.message, sessionId: capture.documentation_session_id }
  }

  if (capture.storage_path) {
    await removeUploadedObject(supabase, capture.storage_path)
  }

  const { error } = await supabase
    .from('capture_items')
    .delete()
    .eq('id', capture.id)
    .eq('organization_id', profile.organization_id)

  if (error) {
    logCaptureFailure({
      step: 'capture_delete',
      captureId: capture.id,
      ...getSafeErrorDetails(error),
    })
    return { ok: false, error: 'Unable to delete evidence.', sessionId: capture.documentation_session_id }
  }

  revalidatePath(`/dashboard/sessions/${capture.documentation_session_id}`)
  revalidatePath(
    `/dashboard/sessions/${capture.documentation_session_id}/capture`,
  )
  revalidatePath(`/dashboard/sessions/${capture.documentation_session_id}/report`)

  return { ok: true, sessionId: capture.documentation_session_id }
}


export async function updateCaptureItemNote(input: { sessionId: string; captureItemId: string; technicianNote: string }) {
  const sessionId = input.sessionId.trim()
  const captureItemId = input.captureItemId.trim()
  const technicianNote = input.technicianNote.trim().slice(0, 2000)
  if (!sessionId || !captureItemId) return { ok: false, error: 'Missing capture.' }
  const { supabase, profile } = await requireSessionWorkspace()
  const { error } = await supabase
    .from('capture_items')
    .update({
      technician_note: technicianNote || null,
      transcript: technicianNote || null,
      transcript_status: technicianNote ? 'completed' : 'not_started',
      note_source: 'edited',
      updated_at: new Date().toISOString(),
    })
    .eq('id', captureItemId)
    .eq('documentation_session_id', sessionId)
    .eq('organization_id', profile.organization_id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/dashboard/sessions/${sessionId}/capture`)
  revalidatePath(`/dashboard/sessions/${sessionId}/report`)
  return { ok: true }
}
