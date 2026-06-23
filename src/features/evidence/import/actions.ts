'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'

import { requireSessionWorkspace } from '@/features/sessions/data'
import { queueCaptureAnalysisJobs } from '@/lib/capture-processing/queue'
import type { Json } from '@/lib/supabase/database.types'
import { generateEvidenceSuggestionsForCaptures } from '@/features/evidence/suggestions/service'
import { BULK_EVIDENCE_BUCKET, BULK_EVIDENCE_SOURCE_KIND, getBulkEvidenceCaptureType, getBulkEvidenceMediaKind, parseBatchEventDate, parseBatchEventDatePrecision, parseBatchEvidenceReviewStatus, parseBatchOutputInclusion, parseSelectedCaptureItemIds, sanitizeEvidenceFilename, validateBulkEvidenceFile } from './validation'

export type BulkEvidenceImportResult = {
  ok: boolean
  batchId?: string
  message: string
  files: { name: string; ok: boolean; captureItemId?: string; error?: string }[]
}

function safeFileMetadata(file: File, index: number): Json {
  return { original_filename: sanitizeEvidenceFilename(file.name), mime_type: file.type, size_bytes: file.size, index, source_kind: BULK_EVIDENCE_SOURCE_KIND }
}

function batchStatus(processedCount: number, failedCount: number) {
  if (processedCount === 0 && failedCount > 0) return 'failed'
  if (failedCount > 0) return 'completed_with_errors'
  return 'completed'
}

