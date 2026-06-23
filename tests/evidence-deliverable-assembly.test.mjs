import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workspace = readFileSync('src/features/evidence/deliverables/components/DeliverablesWorkspace.tsx', 'utf8')
const panel = readFileSync('src/features/evidence/deliverables/components/DeliverableAssemblyPanel.tsx', 'utf8')
const selector = readFileSync('src/features/evidence/deliverables/components/DeliverableSourceSelector.tsx', 'utf8')
const counts = readFileSync('src/features/evidence/deliverables/components/DeliverableSourceCounts.tsx', 'utf8')
const preview = readFileSync('src/features/evidence/deliverables/components/DeliverableSourcePreview.tsx', 'utf8')
const options = readFileSync('src/features/evidence/deliverables/components/DeliverableGenerationOptions.tsx', 'utf8')
const data = readFileSync('src/features/evidence/deliverables/data.ts', 'utf8')
const actions = readFileSync('src/features/evidence/deliverables/actions.ts', 'utf8')
const service = readFileSync('src/features/evidence/deliverables/service.ts', 'utf8')
const validation = readFileSync('src/features/evidence/deliverables/validation.ts', 'utf8')

test('assembly UI renders on deliverables route with generation controls and preview', () => {
  assert.match(workspace, /DeliverableAssemblyPanel/)
  assert.match(panel, /Deliverable assembly/)
  assert.match(options + data, /Chronology|Evidence Index|Observation Summary/)
  assert.match(selector, /selectedImportBatchIds/)
  assert.match(selector, /selectedCaptureItemIds/)
  assert.match(selector, /selectedTimelineEventIds/)
  assert.match(selector, /selectedEntityIds/)
  assert.match(selector, /selectedAssertionIds/)
  assert.match(preview, /Preview source set/)
})

test('source counts are shown deterministically before generation', () => {
  for (const label of ['Evidence items selected', 'Import batches selected', 'Timeline events selected', 'Entities selected', 'Factual observations selected', 'Relationships selected']) assert.match(counts, new RegExp(label))
  assert.match(data, /getDeliverableSourceCounts/)
  assert.match(data, /new Set\(sourceData\.evidenceItems/)
})

test('default source set uses canonical output-included technician evidence and accepted-edited graph material', () => {
  assert.match(service, /isCaptureIncludedInOutput\(item\)/)
  assert.match(service, /item\.evidence_review_status === 'needs_followup'/)
  assert.match(validation, /review_status === 'rejected'/)
  assert.match(validation, /review_status === 'suggested'/)
  assert.match(validation, /'accepted', 'edited'/)
  assert.match(validation, /deleted_at/)
})

test('source selection narrows batches, evidence, timeline, observations, and entities', () => {
  for (const token of ['selectedImportBatchIds', 'selectedCaptureItemIds', 'selectedTimelineEventIds', 'selectedEntityIds', 'selectedAssertionIds']) assert.match(service + validation + actions, new RegExp(token))
  assert.match(service, /selectedImportBatchIds\.size > 0/)
  assert.match(service, /selectedCaptureItemIds\.size > 0/)
  assert.match(service, /filterReviewed\(data\.timelineEvents/)
  assert.match(service, /filterReviewed\(data\.entities/)
  assert.match(service, /filterReviewed\(data\.assertions/)
})

test('invalid cross-scope or deleted selected IDs are rejected', () => {
  assert.match(service, /ensureSelectedIdsExist/)
  assert.match(validation, /Deliverables must stay within the same session and organization/)
  assert.match(validation, /Deleted source records cannot be included/)
  assert.match(data, /from\('evidence_import_batches'\).*eq\('organization_id'/s)
})

test('generated deliverable provenance preserves selected source options and one-click still works', () => {
  assert.match(actions, /parseDeliverableSourceSelection/)
  assert.match(data, /createDeliverableRecord[\s\S]*sourceSelection\?/)
  assert.match(service, /sourceSelection: DeliverableSourceSelection = defaultDeliverableSourceSelection/)
  assert.match(validation, /source_selection: sourceSelection/)
  assert.match(workspace, /DeliverableCard/)
})
