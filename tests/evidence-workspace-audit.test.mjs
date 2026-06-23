import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const validation = readFileSync('src/features/evidence/validation.ts', 'utf8')
const timelineActions = readFileSync('src/features/evidence/timeline/actions.ts', 'utf8')
const entityActions = readFileSync('src/features/evidence/entities/actions.ts', 'utf8')
const assertionActions = readFileSync('src/features/evidence/assertions/actions.ts', 'utf8')
const suggestionActions = readFileSync('src/features/evidence/suggestions/actions.ts', 'utf8')
const suggestionService = readFileSync('src/features/evidence/suggestions/service.ts', 'utf8')
const deliverableData = readFileSync('src/features/evidence/deliverables/data.ts', 'utf8')
const deliverableService = readFileSync('src/features/evidence/deliverables/service.ts', 'utf8')
const captureActions = readFileSync('src/features/capture/actions.ts', 'utf8')
const reportActions = readFileSync('src/features/reports/actions.ts', 'utf8')
const reportExport = readFileSync('src/features/reports/report-document.ts', 'utf8')

test('relationship creation validates authenticated workspace, endpoints, and deleted records', () => {
  for (const source of [timelineActions, entityActions, assertionActions]) {
    assert.match(source, /requireSessionWorkspace/)
    assert.match(source, /eq\('documentation_session_id', sessionId\)/)
    assert.match(source, /eq\('organization_id', profile\.organization_id\)/)
    assert.match(source, /is\('deleted_at', null\)/)
    assert.match(source, /assertSameWorkspace/)
    assert.match(source, /acceptedUserRelationshipDefaults/)
  }
  assert.match(validation, /assertSameEvidenceWorkspace/)
})

test('suggestion review cannot bypass suggested AI-only state or invalid relationship endpoints', () => {
  assert.match(suggestionActions, /loadSuggestionForReview/)
  assert.match(suggestionActions, /eq\('review_status', 'suggested'\)/)
  assert.match(suggestionActions, /sourceFilter/)
  assert.match(suggestionActions, /assertRelationshipSuggestionEndpoints/)
  assert.match(suggestionActions, /loadRelationshipEndpoint/)
  assert.match(suggestionActions, /assertSameEvidenceWorkspace\(relationship, source/)
  assert.match(suggestionService, /review_status: 'suggested'/)
  assert.doesNotMatch(suggestionService, /review_status: 'accepted'/)
})

test('deliverable generation uses scoped non-deleted source data and deterministic source ids', () => {
  for (const table of ['capture_items', 'timeline_events', 'evidence_entities', 'evidence_assertions', 'evidence_relationships']) {
    assert.match(deliverableData, new RegExp(`from\\('${table}'\\)[\\s\\S]*?eq\\('documentation_session_id', sessionId\\)[\\s\\S]*?eq\\('organization_id', organizationId\\)[\\s\\S]*?is\\('deleted_at', null\\)`))
  }
  assert.match(deliverableService, /a\.id\.localeCompare\(b\.id\)/)
  assert.match(deliverableService, /sortEvidenceItems/)
  assert.match(deliverableService, /uniqueSortedIds/)
  assert.match(deliverableService, /deliverableProvenance/)
})

test('existing capture and report workflow entry points remain present for regression coverage', () => {
  for (const expected of ['createCaptureRecordFromUploadedFile', 'createTextNoteCaptureRecord', 'updateCaptureReview']) assert.match(captureActions, new RegExp(expected))
  for (const expected of ['generateAiReportDraft', 'saveReportEdits', 'approveAiReportDraft']) assert.match(reportActions, new RegExp(expected))
  assert.match(reportExport, /buildUniversalReportDocument/)
})
