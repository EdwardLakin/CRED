import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const routeSource = readFileSync('app/dashboard/sessions/[id]/relationships/page.tsx', 'utf8')
const dataSource = readFileSync('src/features/evidence/relationships/data.ts', 'utf8')
const explorerSource = readFileSync('src/features/evidence/relationships/components/RelationshipExplorer.tsx', 'utf8')
const summarySource = readFileSync('src/features/evidence/relationships/components/RelationshipSummaryCards.tsx', 'utf8')
const listSource = readFileSync('src/features/evidence/relationships/components/RelationshipList.tsx', 'utf8')
const badgeSource = readFileSync('src/features/evidence/relationships/components/RelationshipBadge.tsx', 'utf8')
const navSource = readFileSync('src/features/evidence/components/EvidenceWorkspaceNav.tsx', 'utf8')
const sessionSource = readFileSync('app/dashboard/sessions/[id]/page.tsx', 'utf8')

test('relationship route renders the relationship explorer workspace', () => {
  assert.match(routeSource, /getRelationshipExplorerData/)
  assert.match(routeSource, /RelationshipExplorer/)
  assert.match(routeSource, /current="relationships"/)
})

test('relationship loader is session and organization scoped and filters deleted records', () => {
  for (const table of ['documentation_sessions', 'evidence_relationships', 'capture_items', 'timeline_events', 'evidence_entities', 'evidence_assertions']) {
    assert.match(dataSource, new RegExp(`from\\('${table}'\\)[\\s\\S]*?eq\\('documentation_session_id'|from\\('${table}'\\)[\\s\\S]*?eq\\('id'`))
    assert.match(dataSource, new RegExp(`from\\('${table}'\\)[\\s\\S]*?eq\\('organization_id', profile\\.organization_id\\)`))
    assert.match(dataSource, new RegExp(`from\\('${table}'\\)[\\s\\S]*?is\\('deleted_at', null\\)`))
  }
})

test('relationship summary counts key graph edges', () => {
  for (const label of ['Total relationships', 'Evidence linked to events', 'Evidence linked to entities', 'Evidence linked to observations', 'Events linked to entities', 'Events linked to observations', 'Entities linked to observations']) {
    assert.match(summarySource, new RegExp(label))
  }
  for (const key of ['evidenceLinkedToEvents', 'evidenceLinkedToEntities', 'evidenceLinkedToObservations', 'eventsLinkedToEntities', 'eventsLinkedToObservations', 'entitiesLinkedToObservations']) {
    assert.match(dataSource, new RegExp(key))
  }
})

test('relationship explorer renders grouped relationship views', () => {
  for (const heading of ['Evidence Relationships', 'Timeline Relationships', 'Entity Relationships', 'Observation Relationships']) {
    assert.match(explorerSource, new RegExp(heading))
  }
  assert.match(explorerSource, /supporting evidence/i)
  assert.match(explorerSource, /contradicting evidence/i)
})

test('relationship detail displays review status and provenance consistently', () => {
  assert.match(badgeSource, /formatRelationshipReviewStatus/)
  for (const detail of ['Relationship type', 'Suggestion source', 'Review status', 'Created date']) {
    assert.match(listSource, new RegExp(detail))
  }
  assert.match(listSource, /provenanceSummary/)
})

test('workspace navigation links to relationship explorer', () => {
  assert.match(navSource, /relationships/)
  assert.match(navSource, /EVIDENCE_WORKSPACE_LABELS\.relationships/)
  assert.match(sessionSource, /feature\.hrefSegment/)
})
