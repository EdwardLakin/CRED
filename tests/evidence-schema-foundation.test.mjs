import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260622120000_evidence_engine_schema_foundation.sql', 'utf8')
const constants = readFileSync('src/features/evidence/constants.ts', 'utf8')
const types = readFileSync('src/features/evidence/types.ts', 'utf8')
const databaseTypes = readFileSync('src/lib/supabase/database.types.ts', 'utf8')

test('evidence schema adds source metadata, dates, review state, and duplicate fields to capture_items', () => {
  for (const column of [
    'import_batch_id',
    'original_filename',
    'file_size_bytes',
    'mime_type',
    'content_hash_sha256',
    'source_kind',
    'source_metadata',
    'source_created_at',
    'source_sent_at',
    'source_received_at',
    'event_date',
    'event_date_precision',
    'evidence_review_status',
    'duplicate_of_capture_item_id',
    'duplicate_status',
  ]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}\\b`))
    assert.match(databaseTypes, new RegExp(`${column}:`))
  }
})

test('new evidence tables are session and organization scoped with RLS enabled', () => {
  for (const table of [
    'evidence_import_batches',
    'evidence_relationships',
    'evidence_entities',
    'evidence_assertions',
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
    assert.match(migration, /documentation_session_id uuid not null references public\.documentation_sessions\(id\) on delete cascade/)
    assert.match(migration, /organization_id uuid not null references public\.organizations\(id\) on delete cascade/)
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
    assert.match(databaseTypes, new RegExp(`${table}: \\{`))
  }
})

test('future AI-created evidence graph records default to suggested on insert', () => {
  for (const trigger of [
    'evidence_entities_ai_insert_defaults',
    'evidence_assertions_ai_insert_defaults',
    'evidence_relationships_ai_insert_defaults',
    'timeline_events_ai_insert_defaults',
  ]) {
    assert.match(migration, new RegExp(`create trigger ${trigger} before insert`))
  }

  assert.match(migration, /if new\.suggestion_source = 'ai' then\n    new\.review_status = 'suggested';/)
  assert.match(migration, /if new\.source_kind = 'ai' then\n    new\.review_status = 'suggested';/)
})

test('evidence TypeScript constants and aliases expose the additive schema', () => {
  for (const symbol of [
    'EVIDENCE_REVIEW_STATUSES',
    'SUGGESTION_REVIEW_STATUSES',
    'EVIDENCE_SOURCE_KINDS',
    'EVENT_DATE_PRECISIONS',
    'EVIDENCE_RELATIONSHIP_TYPES',
  ]) {
    assert.match(constants, new RegExp(`export const ${symbol}`))
  }

  for (const alias of [
    'EvidenceItem',
    'EvidenceImportBatch',
    'EvidenceRelationship',
    'EvidenceEntity',
    'EvidenceAssertion',
    'EvidenceTimelineEvent',
  ]) {
    assert.match(types, new RegExp(`export type ${alias}`))
  }
})
