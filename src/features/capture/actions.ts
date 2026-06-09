'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'

import { requireSessionWorkspace } from '@/features/sessions/data'

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
const FILE_TOO_LARGE_MESSAGE = 'That file is too large. Please upload an image under 15MB.'

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

function getString(formData: FormData, field: string) {
  const value = formData.get(field)
  return typeof value === 'string' ? value.trim() : ''
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

async function saveCapture(formData: FormData): Promise<CaptureActionFailure | CaptureActionSuccess> {
  const sessionId = getString(formData, 'session_id')
  const rawCaptureIntent = getString(formData, 'capture_intent') || 'auto_image'
  const rawManualCaptureType = getString(formData, 'manual_type')
  const upload = formData.get('file')

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

  if (!(upload instanceof File) || upload.size === 0) {
    return captureError('Choose a file to upload.', sessionId)
  }

  const file = upload

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return captureError(FILE_TOO_LARGE_MESSAGE, sessionId)
  }

  if (rawCaptureIntent === 'auto_image' && !fileIsImage(file)) {
    return captureError('Capture Evidence accepts image files only.', sessionId)
  }

  if (rawCaptureIntent === 'manual' && !fileHasAllowedType(file, captureType)) {
    return captureError('That file type is not allowed for this capture.', sessionId)
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

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const safeFilename = sanitizeFilename(file.name)
  const storagePath = `organizations/${profile.organization_id}/sessions/${session.id}/captures/${timestamp}-${crypto.randomUUID()}-${safeFilename}`

  const { error: uploadError } = await supabase.storage.from(CAPTURE_BUCKET).upload(storagePath, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })

  if (uploadError) {
    const lowerMessage = uploadError.message.toLowerCase()
    const setupHint = lowerMessage.includes('bucket')
      ? ' The documentation-captures storage bucket may not be set up yet.'
      : ''
    const sizeHint = lowerMessage.includes('size') || lowerMessage.includes('large') ? ` ${FILE_TOO_LARGE_MESSAGE}` : ''
    return captureError(`Unable to upload capture.${setupHint}${sizeHint}`, session.id)
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
    await supabase.storage.from(CAPTURE_BUCKET).remove([storagePath])
    return captureError(captureErrorResult?.message ?? 'Unable to save capture metadata.', session.id)
  }

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
    return captureError(timelineError.message, session.id)
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
