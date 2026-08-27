import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'

const dataSource = readFileSync('src/features/evidence/assertions/data.ts', 'utf8')
const actionSource = readFileSync('src/features/evidence/assertions/actions.ts', 'utf8')
const validationSource = readFileSync('src/features/evidence/assertions/validation.ts', 'utf8')
const componentSource = readFileSync('src/features/evidence/components/AssertionsWorkspace.tsx', 'utf8')
const assertionsPage = readFileSync('app/dashboard/sessions/[id]/assertions/page.tsx', 'utf8')

test('assertions route remains available as an advanced Review tool', () => {
  assert.ok(existsSync('app/dashboard/sessions/[id]/assertions/page.tsx'))
  assert.match(assertionsPage, /getAssertionsData\(id\)/)
  assert.match(assertionsPage, /EvidenceWorkspaceBacklinks/)
  assert.match(assertionsPage, /current="assertions"/)
})

test('assertions loader scopes session, assertions, evidence, entities, timeline events, and relationships', () => {
  assert.match(dataSource, /from\('documentation_sessions'\)[\s\S]*\.eq\('id', sessionId\)[\s\S]*\.eq\('organization_id', profile\.organization_id\)[\s\S]*\.is\('deleted_at', null\)/)
  for (const table of ['evidence_assertions', 'capture_items', 'evidence_entities', 'timeline_events', 'evidence_relationships']) {
    assert.match(dataSource, new RegExp(`from\\('${table}'\\)[\\s\\S]*\\.eq\\('documentation_session_id', sessionId\\)[\\s\\S]*\\.eq\\('organization_id', profile\\.organization_id\\)[\\s\\S]*\\.is\\('deleted_at', null\\)`))
  }
  assert.match(dataSource, /\.eq\('target_type', 'assertion'\)/)
})

test('create and update validation checks assertion types, statuses, and sources', () => {
  assert.match(validationSource, /EVIDENCE_ASSERTION_TYPES\.includes/)
  assert.match(validationSource, /parseSuggestionReviewStatus/)
  assert.match(validationSource, /parseSuggestionSource/)
  assert.match(actionSource, /parseAssertionForm\(formData\)/)
  assert.match(actionSource, /reviewed_at: values\.review_status === 'accepted'/)
})

test('human-created assertions default accepted and AI or suggested sources remain suggested', () => {
  assert.match(validationSource, /defaultSuggestionReviewStatus/)
  const sharedValidationSource = readFileSync('src/features/evidence/validation.ts', 'utf8')
  assert.match(sharedValidationSource, /suggestionSource === 'user'\) return requestedStatus \?\? 'accepted'/)
  assert.match(sharedValidationSource, /return 'suggested'/)
})

test('assertion relationship validation rejects invalid and cross workspace links', () => {
  assert.match(validationSource, /sourceType === 'capture_item' \? \['supports', 'contradicts', 'references'\]/)
  assert.match(validationSource, /sourceType === 'timeline_event' \? \['documents', 'supports', 'references'\]/)
  assert.match(validationSource, /EVIDENCE_RELATIONSHIP_TYPES\.includes/)
  assert.match(validationSource, /assertSameEvidenceWorkspace/)
  const sharedValidationSource = readFileSync('src/features/evidence/validation.ts', 'utf8')
  assert.match(sharedValidationSource, /documentation_session_id !== right\.documentation_session_id/)
  assert.match(sharedValidationSource, /organization_id !== right\.organization_id/)
  assert.match(actionSource, /loadAssertion\(supabase, assertionId, sessionId, profile\.organization_id\)/)
  assert.match(actionSource, /loadSource\(supabase, sourceType, sourceId, sessionId, profile\.organization_id\)/)
  assert.match(actionSource, /assertSameWorkspace\(assertion, source\)/)
})

test('assertion links are accepted user relationships and unlink by soft delete', () => {
  assert.match(actionSource, /target_type: 'assertion'/)
  assert.match(actionSource, /source_type: sourceType/)
  assert.match(actionSource, /acceptedUserRelationshipDefaults/)
  assert.match(actionSource, /softDeleteUpdate/)
})

test('assertions UI exposes required copy, fields, counts, and linking controls', () => {
  for (const expected of ['Factual Observations', 'assertion_type', 'statement', 'review_status', 'suggestion_source', 'Linked items', 'Linked entities', 'Linked timeline events', 'supports', 'contradicts', 'references', 'documents']) {
    assert.ok(componentSource.includes(expected) || assertionsPage.includes(expected), `missing ${expected}`)
  }
})

test('assertions UI copy avoids regulated decision language', () => {
  const combined = `${assertionsPage}\n${componentSource}`.toLowerCase()
  for (const forbidden of ['legal claims', 'liability', 'fault', 'diagnosis', 'coverage decision']) {
    assert.equal(new RegExp(`\\b${forbidden}\\b`).test(combined), false, `found ${forbidden}`)
  }
})
