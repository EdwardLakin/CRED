import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync('app/dashboard/sessions/[id]/evidence/import/[batchId]/page.tsx', 'utf8')
const actionsSource = readFileSync('src/features/evidence/import/actions.ts', 'utf8')
const dataSource = readFileSync('src/features/evidence/import/data.ts', 'utf8')
const validationSource = readFileSync('src/features/evidence/import/validation.ts', 'utf8')
const reviewSource = readFileSync('src/features/evidence/import/components/EvidenceImportBatchReview.tsx', 'utf8')
const progressSource = readFileSync('src/features/evidence/import/components/EvidenceImportReviewProgress.tsx', 'utf8')
const itemSource = readFileSync('src/features/evidence/import/components/EvidenceImportReviewItem.tsx', 'utf8')
const bulkSource = readFileSync('src/features/evidence/import/components/EvidenceImportBulkActions.tsx', 'utf8')
const suggestionPanelSource = readFileSync('src/features/evidence/import/components/EvidenceImportSuggestionPanel.tsx', 'utf8')
const suggestionServiceSource = readFileSync('src/features/evidence/suggestions/service.ts', 'utf8')

test('batch review route renders review workspace', () => {
  assert.match(pageSource, /EvidenceImportBatchReview/)
  for (const expected of ['Items', 'Suggestions', 'Connections', 'Deliverables']) assert.match(reviewSource, new RegExp(expected))
})

test('progress counts are correct', () => {
  for (const expected of ['total', 'reviewed', 'unreviewed', 'needsFollowup', 'excluded', 'includedInOutputs']) assert.match(progressSource, new RegExp(expected))
  assert.match(progressSource, /evidence_review_status === 'needs_followup'/)
  assert.match(progressSource, /include_in_report/)
})

test('per-item review actions validate statuses', () => {
  assert.match(validationSource, /EVIDENCE_REVIEW_STATUSES/)
  assert.match(actionsSource, /parseBatchEvidenceReviewStatus/)
  assert.match(itemSource, /Mark reviewed/)
  assert.match(itemSource, /Mark needs follow-up/)
  assert.match(itemSource, /Exclude from item review/)
})

test('output inclusion actions preserve include_in_report behavior', () => {
  assert.match(actionsSource, /include_in_report: include/)
  assert.match(itemSource, /Include in outputs/)
  assert.match(itemSource, /Exclude from outputs/)
  assert.doesNotMatch(actionsSource, /evidence_review_status: 'excluded'.*include_in_report/s)
})

test('bulk review actions only affect same-batch items', () => {
  assert.match(actionsSource, /bulkUpdateBatchEvidenceReviewStatus/)
  assert.match(actionsSource, /eq\('import_batch_id', batchId\)/)
  assert.match(actionsSource, /scope'\) === 'all_unreviewed'/)
})

test('cross-session and cross-org selected item IDs are rejected', () => {
  assert.match(actionsSource, /rows\.length !== new Set\(ids\)\.size/)
  assert.match(actionsSource, /eq\('documentation_session_id', sessionId\)/)
  assert.match(actionsSource, /eq\('organization_id', organizationId\)/)
})

test('deleted items cannot be modified', () => {
  assert.match(dataSource, /is\('deleted_at', null\)/)
  assert.match(actionsSource, /is\('deleted_at', null\)/)
})

test('batch-scoped suggestion generation only uses allowed batch evidence', () => {
  assert.match(actionsSource, /generateSuggestionsForImportBatch/)
  assert.match(actionsSource, /generateSuggestionsForSelectedBatchEvidence/)
  assert.match(actionsSource, /evidence_review_status !== 'excluded'/)
  assert.match(actionsSource, /item\.include_in_report/)
})

test('AI suggestions remain suggested and source evidence IDs are preserved', () => {
  assert.match(suggestionServiceSource, /review_status: 'suggested'/)
  assert.match(suggestionServiceSource, /source_evidence_ids: sourceEvidenceIds/)
  assert.match(suggestionServiceSource, /generateEvidenceSuggestionsForCaptures/)
})

test('existing Suggestions workspace and report/export behavior remain unchanged', () => {
  assert.doesNotMatch(actionsSource, /accepted|verified/)
  assert.match(suggestionPanelSource, /not generated yet/)
  assert.match(bulkSource, /Generate suggestions from selected items/)
})
