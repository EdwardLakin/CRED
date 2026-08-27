import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  'supabase/migrations/20260827013148_documentation_items_foundation.sql',
  'utf8',
)
const actions = readFileSync('src/features/capture/actions.ts', 'utf8')
const offlineTypes = readFileSync('src/features/offline/types.ts', 'utf8')
const offlineDb = readFileSync('src/features/offline/db.ts', 'utf8')
const queue = readFileSync('src/features/offline/queue.ts', 'utf8')
const syncEngine = readFileSync('src/features/offline/sync-engine.ts', 'utf8')
const verifyRoute = readFileSync('app/api/offline/captures/verify/route.ts', 'utf8')

test('documentation_items is a first-class session-scoped parent with safe legacy backfill', () => {
  assert.match(migration, /create table public\.documentation_items/)
  assert.match(migration, /unique \(organization_id, documentation_session_id, client_item_id\)/)
  assert.match(migration, /foreign key \(documentation_session_id, organization_id\)[\s\S]*references public\.documentation_sessions \(id, organization_id\)/)
  assert.match(migration, /coalesce\(capture_items\.observation_group_id, capture_items\.id\)::text as client_item_id/)
  assert.match(migration, /documentation_item_id = ranked_attachments\.documentation_item_id/)
  assert.match(migration, /alter column documentation_item_id set not null/)
})

test('forms and notes remain separate item kinds instead of observations', () => {
  assert.match(migration, /item_kind in \('observation', 'document', 'note'\)/)
  assert.match(migration, /capture_items\.extracted_data \? 'source_document'[\s\S]*then 'document'/)
  assert.match(actions, /const inferredSourceKind: DocumentationItemKind = sourceDocument \|\| itemCaptureType === 'document'/)
  assert.match(actions, /sourceDocumentType: current\.metadata\.sourceDocumentType|sourceDocumentType\?: SourceDocumentType/)
  assert.match(offlineTypes, /sourceDocumentType: SourceDocumentType \| null/)
  assert.match(syncEngine, /sourceDocumentType: current\.metadata\.sourceDocumentType/)
})

test('RLS and grants expose items only to authenticated organization/session members', () => {
  assert.match(migration, /alter table public\.documentation_items enable row level security/)
  assert.match(migration, /revoke all on table public\.documentation_items from public, anon/)
  assert.match(migration, /grant select, insert, update, delete on table public\.documentation_items to authenticated/)
  assert.match(migration, /profiles\.user_id = \(select auth\.uid\(\)\)/)
  assert.match(migration, /documentation_sessions\.organization_id = documentation_items\.organization_id/)
  assert.doesNotMatch(migration, /security definer/)
})

test('attachment identity and ordering survive concurrency, reload, retry, and verification', () => {
  assert.match(migration, /unique \(documentation_item_id, attachment_order\)/)
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock/)
  assert.match(migration, /storage_path is distinct from new\.storage_path/)
  assert.match(offlineTypes, /clientItemId: string/)
  assert.match(offlineTypes, /documentationItemId: string \| null/)
  assert.match(offlineTypes, /attachmentOrder: number \| null/)
  assert.match(offlineDb, /OFFLINE_DB_VERSION = 4/)
  assert.match(offlineDb, /by-local-session-item-order/)
  assert.match(queue, /normalizeQueuedCaptureItemMetadata/)
  assert.match(syncEngine, /clientItemId: current\.metadata\.clientItemId/)
  assert.match(syncEngine, /attachmentOrder: result\.attachmentOrder/)
  assert.match(verifyRoute, /capture\.documentation_item_id !== documentationItemId/)
  assert.match(verifyRoute, /capture\.attachment_order !== attachmentOrder/)
})

test('primary note edits update the shared item description', () => {
  assert.match(migration, /create function public\.sync_primary_capture_note_to_documentation_item/)
  assert.match(migration, /new\.attachment_kind = 'primary'/)
  assert.match(migration, /set description = nullif\(btrim\(new\.technician_note\), ''\)/)
  assert.match(migration, /after insert or update on public\.capture_items/)
})

test('item deletion is atomic, authenticated, and includes every attachment', () => {
  assert.match(migration, /create function public\.soft_delete_documentation_item/)
  assert.match(migration, /security invoker/)
  assert.match(migration, /update public\.capture_items[\s\S]*capture_items\.documentation_item_id = p_documentation_item_id/)
  assert.match(migration, /update public\.documentation_items[\s\S]*set deleted_at = v_deleted_at/)
  assert.match(migration, /revoke all on function public\.soft_delete_documentation_item\(uuid, uuid\) from public, anon/)
  assert.match(actions, /export async function removeDocumentationItem/)
  assert.match(actions, /'soft_delete_documentation_item'/)
})
