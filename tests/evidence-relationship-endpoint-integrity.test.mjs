import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync('supabase/migrations/20260623130000_evidence_relationship_endpoint_integrity.sql', 'utf8')

test('relationship endpoint integrity migration validates all supported endpoints with a security definer trigger', () => {
  assert.match(migration, /create or replace function public\.validate_evidence_relationship_endpoint/i)
  assert.match(migration, /security definer/i)
  assert.match(migration, /set search_path = public, pg_temp/i)
  for (const endpointType of ['capture_item', 'timeline_event', 'entity', 'assertion']) assert.match(migration, new RegExp(`when '${endpointType}'`))
  assert.match(migration, /before insert or update on public\.evidence_relationships/i)
  assert.match(migration, /execute function public\.validate_evidence_relationship_endpoints\(\)/i)
})

test('relationship endpoint integrity migration rejects missing, cross-scope, deleted, and unsupported endpoints', () => {
  for (const phrase of [
    'missing evidence relationship % endpoint',
    'cross-organization evidence relationship % endpoint',
    'cross-session evidence relationship % endpoint',
    'soft-deleted evidence relationship % endpoint',
    'unsupported evidence relationship % endpoint type'
  ]) assert.match(migration, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
})

test('relationship endpoint integrity migration persists authenticated grants without granting anon', () => {
  assert.match(migration, /grant select on table public\.profiles to authenticated/i)
  assert.match(migration, /grant select on table public\.documentation_sessions to authenticated/i)
  assert.match(migration, /grant select, insert, update, delete on table public\.evidence_relationships to authenticated/i)
  assert.match(migration, /grant select, insert, update, delete on table public\.evidence_deliverables to authenticated/i)
  assert.doesNotMatch(migration, /to anon/i)
})
