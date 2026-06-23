import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync('supabase/migrations/20260623110000_evidence_relationship_active_uniqueness.sql', 'utf8')
const errors = readFileSync('src/features/evidence/relationship-errors.ts', 'utf8')
const timelineActions = readFileSync('src/features/evidence/timeline/actions.ts', 'utf8')
const entityActions = readFileSync('src/features/evidence/entities/actions.ts', 'utf8')
const assertionActions = readFileSync('src/features/evidence/assertions/actions.ts', 'utf8')
const suggestionActions = readFileSync('src/features/evidence/suggestions/actions.ts', 'utf8')

test('active duplicate relationship migration cleans duplicates and enforces org-scoped partial uniqueness', () => {
  assert.match(migration, /row_number\(\) over/i)
  assert.match(migration, /partition by organization_id, documentation_session_id, source_type, source_id, target_type, target_id, relationship_type/i)
  assert.match(migration, /set deleted_at = now\(\),\s*updated_at = now\(\)/is)
  assert.match(migration, /create unique index if not exists evidence_relationships_unique_active_org_idx/i)
  assert.match(migration, /where deleted_at is null/i)
  assert.match(migration, /allowing soft-deleted relationships to be recreated/i)
})

test('relationship duplicate database errors are mapped to a friendly message', () => {
  assert.match(errors, /code.*23505/s)
  assert.match(errors, /This relationship already exists\./)
  for (const source of [timelineActions, entityActions, assertionActions, suggestionActions]) {
    assert.match(source, /throwFriendlyRelationshipMutationError/)
  }
})
