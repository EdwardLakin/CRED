import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { randomUUID } from 'node:crypto'

import { createLiveRlsFixture, expectDeniedMutation, validateSupabaseTestEnvironment } from './helpers/supabase-test-environment.mjs'

validateSupabaseTestEnvironment()
let fx
const summary = new Map()
function requireFixture(t) { if (!fx) { t.skip('fixture unavailable because seed setup failed'); return false } return true }
after(async () => { if (fx) { await fx.cleanup(); summary.set('cleanup removes all seeded records', 'passed') } console.log('Live deliverable lifecycle integration tests'); for (const [k,v] of summary) console.log(`- ${k}: ${v}`) })
async function insertDeliverable(owner, session, type = 'chronology', extra = {}) {
  const result = await owner.client.from('evidence_deliverables').insert({ documentation_session_id: session.id, organization_id: owner.organization.id, deliverable_type: type, title: `${type} ${randomUUID()}`, summary: 'live lifecycle', content: { marker: randomUUID() }, source_ids: { evidence_item_ids: [] }, provenance: { generated_from: 'live-test' }, generated_by: owner.profile.id, ...extra }).select('*').single()
  assert.ifError(result.error)
  return result.data
}
async function get(client, id) { const result = await client.from('evidence_deliverables').select('*').eq('id', id).single(); assert.ifError(result.error); return result.data }
async function finalize(client, id) { return client.rpc('finalize_evidence_deliverable', { p_deliverable_id: id }) }

test('seed two isolated organizations with authenticated clients', async () => { fx = await createLiveRlsFixture(); assert.ok(fx.a.client); assert.ok(fx.b.client) })

test('version numbers are scoped and monotonic across type session organization archive and delete', async (t) => {
  if (!requireFixture(t)) return
  assert.equal(fx.seed.a1.deliverable.version_number, 1)
  const a1v2 = await insertDeliverable(fx.a, fx.sessions.a1)
  const a1OtherType = await insertDeliverable(fx.a, fx.sessions.a1, 'evidence_index')
  const a2v2 = await insertDeliverable(fx.a, fx.sessions.a2)
  const b1v2 = await insertDeliverable(fx.b, fx.sessions.b1)
  assert.equal(a1v2.version_number, 2)
  assert.equal(a1OtherType.version_number, 1)
  assert.equal(a2v2.version_number, 2)
  assert.equal(b1v2.version_number, 2)
  assert.ifError((await fx.a.client.from('evidence_deliverables').update({ status: 'archived' }).eq('id', a1v2.id)).error)
  const a1v3 = await insertDeliverable(fx.a, fx.sessions.a1)
  assert.equal(a1v3.version_number, 3)
  assert.ifError((await fx.a.client.from('evidence_deliverables').update({ deleted_at: new Date().toISOString() }).eq('id', a1v3.id)).error)
  const a1v4 = await insertDeliverable(fx.a, fx.sessions.a1)
  assert.equal(a1v4.version_number, 4)
  const concurrent = await Promise.all(Array.from({ length: 3 }, () => insertDeliverable(fx.a, fx.sessions.a1, 'observation_summary')))
  assert.deepEqual([...new Set(concurrent.map((row) => row.version_number))].sort((a,b) => a-b), [1,2,3])
  summary.set('version scope and no reuse', 'passed')
})

test('finalization derives authenticated actor and supersedes prior final', async (t) => {
  if (!requireFixture(t)) return
  const d1 = await insertDeliverable(fx.a, fx.sessions.a1, 'evidence_index')
  const d2 = await insertDeliverable(fx.a, fx.sessions.a1, 'evidence_index')
  const first = await finalize(fx.a.client, d1.id); assert.ifError(first.error); assert.equal(first.data.status, 'final'); assert.equal(first.data.finalized_by, fx.a.profile.id); assert.ok(first.data.finalized_at)
  const second = await finalize(fx.a.client, d2.id); assert.ifError(second.error); assert.equal(second.data.status, 'final'); assert.equal(second.data.supersedes_deliverable_id, d1.id); assert.equal(second.data.finalized_by, fx.a.profile.id)
  assert.equal((await get(fx.a.client, d1.id)).status, 'superseded')
  const finals = await fx.a.client.from('evidence_deliverables').select('id,status').eq('documentation_session_id', fx.sessions.a1.id).eq('deliverable_type', 'evidence_index').eq('status', 'final')
  assert.ifError(finals.error); assert.deepEqual(finals.data.map((row) => row.id), [d2.id])
  const again = await finalize(fx.a.client, d2.id); assert.ok(again.error); assert.match(again.error.message, /Only draft deliverables can be finalized/)
  const cross = await finalize(fx.b.client, d2.id); assert.ok(cross.error); assert.match(cross.error.message, /Deliverable not found/)
  const guessed = await finalize(fx.a.client, randomUUID()); assert.ok(guessed.error); assert.match(guessed.error.message, /Deliverable not found/)
  summary.set('finalization actor and supersession', 'passed')
})

test('archive restore finalization and immutable snapshot rules are enforced', async (t) => {
  if (!requireFixture(t)) return
  const draft = await insertDeliverable(fx.a, fx.sessions.a2, 'evidence_index')
  const archived = await fx.a.client.from('evidence_deliverables').update({ status: 'archived' }).eq('id', draft.id).select('*').single(); assert.ifError(archived.error); assert.equal(archived.data.status, 'archived')
  const archivedFinalize = await finalize(fx.a.client, draft.id); assert.ok(archivedFinalize.error); assert.match(archivedFinalize.error.message, /Only draft deliverables can be finalized/)
  const restored = await fx.a.client.from('evidence_deliverables').update({ status: 'draft' }).eq('id', draft.id).select('*').single(); assert.ifError(restored.error); assert.equal(restored.data.status, 'draft')
  const final = await finalize(fx.a.client, draft.id); assert.ifError(final.error)
  for (const patch of [{ content: { changed: true } }, { provenance: { changed: true } }]) {
    const mutation = await fx.a.client.from('evidence_deliverables').update(patch).eq('id', draft.id).select('*')
    assert.ok(mutation.error, 'final/superseded content and provenance mutations must fail')
  }
  const next = await insertDeliverable(fx.a, fx.sessions.a2, 'evidence_index')
  assert.ifError((await finalize(fx.a.client, next.id)).error)
  for (const id of [draft.id, next.id]) {
    const attempt = await fx.a.client.from('evidence_deliverables').update({ status: 'archived' }).eq('id', id).select('*')
    assert.ok(attempt.error, 'final and superseded archive attempts must fail')
  }
  expectDeniedMutation(await fx.b.client.from('evidence_deliverables').update({ status: 'archived' }).eq('id', next.id).select('id'))
  assert.equal((await get(fx.a.client, draft.id)).status, 'superseded')
  assert.equal((await get(fx.a.client, next.id)).status, 'final')
  summary.set('archive restore and immutability', 'passed')
})
