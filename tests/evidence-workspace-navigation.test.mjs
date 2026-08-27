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

test('session root resumes the simple flow while advanced workspace navigation remains available', () => {
  assert.doesNotMatch(sessionPage, /EvidenceWorkspaceNav/)
  assert.match(sessionPage, /redirect\(`\/dashboard\/sessions\/\$\{session\.id\}\/capture`\)/)
  assert.match(sessionPage, /redirect\(`\/dashboard\/sessions\/\$\{session\.id\}\/report`\)/)
  for (const label of ['Items', 'Timeline events', 'Entities', 'Factual observations', 'Connections']) {
    assert.match(navComponent, new RegExp(label))
  }
})

test('workspace navigation cards and backlinks use the standard workspace labels', () => {
  for (const label of ['Items', 'Timeline', 'Entities', 'Factual Observations', 'Additional Outputs', 'Report']) {
    assert.match(constants, new RegExp(label))
  }
  for (const key of ['library', 'timeline', 'entities', 'assertions', 'deliverables', 'report']) assert.match(navComponent, new RegExp(`EVIDENCE_WORKSPACE_LABELS\\.${key}`))
  for (const page of pages) assert.match(page, /EvidenceWorkspaceBacklinks/)
})

test('workspace review and output labels are standardized without restricted language', () => {
  for (const label of ['Include in report', 'Suggested', 'Accepted', 'Edited', 'Rejected', 'Needs review', 'Unreviewed']) {
    assert.match(constants, new RegExp(label))
  }
  assert.match(evidenceForms, /formatEvidenceReviewStatus/)
  assert.match(timelineComponent, /formatSuggestionReviewStatus/)
  assert.doesNotMatch(navComponent, /industry-specific/i)
})