export async function importBulkEvidence(sessionId: string, formData: FormData): Promise<BulkEvidenceImportResult> {
  const files = formData.getAll('files').filter((value): value is File => value instanceof File && value.size > 0)
  if (files.length === 0) return { ok: false, message: 'Select at least one evidence file to import.', files: [] }

  const { supabase, profile } = await requireSessionWorkspace()
  const { data: session, error: sessionError } = await supabase.from('documentation_sessions').select('id, organization_id').eq('id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).single()
  if (sessionError || !session) return { ok: false, message: 'Documentation session not found.', files: [] }

  const { data: batch, error: batchError } = await supabase.from('evidence_import_batches').insert({
    documentation_session_id: session.id,
    organization_id: profile.organization_id,
    source_kind: BULK_EVIDENCE_SOURCE_KIND,
    status: 'uploading',
    file_count: files.length,
    processed_count: 0,
    failed_count: 0,
    created_by: profile.id,
    metadata: { source_kind: BULK_EVIDENCE_SOURCE_KIND, file_names: files.map((file) => sanitizeEvidenceFilename(file.name)), total_bytes: files.reduce((sum, file) => sum + file.size, 0) },
  }).select('id').single()

  if (batchError || !batch) return { ok: false, message: 'Unable to create an import batch.', files: [] }

  const results: BulkEvidenceImportResult['files'] = []
  let processedCount = 0
  let failedCount = 0

  await supabase.from('evidence_import_batches').update({ status: 'processing' }).eq('id', batch.id).eq('documentation_session_id', session.id).eq('organization_id', profile.organization_id)

  for (const [index, file] of files.entries()) {
    const name = sanitizeEvidenceFilename(file.name)
    const validation = validateBulkEvidenceFile(file)
    if (!validation.ok) {
      failedCount += 1
      results.push({ name, ok: false, error: validation.error })
      continue
    }

    const storagePath = `organizations/${profile.organization_id}/sessions/${session.id}/captures/bulk/${batch.id}/${randomUUID()}-${name}`
    const { error: uploadError } = await supabase.storage.from(BULK_EVIDENCE_BUCKET).upload(storagePath, file, { contentType: file.type, upsert: false })
    if (uploadError) {
      failedCount += 1
      results.push({ name, ok: false, error: 'Upload failed.' })
      continue
    }

    const capturedAt = new Date().toISOString()
    const sourceMetadata = safeFileMetadata(file, index)
    const { data: captureItem, error: captureError } = await supabase.from('capture_items').insert({
      documentation_session_id: session.id,
      organization_id: profile.organization_id,
      import_batch_id: batch.id,
      original_filename: name,
      file_size_bytes: file.size,
      mime_type: file.type,
      source_kind: BULK_EVIDENCE_SOURCE_KIND,
      source_metadata: sourceMetadata,
      type: getBulkEvidenceCaptureType(file.type),
      storage_path: storagePath,
      captured_at: capturedAt,
      include_in_report: true,
      evidence_review_status: 'unreviewed',
      processing_status: 'saved',
      ai_status: 'needs_review',
      media_kind: getBulkEvidenceMediaKind(file.type),
      extracted_data: { upload: sourceMetadata, import_batch_id: batch.id },
    }).select('id').single()

    if (captureError || !captureItem) {
      failedCount += 1
      results.push({ name, ok: false, error: 'Uploaded, but metadata save failed.' })
      continue
    }

    processedCount += 1
    results.push({ name, ok: true, captureItemId: captureItem.id })

    try {
      await queueCaptureAnalysisJobs({ supabase, organizationId: profile.organization_id, sessionId: session.id, captureItemId: captureItem.id, metadata: { import_batch_id: batch.id, source_kind: BULK_EVIDENCE_SOURCE_KIND } })
    } catch {
      await supabase.from('capture_items').update({ processing_status: 'needs_queue_retry', ai_status: 'needs_review' }).eq('id', captureItem.id).eq('documentation_session_id', session.id).eq('organization_id', profile.organization_id)
    }
  }

  const status = batchStatus(processedCount, failedCount)
  await supabase.from('evidence_import_batches').update({ status, processed_count: processedCount, failed_count: failedCount, metadata: { source_kind: BULK_EVIDENCE_SOURCE_KIND, processed_count: processedCount, failed_count: failedCount, file_count: files.length } }).eq('id', batch.id).eq('documentation_session_id', session.id).eq('organization_id', profile.organization_id)

  revalidatePath(`/dashboard/sessions/${session.id}/evidence`)
  revalidatePath(`/dashboard/sessions/${session.id}/evidence/import`)
  return { ok: failedCount === 0, batchId: batch.id, message: `Imported ${processedCount} of ${files.length} files.`, files: results }
}


type ImportMutationBuilder = { select: (columns: string) => ImportMutationBuilder; eq: (column: string, value: string | boolean) => ImportMutationBuilder; in: (column: string, values: string[]) => ImportMutationBuilder; is: (column: string, value: null) => ImportMutationBuilder; single: () => Promise<{ data: unknown; error: unknown }>; update: (values: Record<string, unknown>) => ImportMutationBuilder; insert: (values: Record<string, unknown> | Record<string, unknown>[]) => Promise<{ error: unknown }>; then: Promise<{ data?: unknown; error: unknown }>['then'] }
type ImportSupabaseLike = { from: (table: string) => ImportMutationBuilder }
type BatchCaptureRow = { id: string; documentation_session_id: string; organization_id: string; import_batch_id: string | null; deleted_at?: string | null; evidence_review_status: string; include_in_report: boolean; technician_note: string | null; original_filename: string | null; captured_at: string | null; ai_summary?: string | null; ocr_text?: string | null; extracted_text?: string | null }

async function loadBatchForMutation(supabase: ImportSupabaseLike, sessionId: string, batchId: string, organizationId: string) {
  const { data, error } = await supabase.from('evidence_import_batches').select('id, documentation_session_id, organization_id').eq('id', batchId).eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).single()
  if (error || !data) throw new Error('Import batch not found')
}

async function loadBatchCaptureItems(supabase: ImportSupabaseLike, sessionId: string, batchId: string, organizationId: string, ids?: string[]) {
  await loadBatchForMutation(supabase, sessionId, batchId, organizationId)
  let query = supabase.from('capture_items').select('*').eq('documentation_session_id', sessionId).eq('organization_id', organizationId).eq('import_batch_id', batchId)
  if (ids) query = query.in('id', ids)
  const { data, error } = await query.is('deleted_at', null)
  if (error) throw new Error('Unable to load batch evidence')
  const rows = (data ?? []) as BatchCaptureRow[]
  if (ids && rows.length !== new Set(ids).size) throw new Error('Selected evidence must belong to this batch, session, and organization, and cannot be deleted')
  return rows
}

