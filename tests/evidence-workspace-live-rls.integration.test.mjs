import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { createLiveRlsFixture, duplicateRelationshipMessage, expectDeniedInsert, expectDeniedMutation, expectDeniedRead, expectSingleMutationRow, validateSupabaseTestEnvironment } from './helpers/supabase-test-environment.mjs'

validateSupabaseTestEnvironment()
let fx
function requireFixture(t) {
  if (!fx) {
    t.skip('fixture unavailable because seed setup failed')
    return false
  }
  return true
}
const summary = new Map()
after(async () => {
  if (fx) { await fx.cleanup(); summary.set('cleanup', 'passed') }
  console.log('Live Supabase RLS integration tests')
  for (const key of ['cross-org reads','cross-org writes','guessed ID access','cross-session relationship rejection','deleted endpoint rejection','duplicate relationship enforcement','suggestion isolation','deliverable isolation','cleanup']) console.log(`- ${key}: ${summary.get(key) ?? 'not run'}`)
})

test('seed two isolated organizations with authenticated anon clients', async () => { fx = await createLiveRlsFixture(); assert.ok(fx.a.client); assert.ok(fx.b.client) })

test('cross-org reads are denied in both directions', async (t) => {
  if (!requireFixture(t)) return
  const checks = [ ['documentation_sessions', fx.sessions.b1.id], ['capture_items', fx.seed.b1.capture.id], ['timeline_events', fx.seed.b1.timeline.id], ['evidence_entities', fx.seed.b1.entity.id], ['evidence_assertions', fx.seed.b1.assertion.id], ['evidence_relationships', fx.seed.b1.relationship.id], ['evidence_relationships', fx.seed.b1.suggestion.id], ['evidence_deliverables', fx.seed.b1.deliverable.id] ]
  for (const [table, id] of checks) expectDeniedRead(await fx.a.client.from(table).select('id').eq('id', id))
  const reverse = [ ['documentation_sessions', fx.sessions.a1.id], ['capture_items', fx.seed.a1.capture.id], ['timeline_events', fx.seed.a1.timeline.id], ['evidence_entities', fx.seed.a1.entity.id], ['evidence_assertions', fx.seed.a1.assertion.id], ['evidence_relationships', fx.seed.a1.relationship.id], ['evidence_relationships', fx.seed.a1.suggestion.id], ['evidence_deliverables', fx.seed.a1.deliverable.id] ]
  for (const [table, id] of reverse) expectDeniedRead(await fx.b.client.from(table).select('id').eq('id', id))
  summary.set('cross-org reads', 'passed')
})

test('cross-org writes and guessed IDs are denied in both directions', async (t) => {
  if (!requireFixture(t)) return
  expectDeniedInsert(await fx.a.client.from('capture_items').insert({ documentation_session_id: fx.sessions.b1.id, organization_id: fx.b.organization.id, type:'photo', storage_path:'denied.jpg' }))
  expectDeniedInsert(await fx.b.client.from('timeline_events').insert({ documentation_session_id: fx.sessions.a1.id, organization_id: fx.a.organization.id, title:'denied', event_type:'manual' }))
  for (const [client, other] of [[fx.a.client, fx.seed.b1], [fx.b.client, fx.seed.a1]]) {
    expectDeniedMutation(await client.from('capture_items').update({ technician_note:'denied' }).eq('id', other.capture.id).select('id'))
    expectDeniedMutation(await client.from('capture_items').update({ deleted_at:new Date().toISOString() }).eq('id', other.capture.id).select('id'))
    expectDeniedMutation(await client.from('evidence_relationships').update({ review_status:'accepted' }).eq('id', other.suggestion.id).select('id'))
    expectDeniedMutation(await client.from('evidence_deliverables').update({ title:'denied' }).eq('id', other.deliverable.id).select('id'))
    expectDeniedRead(await client.from('evidence_entities').select('*').eq('id', other.entity.id))
    expectDeniedMutation(await client.from('evidence_entities').update({ display_name:'guessed' }).eq('id', other.entity.id).select('id'))
  }
  expectSingleMutationRow(await fx.a.client.from('capture_items').update({ technician_note:'own org update' }).eq('id', fx.seed.a1.capture.id).select('id'), fx.seed.a1.capture.id)
  expectSingleMutationRow(await fx.a.client.from('evidence_deliverables').update({ title:'own org deliverable update' }).eq('id', fx.seed.a1.deliverable.id).select('id'), fx.seed.a1.deliverable.id)
  summary.set('cross-org writes', 'passed'); summary.set('guessed ID access', 'passed')
})

