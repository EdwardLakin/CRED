import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sessionPage = readFileSync('app/dashboard/sessions/[id]/page.tsx', 'utf8')
const navComponent = readFileSync('src/features/evidence/components/EvidenceWorkspaceNav.tsx', 'utf8')
const constants = readFileSync('src/features/evidence/constants.ts', 'utf8')
const evidenceForms = readFileSync('src/features/evidence/components/EvidenceForms.tsx', 'utf8')
const timelineComponent = readFileSync('src/features/evidence/components/TimelineWorkspace.tsx', 'utf8')
const pages = [
  readFileSync('app/dashboard/sessions/[id]/evidence/page.tsx', 'utf8'),
  readFileSync('app/dashboard/sessions/[id]/timeline/page.tsx', 'utf8'),
  readFileSync('app/dashboard/sessions/[id]/entities/page.tsx', 'utf8'),
  readFileSync('app/dashboard/sessions/[id]/assertions/page.tsx', 'utf8'),
]

test('session detail renders a unified Evidence Workspace overview with all counts', () => {
  assert.match(sessionPage, /EvidenceWorkspaceNav/)
  for (const table of ['capture_items', 'timeline_events', 'evidence_entities', 'evidence_assertions', 'evidence_relationships']) {
    assert.match(sessionPage, new RegExp(`from\\('${table}'\\).*count: 'exact'`))
  }
  for (const label of ['Evidence items', 'Timeline events', 'Entities', 'Factual observations', 'Relationships']) {
    assert.match(navComponent, new RegExp(label))
  }
})

test('workspace navigation cards and backlinks use the standard workspace labels', () => {
  for (const label of ['Evidence Library', 'Timeline', 'Entities', 'Factual Observations', 'Deliverables', 'Existing Report']) {
    assert.match(constants, new RegExp(label))
    assert.match(navComponent, new RegExp(label))
  }
  for (const page of pages) assert.match(page, /EvidenceWorkspaceBacklinks/)
})

test('workspace review and output labels are standardized without restricted language', () => {
  for (const label of ['Include in outputs', 'Suggested', 'Accepted', 'Edited', 'Rejected', 'Needs review', 'Unreviewed']) {
    assert.match(constants, new RegExp(label))
  }
  assert.match(evidenceForms, /formatEvidenceReviewStatus/)
  assert.match(timelineComponent, /formatSuggestionReviewStatus/)
  assert.doesNotMatch(navComponent, /industry-specific/i)
})
