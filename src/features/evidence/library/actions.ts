'use server'

import { revalidatePath } from 'next/cache'

import { requireSessionWorkspace } from '@/features/sessions/data'
import { parseEventDatePrecision, parseEvidenceReviewStatus, normalizeOptionalIsoDateTime, parseMetadataJson } from '@/features/evidence/library/validation'

type EvidencePatch = Record<string, unknown>
export type EvidenceMutationResult =
  | { ok: true; message: string }
  | { ok: false; message: string }

const EVIDENCE_MUTATION_ERROR = 'This item could not be updated. Refresh and try again.'
type UpdatedEvidenceRow = {
  id: string
  documentation_session_id: string
  evidence_review_status: string | null
  include_in_report: boolean | null
  event_date: string | null
  event_date_precision: string | null
  source_created_at: string | null
  source_sent_at: string | null
  source_received_at: string | null
  source_uri: string | null
  source_metadata: unknown
  duplicate_status: string | null
  duplicate_of_capture_item_id: string | null
}

const UPDATED_EVIDENCE_SELECT = 'id, documentation_session_id, evidence_review_status, include_in_report, event_date, event_date_precision, source_created_at, source_sent_at, source_received_at, source_uri, source_metadata, duplicate_status, duplicate_of_capture_item_id'

function valuesMatch(requested: unknown, stored: unknown) {
  if (requested === undefined) return true
  if (requested === stored) return true
  if (requested == null || stored == null) return requested == null && stored == null
  if (requested instanceof Date) return requested.toISOString() === stored
  if (typeof requested === 'object' || typeof stored === 'object') return JSON.stringify(requested) === JSON.stringify(stored)
  return String(requested) === String(stored)
}

function logEvidenceMutationFailure(operation: string, captureId: string, organizationId: string, errorCode?: string) {
  console.error('Item mutation failed', { operation, captureId, organizationId, errorCode })
}

function revalidateEvidenceMutationRoutes(sessionId: string, captureId: string) {
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/sessions')
  revalidatePath(`/dashboard/sessions/${sessionId}`)
  revalidatePath(`/dashboard/sessions/${sessionId}/evidence`)
  revalidatePath(`/dashboard/sessions/${sessionId}/evidence/${captureId}`)
  revalidatePath(`/dashboard/sessions/${sessionId}/evidence/review`)
  revalidatePath(`/dashboard/sessions/${sessionId}/report`)
  revalidatePath(`/dashboard/sessions/${sessionId}/deliverables`)
}

async function updateEvidenceCapture(captureId: string, patch: EvidencePatch, operation = 'updateEvidenceCapture') {
  const { supabase, profile } = await requireSessionWorkspace()
  const updatePatch = { ...patch, updated_at: new Date().toISOString() }
  const { data, error } = await supabase
    .from('capture_items')
    .update(updatePatch)
    .eq('id', captureId)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .select(UPDATED_EVIDENCE_SELECT)
    .maybeSingle()

  if (error) {
    logEvidenceMutationFailure(operation, captureId, profile.organization_id, error.code)
    throw new Error('Unable to update this item. Please refresh and try again.')
  }
  if (!data) {
    logEvidenceMutationFailure(operation, captureId, profile.organization_id, 'NO_ROWS_UPDATED')
    throw new Error('This item was not updated. It may have been deleted or you may not have access.')
  }

  const row = data as UpdatedEvidenceRow
  for (const [key, value] of Object.entries(patch)) {
    if (!valuesMatch(value, row[key as keyof UpdatedEvidenceRow])) {
      logEvidenceMutationFailure(operation, captureId, profile.organization_id, `MISMATCH_${key}`)
      throw new Error('The item update could not be verified. Please refresh and try again.')
    }
  }

  revalidateEvidenceMutationRoutes(row.documentation_session_id, captureId)
  return row
}

function mutationError(operation: string, captureId: string, error: unknown): EvidenceMutationResult {
  console.error('Item mutation action failed', {
    operation,
    captureId,
    errorCode: error instanceof Error ? error.name : 'UNKNOWN',
  })
  return { ok: false, message: EVIDENCE_MUTATION_ERROR }
}

function formDataFromActionArgs(previousStateOrFormData: EvidenceMutationResult | FormData, formData?: FormData) {
  return formData ?? (previousStateOrFormData instanceof FormData ? previousStateOrFormData : null)
}

export async function updateEvidenceReviewStatus(captureId: string, previousStateOrFormData: EvidenceMutationResult | FormData, formData?: FormData): Promise<EvidenceMutationResult> {
  try {
    const submitted = formDataFromActionArgs(previousStateOrFormData, formData)
    const status = parseEvidenceReviewStatus(submitted?.get('evidence_review_status') ?? null)
    if (!status) return { ok: false, message: EVIDENCE_MUTATION_ERROR }
    await updateEvidenceCapture(captureId, { evidence_review_status: status }, 'updateEvidenceReviewStatus')
    return { ok: true, message: 'Review status saved.' }
  } catch (error) {
    return mutationError('updateEvidenceReviewStatus', captureId, error)
  }
}

export async function updateEvidenceOutputInclusion(captureId: string, previousStateOrFormData: EvidenceMutationResult | FormData, formData?: FormData): Promise<EvidenceMutationResult> {
  try {
    const submitted = formDataFromActionArgs(previousStateOrFormData, formData)
    if (!submitted) return { ok: false, message: EVIDENCE_MUTATION_ERROR }
    await updateEvidenceCapture(captureId, { include_in_report: submitted.get('include_in_report') === 'on' }, 'updateEvidenceOutputInclusion')
    return { ok: true, message: 'Output preference saved.' }
  } catch (error) {
    return mutationError('updateEvidenceOutputInclusion', captureId, error)
  }
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
  }, 'updateEvidenceSourceDates')
}

export async function updateEvidenceSourceMetadata(captureId: string, formData: FormData) {
  await updateEvidenceCapture(captureId, {
    source_uri: typeof formData.get('source_uri') === 'string' ? String(formData.get('source_uri')).trim() || null : null,
    source_metadata: parseMetadataJson(formData.get('source_metadata')),
  }, 'updateEvidenceSourceMetadata')
}

export async function markEvidenceDuplicate(captureId: string, formData: FormData) {
  const duplicateOf = formData.get('duplicate_of_capture_item_id')
  await updateEvidenceCapture(captureId, {
    duplicate_status: 'duplicate',
    duplicate_of_capture_item_id: typeof duplicateOf === 'string' && duplicateOf.trim() ? duplicateOf.trim() : null,
  }, 'markEvidenceDuplicate')
}

export async function clearEvidenceDuplicate(captureId: string) {
  await updateEvidenceCapture(captureId, { duplicate_status: 'unique', duplicate_of_capture_item_id: null }, 'clearEvidenceDuplicate')
}
