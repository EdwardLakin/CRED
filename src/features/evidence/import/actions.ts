'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'

import { requireSessionWorkspace } from '@/features/sessions/data'
import { queueCaptureAnalysisJobs } from '@/lib/capture-processing/queue'
import type { Json } from '@/lib/supabase/database.types'
import { BULK_EVIDENCE_BUCKET, BULK_EVIDENCE_SOURCE_KIND, getBulkEvidenceCaptureType, getBulkEvidenceMediaKind, sanitizeEvidenceFilename, validateBulkEvidenceFile } from './validation'

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
