import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'

const dataSource = readFileSync('src/features/evidence/entities/data.ts', 'utf8')
const actionSource = readFileSync('src/features/evidence/entities/actions.ts', 'utf8')
const validationSource = readFileSync('src/features/evidence/entities/validation.ts', 'utf8')
const componentSource = readFileSync('src/features/evidence/components/EntitiesWorkspace.tsx', 'utf8')
const sessionPage = readFileSync('app/dashboard/sessions/[id]/page.tsx', 'utf8')
const entitiesPage = readFileSync('app/dashboard/sessions/[id]/entities/page.tsx', 'utf8')

test('entities route and session navigation are present', () => {
  assert.ok(existsSync('app/dashboard/sessions/[id]/entities/page.tsx'))
  assert.match(entitiesPage, /getEntitiesData\(id\)/)
  assert.match(sessionPage, /\/entities`}/)
  assert.match(sessionPage, /Entities/)
})

test('entities loader scopes session, entities, evidence, timeline events, and relationships', () => {
  assert.match(dataSource, /from\('documentation_sessions'\)[\s\S]*\.eq\('id', sessionId\)[\s\S]*\.eq\('organization_id', profile\.organization_id\)[\s\S]*\.is\('deleted_at', null\)/)
  for (const table of ['evidence_entities', 'capture_items', 'timeline_events', 'evidence_relationships']) {
    assert.match(dataSource, new RegExp(`from\\('${table}'\\)[\\s\\S]*\\.eq\\('documentation_session_id', sessionId\\)[\\s\\S]*\\.eq\\('organization_id', profile\\.organization_id\\)[\\s\\S]*\\.is\\('deleted_at', null\\)`))
  }
  assert.match(dataSource, /\.eq\('target_type', 'entity'\)/)
})

test('entity create and update validation checks types, statuses, and sources', () => {
  assert.match(validationSource, /EVIDENCE_ENTITY_TYPES\.includes/)
  assert.match(validationSource, /parseSuggestionReviewStatus/)
  assert.match(validationSource, /parseSuggestionSource/)
  assert.match(actionSource, /parseEntityForm\(formData\)/)
  assert.match(actionSource, /reviewed_at: values\.review_status === 'accepted'/)
})

test('human-created entities default accepted and AI or suggested sources remain suggested', () => {
  assert.match(validationSource, /defaultSuggestionReviewStatus/)
  const sharedValidationSource = readFileSync('src/features/evidence/validation.ts', 'utf8')
  assert.match(sharedValidationSource, /suggestionSource === 'user'\) return requestedStatus \?\? 'accepted'/)
  assert.match(sharedValidationSource, /return 'suggested'/)
})

test('entity relationship validation allows only entity links and rejects cross workspace sources', () => {
  assert.match(validationSource, /sourceType === 'timeline_event' \? \['involves'\] : \['mentions', 'depicts'\]/)
  assert.match(validationSource, /EVIDENCE_RELATIONSHIP_TYPES\.includes/)
  assert.match(validationSource, /assertSameEvidenceWorkspace/)
  const sharedValidationSource = readFileSync('src/features/evidence/validation.ts', 'utf8')
  assert.match(sharedValidationSource, /documentation_session_id !== right\.documentation_session_id/)
  assert.match(sharedValidationSource, /organization_id !== right\.organization_id/)
  assert.match(actionSource, /loadEntity\(supabase, entityId, sessionId, profile\.organization_id\)/)
  assert.match(actionSource, /loadSource\(supabase, sourceType, sourceId, sessionId, profile\.organization_id\)/)
  assert.match(actionSource, /assertSameWorkspace\(entity, source\)/)
})

test('entity relationships are accepted user links to entities and unlink by soft delete', () => {
  assert.match(actionSource, /target_type: 'entity'/)
  assert.match(actionSource, /source_type: sourceType/)
  assert.match(actionSource, /acceptedUserRelationshipDefaults/)
  assert.match(actionSource, /softDeleteUpdate/)
})

test('entities UI exposes required fields, counts, and linking controls', () => {
  for (const expected of ['entity_type', 'display_name', 'description', 'attributes', 'review_status', 'suggestion_source', 'Linked evidence count', 'Linked timeline event count', 'mentions', 'depicts', 'involves']) {
    assert.ok(componentSource.includes(expected), `missing ${expected}`)
  }
})
