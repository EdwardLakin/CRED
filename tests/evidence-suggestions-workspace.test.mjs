import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const routeSource = readFileSync('app/dashboard/sessions/[id]/suggestions/page.tsx', 'utf8')
const dataSource = readFileSync('src/features/evidence/suggestions/data.ts', 'utf8')
const serviceSource = readFileSync('src/features/evidence/suggestions/service.ts', 'utf8')
const actionsSource = readFileSync('src/features/evidence/suggestions/actions.ts', 'utf8')
const validationSource = readFileSync('src/features/evidence/suggestions/validation.ts', 'utf8')
const workspaceSource = readFileSync('src/features/evidence/suggestions/components/SuggestionsWorkspace.tsx', 'utf8')
const cardSource = readFileSync('src/features/evidence/suggestions/components/SuggestionCard.tsx', 'utf8')
const navSource = readFileSync('src/features/evidence/components/EvidenceWorkspaceNav.tsx', 'utf8')

test('suggestion route renders the AI suggestions workspace', () => {
  assert.match(routeSource, /getSuggestionsData/)
  assert.match(routeSource, /SuggestionsWorkspace/)
  assert.match(routeSource, /current="suggestions"/)
})

test('AI suggestions default to suggested and never automatically accepted', () => {
  assert.match(serviceSource, /source_kind: 'ai'[\s\S]*review_status: 'suggested'/)
  assert.match(serviceSource, /suggestion_source: 'ai'[\s\S]*review_status: 'suggested'/)
  assert.match(validationSource, /AI suggestions must default to suggested/)
  assert.doesNotMatch(serviceSource, /review_status: 'accepted'/)
})

test('acceptance, edit-and-accept, and rejection flows update review status only after review', () => {
  assert.match(actionsSource, /decision === 'edited' \? parseEditedSuggestion/)
  assert.match(actionsSource, /review_status: decision/)
  for (const label of ['Accept', 'Edit and Accept', 'Reject']) assert.match(cardSource, new RegExp(label))
  for (const decision of ['accepted', 'edited', 'rejected']) assert.match(cardSource, new RegExp(`value="${decision}"`))
})

test('provenance and source items are preserved and displayed', () => {
  assert.match(serviceSource, /source_evidence_ids/)
  assert.match(serviceSource, /reasoning_summary/)
  assert.match(cardSource, /Source items/)
  assert.match(cardSource, /provenanceSummary/)
  assert.match(cardSource, /sourceEvidenceSummary/)
})

test('suggestions are scoped to session and organization', () => {
  for (const table of ['documentation_sessions', 'capture_items', 'timeline_events', 'evidence_entities', 'evidence_assertions', 'evidence_relationships']) {
    assert.match(dataSource + actionsSource + serviceSource, new RegExp(`from\\('${table}'\\)[\\s\\S]*?eq\\('organization_id'`))
  }
  assert.match(actionsSource, /eq\('documentation_session_id', sessionId\)/)
  assert.match(dataSource, /eq\('documentation_session_id', sessionId\)/)
})

test('workspace shows all suggestion categories and navigation includes suggestions', () => {
  for (const heading of ['Timeline Suggestions', 'Entity Suggestions', 'Observation Suggestions', 'Connection Suggestions']) assert.match(workspaceSource, new RegExp(heading))
  assert.match(navSource, /suggestions/)
  assert.match(navSource, /Suggestions/)
})

test('prompt forbids conclusions and requires confidence reasoning and source IDs', () => {
  for (const phrase of ['liability', 'fault', 'diagnosis', 'compliance outcome', 'legal conclusions', 'financial recommendations', 'source item IDs', 'source_evidence_ids', 'confidence', 'reasoning summary']) assert.match(validationSource, new RegExp(phrase))
})
