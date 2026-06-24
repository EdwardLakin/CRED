import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const actions = readFileSync('src/features/evidence/library/actions.ts', 'utf8')
const hardeningMigration = readFileSync('supabase/migrations/20260623204000_harden_capture_item_evidence_updates.sql', 'utf8')
const correctiveMigration = readFileSync('supabase/migrations/20260624124000_fix_capture_created_by_trigger_regression.sql', 'utf8')

test('evidence mutations verify returned capture rows instead of trusting no-error updates', () => {
  assert.match(actions, /\.update\(updatePatch\)[\s\S]*\.eq\('id', captureId\)[\s\S]*\.eq\('organization_id', profile\.organization_id\)[\s\S]*\.is\('deleted_at', null\)[\s\S]*\.select\(UPDATED_EVIDENCE_SELECT\)[\s\S]*\.maybeSingle\(\)/)
  assert.match(actions, /if \(!data\)[\s\S]*NO_ROWS_UPDATED[\s\S]*throw new Error\('Evidence item was not updated/)
  assert.match(actions, /for \(const \[key, value\] of Object\.entries\(patch\)\)[\s\S]*valuesMatch/)
  assert.match(actions, /MISMATCH_\$\{key\}/)
})

test('evidence mutations revalidate all affected evidence, report, deliverable, and overview routes', () => {
  for (const route of ['/dashboard', '/dashboard/sessions', '/evidence`', '/evidence/${captureId}`', '/evidence/review`', '/report`', '/deliverables`']) {
    assert.ok(actions.includes(route), `missing revalidation for ${route}`)
  }
})

test('capture item update authorization stays tenant scoped and protects immutable fields', () => {
  assert.match(hardeningMigration, /drop policy if exists "Organization members can update capture items"/)
  assert.match(hardeningMigration, /to authenticated[\s\S]*using \([\s\S]*deleted_at is null[\s\S]*profiles\.organization_id = capture_items\.organization_id[\s\S]*profiles\.user_id = auth\.uid\(\)[\s\S]*documentation_sessions\.deleted_at is null/s)
  assert.match(hardeningMigration, /with check \([\s\S]*documentation_sessions\.organization_id = capture_items\.organization_id/s)
  assert.doesNotMatch(hardeningMigration, /using \(true\)/i)
  for (const field of ['organization_id', 'documentation_session_id', 'storage_path', 'thumbnail_path']) {
    assert.match(correctiveMigration, new RegExp(`new\\.${field} is distinct from old\\.${field}`))
  }
  assert.doesNotMatch(correctiveMigration.match(/create or replace function public\.prevent_capture_item_scope_retarget\(\)[\s\S]*?\$\$;/i)?.[0] ?? '', /new\.created_by|old\.created_by/i)
  assert.match(correctiveMigration, /if auth\.role\(\) = 'service_role' then[\s\S]*return new;/)
})

test('corrective migration documents and removes the invalid capture_items created_by trigger reference', () => {
  assert.match(correctiveMigration, /capture_items table has never had a created_by column/i)
  assert.match(correctiveMigration, /create or replace function public\.prevent_capture_item_scope_retarget\(\)/)
  assert.match(correctiveMigration, /drop trigger if exists prevent_capture_item_scope_retarget on public\.capture_items/)
  assert.match(correctiveMigration, /create trigger prevent_capture_item_scope_retarget[\s\S]*before update on public\.capture_items/)
  assert.doesNotMatch(correctiveMigration.match(/create or replace function public\.prevent_capture_item_scope_retarget\(\)[\s\S]*?\$\$;/i)?.[0] ?? '', /new\.created_by|old\.created_by/i)
  assert.match(correctiveMigration, /profiles? to belong|RLS|organization\/session membership/i)
})