async function updateBatchCaptures(sessionId: string, batchId: string, ids: string[], patch: Record<string, unknown>) {
  const { supabase: rawSupabase, profile } = await requireSessionWorkspace(); const supabase = rawSupabase as unknown as ImportSupabaseLike
  const uniqueIds = [...new Set(ids)]
  if (!uniqueIds.length) throw new Error('Select at least one evidence item')
  await loadBatchCaptureItems(supabase, sessionId, batchId, profile.organization_id, uniqueIds)
  const { error } = await supabase.from('capture_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).eq('import_batch_id', batchId).in('id', uniqueIds).is('deleted_at', null)
  if (error) throw new Error('Unable to update batch evidence')
  revalidatePath(`/dashboard/sessions/${sessionId}/evidence/import/${batchId}`); revalidatePath(`/dashboard/sessions/${sessionId}/evidence`)
}

export async function updateBatchEvidenceReviewStatus(sessionId: string, batchId: string, captureItemId: string, formData: FormData) { const status = parseBatchEvidenceReviewStatus(formData.get('evidence_review_status')); if (!status) throw new Error('Invalid review status'); await updateBatchCaptures(sessionId, batchId, [captureItemId], { evidence_review_status: status }) }
export async function updateBatchEvidenceOutputInclusion(sessionId: string, batchId: string, captureItemId: string, formData: FormData) { const include = parseBatchOutputInclusion(formData.get('include_in_report')); if (include === null) throw new Error('Invalid output inclusion'); await updateBatchCaptures(sessionId, batchId, [captureItemId], { include_in_report: include }) }
export async function updateBatchEvidenceEventDate(sessionId: string, batchId: string, captureItemId: string, formData: FormData) { const precision = parseBatchEventDatePrecision(formData.get('event_date_precision')); if (formData.get('event_date_precision') && !precision) throw new Error('Invalid event date precision'); await updateBatchCaptures(sessionId, batchId, [captureItemId], { event_date: parseBatchEventDate(formData.get('event_date')), event_date_precision: precision }) }
export async function bulkUpdateBatchEvidenceReviewStatus(sessionId: string, batchId: string, formData: FormData) { const status = parseBatchEvidenceReviewStatus(formData.get('evidence_review_status')); if (!status) throw new Error('Invalid review status'); let ids = parseSelectedCaptureItemIds(formData); if (!ids.length && formData.get('scope') === 'all_unreviewed') { const { supabase: rawSupabase, profile } = await requireSessionWorkspace(); ids = (await loadBatchCaptureItems(rawSupabase as unknown as ImportSupabaseLike, sessionId, batchId, profile.organization_id)).filter((item) => item.evidence_review_status === 'unreviewed').map((item) => item.id) } await updateBatchCaptures(sessionId, batchId, ids, { evidence_review_status: status }) }
export async function bulkUpdateBatchEvidenceOutputInclusion(sessionId: string, batchId: string, formData: FormData) { const include = parseBatchOutputInclusion(formData.get('include_in_report')); if (include === null) throw new Error('Invalid output inclusion'); await updateBatchCaptures(sessionId, batchId, parseSelectedCaptureItemIds(formData), { include_in_report: include }) }

async function generateBatchSuggestions(sessionId: string, batchId: string, ids?: string[]) { const { supabase: rawSupabase, profile } = await requireSessionWorkspace(); const supabase = rawSupabase as unknown as ImportSupabaseLike; const captures = (await loadBatchCaptureItems(supabase, sessionId, batchId, profile.organization_id, ids)).filter((item) => item.evidence_review_status !== 'excluded' && item.include_in_report && (ids || item.evidence_review_status === 'unreviewed')); const suggestions = await generateEvidenceSuggestionsForCaptures(sessionId, captures, { organizationId: profile.organization_id, userId: profile.id ?? null, timezone: profile.timezone ?? null }); for (const [table, rows] of Object.entries(suggestions)) if (rows.length) { const { error } = await supabase.from(table).insert(rows); if (error) throw new Error('Unable to create batch suggestions') } revalidatePath(`/dashboard/sessions/${sessionId}/suggestions`); revalidatePath(`/dashboard/sessions/${sessionId}/evidence/import/${batchId}`); return { created: Object.values(suggestions).reduce((sum, rows) => sum + rows.length, 0), unsupported: ['Entity suggestions', 'Relationship suggestions'] } }
export async function generateSuggestionsForImportBatch(sessionId: string, batchId: string) { return generateBatchSuggestions(sessionId, batchId) }
export async function generateSuggestionsForSelectedBatchEvidence(sessionId: string, batchId: string, formData: FormData) { const ids = parseSelectedCaptureItemIds(formData); if (!ids.length) throw new Error('Select at least one evidence item'); return generateBatchSuggestions(sessionId, batchId, ids) }
