import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const routeSource = readFileSync('app/dashboard/sessions/[id]/evidence/review/page.tsx', 'utf8')
const dataSource = readFileSync('src/features/evidence/review/data.ts', 'utf8')
const actionsSource = readFileSync('src/features/evidence/review/actions.ts', 'utf8')
const workspaceSource = readFileSync('src/features/evidence/review/components/ReviewQueueWorkspace.tsx', 'utf8')
const navSource = readFileSync('src/features/evidence/components/EvidenceWorkspaceNav.tsx', 'utf8')
const batchRouteSource = readFileSync('app/dashboard/sessions/[id]/evidence/import/[batchId]/page.tsx', 'utf8')

test('review queue route renders the dedicated workspace', () => {
  assert.match(routeSource, /getReviewQueueData/)
  assert.match(routeSource, /ReviewQueueWorkspace/)
  assert.match(routeSource, /current="review"/)
})

test('queue counts cover all pending review categories', () => {
  for (const counter of ['unreviewedEvidence', 'evidenceNeedsFollowup', 'suggestedEntities', 'suggestedAssertions', 'suggestedTimelineEvents', 'suggestedRelationships']) assert.match(dataSource + workspaceSource, new RegExp(counter))
  for (const label of ['Unreviewed Items', 'Items Needing Follow-up', 'Suggested Entities', 'Suggested Observations', 'Suggested Timeline Events', 'Suggested Connections']) assert.match(workspaceSource, new RegExp(label))
})

test('pending-only filtering excludes accepted and rejected items by default', () => {
  assert.match(dataSource, /evidence_review_status === 'unreviewed'/)
  assert.match(dataSource, /evidence_review_status === 'needs_followup'/)
  assert.match(dataSource, /eq\('review_status', 'suggested'\)/)
  assert.doesNotMatch(dataSource, /review_status', 'accepted'/)
  assert.doesNotMatch(dataSource, /review_status', 'rejected'/)
})

test('review next progress and estimated remaining are displayed', () => {
  assert.match(workspaceSource, /Review Next/)
  assert.match(workspaceSource, /Review Progress/)
  assert.match(workspaceSource, /Estimated remaining items/)
})

test('quick and bulk actions are human-triggered and scoped to selected records', () => {
  for (const action of ['quickReviewEvidence', 'bulkReviewEvidence', 'quickReviewSuggestion', 'bulkReviewSuggestions']) assert.match(actionsSource + workspaceSource, new RegExp(action))
  assert.match(actionsSource, /formData\.getAll\('selected'\)/)
  assert.match(actionsSource, /\.in\('id', ids\)/)
  assert.match(workspaceSource, /type="checkbox" name="selected"/)
})

test('session org isolation and deleted record filtering are enforced', () => {
  for (const source of [dataSource, actionsSource]) {
    assert.match(source, /eq\('documentation_session_id', sessionId\)/)
    assert.match(source, /eq\('organization_id', profile\.organization_id\)/)
    assert.match(source, /is\('deleted_at', null\)/)
  }
})

test('review queue navigation links are present in workspaces', () => {
  assert.match(navSource, /Advanced Review/)
  assert.match(navSource, /evidence\/review/)
  assert.match(batchRouteSource, /Open Advanced Review/)
})
