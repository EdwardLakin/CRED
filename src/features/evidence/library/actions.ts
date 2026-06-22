'use server'

import { revalidatePath } from 'next/cache'

import { requireSessionWorkspace } from '@/features/sessions/data'
import { parseEventDatePrecision, parseEvidenceReviewStatus, normalizeOptionalIsoDateTime, parseMetadataJson } from '@/features/evidence/library/validation'

async function updateEvidenceCapture(captureId: string, patch: Record<string, unknown>) {
  const { supabase, profile } = await requireSessionWorkspace()
  const { data: capture, error: captureError } = await supabase
    .from('capture_items')
    .select('id, documentation_session_id')
    .eq('id', captureId)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .single()

  if (captureError || !capture) throw new Error('Evidence item not found')

  const { error } = await supabase
    .from('capture_items')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', captureId)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)

  if (error) throw new Error('Unable to update evidence item')
  const sessionId = capture.documentation_session_id
  revalidatePath(`/dashboard/sessions/${sessionId}/evidence`)
  revalidatePath(`/dashboard/sessions/${sessionId}/evidence/${captureId}`)
}

export async function updateEvidenceReviewStatus(captureId: string, formData: FormData) {
  const status = parseEvidenceReviewStatus(formData.get('evidence_review_status'))
  if (!status) throw new Error('Invalid review status')
  await updateEvidenceCapture(captureId, { evidence_review_status: status })
}

export async function updateEvidenceOutputInclusion(captureId: string, formData: FormData) {
  await updateEvidenceCapture(captureId, { include_in_report: formData.get('include_in_report') === 'on' })
}

export async function updateEvidenceSourceDates(captureId: string, formData: FormData) {
  const precision = parseEventDatePrecision(formData.get('event_date_precision'))
  const rawPrecision = formData.get('event_date_precision')
  if (rawPrecision && rawPrecision !== '' && !precision) throw new Error('Invalid event date precision')

  await updateEvidenceCapture(captureId, {
    event_date: normalizeOptionalIsoDateTime(formData.get('event_date')),
    event_date_precision: precision,
    source_created_at: normalizeOptionalIsoDateTime(formData.get('source_created_at')),
    source_sent_at: normalizeOptionalIsoDateTime(formData.get('source_sent_at')),
    source_received_at: normalizeOptionalIsoDateTime(formData.get('source_received_at')),
  })
}

export async function updateEvidenceSourceMetadata(captureId: string, formData: FormData) {
  await updateEvidenceCapture(captureId, {
    source_uri: typeof formData.get('source_uri') === 'string' ? String(formData.get('source_uri')).trim() || null : null,
    source_metadata: parseMetadataJson(formData.get('source_metadata')),
  })
}

export async function markEvidenceDuplicate(captureId: string, formData: FormData) {
  const duplicateOf = formData.get('duplicate_of_capture_item_id')
  await updateEvidenceCapture(captureId, {
    duplicate_status: 'duplicate',
    duplicate_of_capture_item_id: typeof duplicateOf === 'string' && duplicateOf.trim() ? duplicateOf.trim() : null,
  })
}

export async function clearEvidenceDuplicate(captureId: string) {
  await updateEvidenceCapture(captureId, { duplicate_status: 'unique', duplicate_of_capture_item_id: null })
}
