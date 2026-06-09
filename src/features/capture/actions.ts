'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireSessionWorkspace } from '@/features/sessions/data'

import { getCaptureEventTitle, getInitialExtractedData, isCaptureType, type CaptureType } from './types'

const CAPTURE_BUCKET = 'documentation-captures'
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024

const ALLOWED_MIME_TYPES: Record<CaptureType, readonly string[]> = {
  photo: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
  vin_plate: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
  info_plate: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
  document: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
  voice_note: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/aac', 'audio/x-m4a'],
}

function getString(formData: FormData, field: string) {
  const value = formData.get(field)
  return typeof value === 'string' ? value.trim() : ''
}

function redirectWithCaptureError(sessionId: string, message: string): never {
  redirect(`/dashboard/sessions/${sessionId}?captureError=${encodeURIComponent(message)}`)
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

export async function createCapture(formData: FormData) {
  const sessionId = getString(formData, 'session_id')
  const rawCaptureType = getString(formData, 'type')
  const upload = formData.get('file')

  if (!sessionId) {
    redirect('/dashboard/sessions?error=Missing%20documentation%20session.')
  }

  if (!isCaptureType(rawCaptureType)) {
    redirectWithCaptureError(sessionId, 'Choose a valid capture type.')
  }

  const captureType: CaptureType = rawCaptureType

  if (!(upload instanceof File) || upload.size === 0) {
    redirectWithCaptureError(sessionId, 'Choose a file to upload.')
  }

  const file = upload

  if (file.size > MAX_FILE_SIZE_BYTES) {
    redirectWithCaptureError(sessionId, 'Capture files must be 15MB or smaller.')
  }

  if (!fileHasAllowedType(file, captureType)) {
    redirectWithCaptureError(sessionId, 'That file type is not allowed for this capture.')
  }

  const { supabase, profile } = await requireSessionWorkspace()
  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('id, organization_id')
    .eq('id', sessionId)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) {
    redirect('/dashboard/sessions?error=Documentation%20session%20not%20found.')
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
    const setupHint = uploadError.message.toLowerCase().includes('bucket')
      ? ' The documentation-captures storage bucket may not be set up yet.'
      : ''
    redirectWithCaptureError(session.id, `Unable to upload capture.${setupHint}`)
  }

  const capturedAt = new Date().toISOString()
  const { data: captureItem, error: captureError } = await supabase
    .from('capture_items')
    .insert({
      documentation_session_id: session.id,
      organization_id: profile.organization_id,
      type: captureType,
      storage_path: storagePath,
      captured_at: capturedAt,
      ai_status: 'pending',
      extracted_data: getInitialExtractedData(captureType),
    })
    .select('id')
    .single()

  if (captureError || !captureItem) {
    await supabase.storage.from(CAPTURE_BUCKET).remove([storagePath])
    redirectWithCaptureError(session.id, captureError?.message ?? 'Unable to save capture metadata.')
  }

  const { error: timelineError } = await supabase.from('timeline_events').insert({
    documentation_session_id: session.id,
    organization_id: profile.organization_id,
    capture_item_id: captureItem.id,
    title: getCaptureEventTitle(captureType),
    event_type: 'capture',
  })

  if (timelineError) {
    redirectWithCaptureError(session.id, timelineError.message)
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/sessions')
  revalidatePath(`/dashboard/sessions/${session.id}`)
  redirect(`/dashboard/sessions/${session.id}?captureSaved=1`)
}
