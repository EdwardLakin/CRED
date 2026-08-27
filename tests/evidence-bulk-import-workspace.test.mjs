import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'

const actions = readFileSync('src/features/evidence/import/actions.ts', 'utf8')
const data = readFileSync('src/features/evidence/import/data.ts', 'utf8')
const validation = readFileSync('src/features/evidence/import/validation.ts', 'utf8')
const form = readFileSync('src/features/evidence/import/components/BulkEvidenceImportForm.tsx', 'utf8')
const card = readFileSync('src/features/evidence/import/components/EvidenceImportBatchCard.tsx', 'utf8')
const detail = readFileSync('src/features/evidence/import/components/EvidenceImportBatchDetail.tsx', 'utf8')
const fileList = readFileSync('src/features/evidence/import/components/EvidenceImportFileList.tsx', 'utf8')
const library = readFileSync('src/features/evidence/components/EvidenceLibraryList.tsx', 'utf8')
const featureGates = readFileSync('src/features/billing/feature-gates.ts', 'utf8')
const importPage = readFileSync('app/dashboard/sessions/[id]/evidence/import/page.tsx', 'utf8')
const capturePage = readFileSync('app/dashboard/sessions/[id]/capture/page.tsx', 'utf8')
const reportPage = readFileSync('app/dashboard/sessions/[id]/report/page.tsx', 'utf8')

test('bulk import routes and components are present', () => {
  assert.ok(existsSync('app/dashboard/sessions/[id]/evidence/import/page.tsx'))
  assert.ok(existsSync('app/dashboard/sessions/[id]/evidence/import/[batchId]/page.tsx'))
  for (const source of [form, card, detail, fileList]) assert.match(source, /Import|Evidence|files|batch/i)
})

test('batch creation validates session/org scope and safe MIME metadata', () => {
  assert.match(actions, /from\('documentation_sessions'\)[\s\S]*\.eq\('id', sessionId\)[\s\S]*\.eq\('organization_id', profile\.organization_id\)[\s\S]*\.is\('deleted_at', null\)/)
  assert.match(validation, /BULK_EVIDENCE_ALLOWED_MIME_TYPES/)
  assert.match(validation, /BULK_EVIDENCE_MAX_FILE_BYTES/)
  assert.match(actions, /sanitizeEvidenceFilename/)
  assert.doesNotMatch(actions, /source_uri:\s*storagePath/)
})

test('multiple files create one batch and preserve per-file metadata', () => {
  assert.match(actions, /formData\.getAll\('files'\)/)
  assert.match(actions, /from\('evidence_import_batches'\)\.insert\([\s\S]*file_count: files\.length[\s\S]*source_kind: BULK_EVIDENCE_SOURCE_KIND/)
  for (const expected of ['original_filename', 'file_size_bytes', 'mime_type', 'source_metadata', 'import_batch_id']) assert.match(actions, new RegExp(expected))
})

test('partial failures do not roll back successful files and counts are updated', () => {
  assert.match(actions, /for \(const \[index, file\] of files\.entries\(\)\)/)
  assert.match(actions, /failedCount \+= 1[\s\S]*continue/)
  assert.match(actions, /processedCount \+= 1/)
  assert.match(actions, /status, processed_count: processedCount, failed_count: failedCount/)
  assert.match(actions, /completed_with_errors/)
})

test('capture items are linked to batch and queued without blocking upload success', () => {
  assert.match(actions, /import_batch_id: batch\.id/)
  assert.match(actions, /queueCaptureAnalysisJobs/)
  assert.match(actions, /catch \{[\s\S]*needs_queue_retry/)
  assert.match(actions, /processing_status: 'saved'/)
})

test('batch detail data forbids cross-session and cross-org batch access', () => {
  assert.match(data, /from\('evidence_import_batches'\)[\s\S]*\.eq\('id', batchId\)[\s\S]*\.eq\('documentation_session_id', sessionId\)[\s\S]*\.eq\('organization_id', profile\.organization_id\)/)
  assert.match(data, /from\('capture_items'\)[\s\S]*\.eq\('import_batch_id', batchId\)[\s\S]*\.eq\('documentation_session_id', sessionId\)[\s\S]*\.eq\('organization_id', profile\.organization_id\)/)
})

test('bulk file import is Professional-gated, billing-aware, and usage-accounted', () => {
  assert.match(featureGates, /bulk_import: 'professional'/)
  assert.match(data, /requireWorkspaceFeatureOrRedirect\(profile, 'bulk_import', sessionId\)/)
  assert.match(actions, /canUseFeature\(profile, 'bulk_import'\)/)
  assert.match(actions, /requireActiveBillingAccess\(profile\)/)
  assert.match(actions, /requireUsageAllowance\([\s\S]*eventType: 'storage_bytes_added'/)
  assert.match(actions, /recordUsageEvent\([\s\S]*eventType: 'capture_uploaded'/)
  assert.match(actions, /recordUsageEvent\([\s\S]*eventType: 'storage_bytes_added'/)
  assert.match(importPage, /Import files/)
})

test('item library retains import batch status and review links', () => {
  assert.match(library, /source_kind[\s\S]*status[\s\S]*processed_count[\s\S]*failed_count[\s\S]*created_at/)
  assert.match(library, /evidence\/import\/\$\{batch\.id\}/)
})

test('mobile capture route and report review route remain separate', () => {
  assert.match(capturePage, /AddCaptureForm|Capture/)
  assert.match(reportPage, /Report|report/i)
  assert.doesNotMatch(capturePage, /BulkEvidenceImportForm/)
  assert.doesNotMatch(reportPage, /BulkEvidenceImportForm/)
})
