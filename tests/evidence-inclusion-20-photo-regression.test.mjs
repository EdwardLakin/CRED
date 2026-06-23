import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const inclusionSource = readFileSync('src/features/reports/capture-inclusion.ts', 'utf8')
const deliverableSource = readFileSync('src/features/evidence/deliverables/service.ts', 'utf8')

function isCaptureIncludedInOutput(capture) {
  const status = capture.evidence_review_status ?? capture.review_status ?? null
  if (capture.deleted_at != null) return false
  if (capture.extracted_data?.hidden_from_report === true || capture.extracted_data?.internal === true || capture.extracted_data?.internal_only === true || capture.extracted_data?.debug === true) return false
  if (capture.capture_ai_analysis?.hidden_from_report === true || capture.capture_ai_analysis?.internal === true || capture.capture_ai_analysis?.internal_only === true || capture.capture_ai_analysis?.debug === true) return false
  if (capture.include_in_report === false) return false
  if (status === 'excluded') return false
  const source = `${capture.source_kind ?? capture.suggestion_source ?? ''}`.toLowerCase()
  if (source === 'ai' || source === 'system' || source === 'suggested' || source === 'system_suggested') return status === 'reviewed'
  return true
}

function applyDeliverableSourceSelection(data) {
  return { ...data, evidenceItems: data.evidenceItems.filter(isCaptureIncludedInOutput) }
}

function generateEvidenceIndex(data) {
  const evidenceItems = applyDeliverableSourceSelection(data).evidenceItems
  return { content: { items: evidenceItems.map((item) => ({ evidence_item_id: item.id })) }, source_ids: { evidence_item_ids: evidenceItems.map((item) => item.id) } }
}

function capture(overrides = {}) {
  return {
    id: overrides.id ?? `capture-${Math.random()}`,
    documentation_session_id: 'session-1',
    organization_id: 'org-1',
    deleted_at: null,
    include_in_report: true,
    evidence_review_status: 'unreviewed',
    review_status: null,
    extracted_data: {},
    capture_ai_analysis: {},
    source_kind: 'upload',
    media_kind: 'image',
    type: 'photo',
    storage_path: `${overrides.id ?? 'capture'}.jpg`,
    thumbnail_path: null,
    original_filename: overrides.original_filename ?? 'IMG_0001.jpg',
    technician_note: overrides.technician_note ?? null,
    ai_summary: overrides.ai_summary ?? null,
    captured_at: '2026-06-23T10:00:00.000Z',
    created_at: '2026-06-23T10:00:00.000Z',
    import_batch_id: null,
    ...overrides,
  }
}

function sourceData(evidenceItems) {
  return { sessionId: 'session-1', organizationId: 'org-1', evidenceItems, timelineEvents: [], entities: [], assertions: [], relationships: [] }
}

test('20 unreviewed technician photos remain output eligible without accepted suggestions', () => {
  assert.match(inclusionSource, /if \(reviewStatus === 'excluded'\) return false/)
  assert.match(deliverableSource, /return isCaptureIncludedInOutput\(item\)/)
  const captures = Array.from({ length: 20 }, (_, index) => capture({
    id: `photo-${index + 1}`,
    original_filename: index % 5 === 0 ? `IMG_${index + 1}.jpg` : `tool-photo-${index + 1}.jpg`,
    technician_note: index % 3 === 0 ? `Technician note ${index + 1}` : null,
    capture_ai_analysis: index % 4 === 0 ? { extraction: { status: 'failed' } } : {},
  }))

  const included = captures.filter(isCaptureIncludedInOutput)
  assert.equal(included.length, 20)
  assert.deepEqual(new Set(included.map((item) => item.id)).size, 20)
  for (const note of captures.filter((item) => item.technician_note).map((item) => item.technician_note)) assert.ok(included.some((item) => item.technician_note === note))
  assert.ok(included.some((item) => item.original_filename?.startsWith('IMG_')))

  const selected = applyDeliverableSourceSelection(sourceData(captures)).evidenceItems
  assert.equal(selected.length, 20)
  assert.deepEqual(selected.map((item) => item.id).sort(), captures.map((item) => item.id).sort())

  const index = generateEvidenceIndex(sourceData(captures))
  assert.equal(index.content.items.length, 20)
  assert.deepEqual(index.source_ids.evidence_item_ids.sort(), captures.map((item) => item.id).sort())
})

test('canonical exclusions reduce the 20 photo set to 16', () => {
  const captures = Array.from({ length: 20 }, (_, index) => capture({ id: `photo-${index + 1}` }))
  captures[0].evidence_review_status = 'excluded'
  captures[1].include_in_report = false
  captures[2].deleted_at = '2026-06-23T11:00:00.000Z'
  captures[3].extracted_data = { internal_only: true }

  assert.equal(captures.filter(isCaptureIncludedInOutput).length, 16)
  assert.equal(applyDeliverableSourceSelection(sourceData(captures)).evidenceItems.length, 16)
})

test('capture statuses are separate from suggestion statuses and AI captures stay gated', () => {
  assert.equal(isCaptureIncludedInOutput(capture({ evidence_review_status: 'unreviewed' })), true)
  assert.equal(isCaptureIncludedInOutput(capture({ evidence_review_status: 'reviewed' })), true)
  assert.equal(isCaptureIncludedInOutput(capture({ evidence_review_status: 'needs_followup' })), true)
  assert.equal(isCaptureIncludedInOutput(capture({ evidence_review_status: 'excluded' })), false)
  assert.equal(isCaptureIncludedInOutput(capture({ source_kind: 'ai', evidence_review_status: 'unreviewed' })), false)
  assert.equal(isCaptureIncludedInOutput(capture({ source_kind: 'ai', evidence_review_status: 'reviewed' })), true)
})
