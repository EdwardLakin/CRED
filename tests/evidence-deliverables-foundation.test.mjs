import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync('app/dashboard/sessions/[id]/deliverables/page.tsx', 'utf8')
const data = readFileSync('src/features/evidence/deliverables/data.ts', 'utf8')
const actions = readFileSync('src/features/evidence/deliverables/actions.ts', 'utf8')
const service = readFileSync('src/features/evidence/deliverables/service.ts', 'utf8')
const validation = readFileSync('src/features/evidence/deliverables/validation.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260622150000_evidence_deliverables_foundation.sql', 'utf8')
const types = readFileSync('src/lib/supabase/database.types.ts', 'utf8')
const nav = readFileSync('src/features/evidence/components/EvidenceWorkspaceNav.tsx', 'utf8')
const sessionPage = readFileSync('app/dashboard/sessions/[id]/page.tsx', 'utf8')

test('deliverables route and table foundation are present', () => {
  assert.match(route, /getDeliverablesData\(id\)/)
  assert.match(route, /DeliverablesWorkspace/)
  assert.match(migration, /create table if not exists public\.evidence_deliverables/)
  assert.match(types, /evidence_deliverables:/)
})

test('generation validation is limited to phase one deliverable types', () => {
  assert.match(validation, /'chronology', 'evidence_index', 'observation_summary'/)
  for (const unsupported of ['legal', 'insurance', 'compliance', 'investigation', 'template']) assert.doesNotMatch(validation, new RegExp(unsupported))
  assert.match(actions, /parseDeliverableType/)
  assert.match(actions, /assertSession/)
})

test('chronology ordering and output fields are deterministic', () => {
  assert.match(service, /event_start_at \?\? a\.event_time \?\? a\.created_at/)
  for (const field of ['linked_evidence_count', 'linked_entities', 'linked_factual_observations']) assert.match(service, new RegExp(field))
})

test('evidence index and observation summary generation fields are present', () => {
  for (const field of ['identifier', 'source_kind', 'captured_date', 'source_date', 'review_status', 'include_in_outputs']) assert.match(service, new RegExp(field))
  for (const field of ['factual_observation', 'supporting_evidence_count', 'contradicting_evidence_count', 'linked_entities', 'linked_timeline_events']) assert.match(service, new RegExp(field))
})

test('session and organization scoping with deleted record filtering are enforced', () => {
  for (const table of ['documentation_sessions', 'capture_items', 'timeline_events', 'evidence_entities', 'evidence_assertions', 'evidence_relationships', 'evidence_deliverables']) {
    assert.match(data + actions, new RegExp(`from\\('${table}'\\).*eq\\('organization_id'`))
  }
  assert.match(data, /is\('deleted_at', null\).*order\('captured_at'/s)
  assert.match(data, /from\('evidence_relationships'\).*is\('deleted_at', null\)/s)
})

test('deliverables preserve provenance and source identifiers', () => {
  assert.match(service, /source_ids/)
  assert.match(validation, /deliverableProvenance/)
  assert.match(validation, /generated_from: 'evidence_workspace'/)
  assert.match(migration, /provenance jsonb not null/)
})

test('navigation links include deliverables outside capture workflow', () => {
  assert.match(nav, /deliverables/)
  assert.match(sessionPage, /dashboard\/sessions\/\$\{session\.id\}\/deliverables/)
  const capturePage = readFileSync('app/dashboard/sessions/[id]/capture/page.tsx', 'utf8')
  assert.doesNotMatch(capturePage, /deliverables/i)
})