test('same-session relationships succeed and cross-session/deleted endpoint relationship checks fail clearly', async (t) => {
  if (!requireFixture(t)) return
  const sameSession = await fx.a.client.from('evidence_relationships').insert({ documentation_session_id: fx.sessions.a1.id, organization_id: fx.a.organization.id, source_type:'timeline_event', source_id:fx.seed.a1.timeline.id, target_type:'assertion', target_id:fx.seed.a1.assertion.id, relationship_type:'supports' }).select('id').single()
  assert.ifError(sameSession.error)
  const crossSession = await fx.a.client.from('evidence_relationships').insert({ documentation_session_id: fx.sessions.a1.id, organization_id: fx.a.organization.id, source_type:'capture_item', source_id:fx.seed.a1.capture.id, target_type:'entity', target_id:fx.seed.a2.entity.id, relationship_type:'documents' })
  assert.ok(crossSession.error, 'database must reject cross-session endpoints')
  const crossOrgSource = await fx.a.client.from('evidence_relationships').insert({ documentation_session_id: fx.sessions.a1.id, organization_id: fx.a.organization.id, source_type:'capture_item', source_id:fx.seed.b1.capture.id, target_type:'entity', target_id:fx.seed.a1.entity.id, relationship_type:'documents' })
  assert.ok(crossOrgSource.error, 'database must reject cross-org source endpoints')
  const crossOrgTarget = await fx.a.client.from('evidence_relationships').insert({ documentation_session_id: fx.sessions.a1.id, organization_id: fx.a.organization.id, source_type:'capture_item', source_id:fx.seed.a1.capture.id, target_type:'entity', target_id:fx.seed.b1.entity.id, relationship_type:'documents' })
  assert.ok(crossOrgTarget.error, 'database must reject cross-org target endpoints')
  const deletedEndpoint = await fx.a.client.from('evidence_relationships').insert({ documentation_session_id: fx.sessions.a1.id, organization_id: fx.a.organization.id, source_type:'entity', source_id:fx.seed.a1.entity.id, target_type:'entity', target_id:fx.seed.deletedEndpoint.id, relationship_type:'related_to' })
  assert.ok(deletedEndpoint.error, 'database must reject soft-deleted endpoints')
  summary.set('cross-session relationship rejection', 'passed'); summary.set('deleted endpoint rejection', 'passed')
})

test('duplicate active relationships fail and soft-deleted history can be recreated', async (t) => {
  if (!requireFixture(t)) return
  const base = { documentation_session_id: fx.sessions.a1.id, organization_id: fx.a.organization.id, source_type:'entity', source_id:fx.seed.a1.entity.id, target_type:'assertion', target_id:fx.seed.a1.assertion.id, relationship_type:'supports' }
  const first = await fx.a.client.from('evidence_relationships').insert(base).select('*').single(); assert.ifError(first.error)
  const dup = await fx.a.client.from('evidence_relationships').insert(base); assert.equal(dup.error?.code, '23505'); assert.equal(duplicateRelationshipMessage(dup.error), 'This relationship already exists.')
  assert.ifError((await fx.a.client.from('evidence_relationships').update({ deleted_at:new Date().toISOString() }).eq('id', first.data.id)).error)
  const recreated = await fx.a.client.from('evidence_relationships').insert(base).select('*').single(); assert.ifError(recreated.error); assert.notEqual(recreated.data.id, first.data.id)
  const historical = await fx.a.client.from('evidence_relationships').select('id, deleted_at').eq('id', first.data.id).single(); assert.ok(historical.data.deleted_at)
  summary.set('duplicate relationship enforcement', 'passed')
})

test('suggestion and deliverable isolation is enforced', async (t) => {
  if (!requireFixture(t)) return
  assert.equal(fx.seed.a1.suggestion.review_status, 'suggested')
  expectDeniedMutation(await fx.a.client.from('evidence_relationships').update({ review_status:'accepted' }).eq('id', fx.seed.b1.suggestion.id).select('id'))
  expectDeniedMutation(await fx.a.client.from('evidence_relationships').update({ review_status:'edited', relationship_label:'denied edit' }).eq('id', fx.seed.b1.suggestion.id).select('id'))
  expectDeniedMutation(await fx.a.client.from('evidence_relationships').update({ review_status:'rejected' }).eq('id', fx.seed.b1.suggestion.id).select('id'))
  const own = await fx.a.client.from('evidence_relationships').update({ review_status:'accepted', reviewed_by:fx.a.profile.id, reviewed_at:new Date().toISOString() }).eq('id', fx.seed.a1.suggestion.id).select('review_status').single(); assert.ifError(own.error); assert.equal(own.data.review_status, 'accepted')
  expectDeniedRead(await fx.a.client.from('evidence_deliverables').select('*').eq('id', fx.seed.b1.deliverable.id)); expectDeniedMutation(await fx.a.client.from('evidence_deliverables').update({ deleted_at:new Date().toISOString() }).eq('id', fx.seed.b1.deliverable.id).select('id'))
  const deliverable = await fx.a.client.from('evidence_deliverables').select('*').eq('id', fx.seed.a1.deliverable.id).single(); assert.ifError(deliverable.error); assert.equal(deliverable.data.id, fx.seed.a1.deliverable.id)
  summary.set('suggestion isolation', 'passed'); summary.set('deliverable isolation', 'passed')
})
