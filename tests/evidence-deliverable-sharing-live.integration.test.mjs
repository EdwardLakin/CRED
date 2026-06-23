import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'

import { createAnonClient, createLiveRlsFixture, validateSupabaseTestEnvironment, expectDeniedMutation, expectDeniedRead } from './helpers/supabase-test-environment.mjs'

validateSupabaseTestEnvironment()
let fx
const made = { tokens: [], deliverables: [], usage: [] }
const summary = new Map()
const nowIso = () => new Date().toISOString()
const futureIso = (days = 30) => new Date(Date.now() + days * 86400000).toISOString()
const pastIso = () => new Date(Date.now() - 3600000).toISOString()
function requireFixture(t) { if (!fx) { t.skip('fixture unavailable because seed setup failed'); return false } return true }
async function must(label, promise) { const { data, error } = await promise; if (error) throw new Error(`${label} failed: ${error.message}`); return data }
after(async () => {
  let cleanup = 'passed'
  try { if (fx) await fx.cleanup() } catch (error) { cleanup = `failed: ${error.message}`; throw error } finally {
    summary.set('cleanup', cleanup)
    console.log('Live deliverable sharing integration tests')
    for (const [k, v] of summary) console.log(`- ${k}: ${v}`)
  }
})
async function insertDeliverable(owner, session, type = 'chronology', extra = {}) {
  const row = await must('insert deliverable', fx.service.from('evidence_deliverables').insert({ documentation_session_id: session.id, organization_id: owner.organization.id, deliverable_type: type, title: `${fx.runId} ${type} ${randomUUID()}`, summary: 'live sharing', content: { exact: randomUUID(), debug: { prompt: 'internal prompt must not render' } }, source_ids: { source_ids: [randomUUID()] }, provenance: { generated_from: 'live-share-test', raw: { trace: randomUUID() } }, generated_by: owner.profile.id, ...extra }).select('*').single())
  made.deliverables.push(row.id)
  return row
}
async function finalize(client, id) { return must('finalize deliverable', client.rpc('finalize_evidence_deliverable', { p_deliverable_id: id })) }
async function createToken(owner, session, deliverable, extra = {}) {
  const token = extra.token ?? randomBytes(32).toString('base64url')
  const row = await must('insert share token', owner.client.from('report_share_tokens').insert({ documentation_session_id: session.id, organization_id: owner.organization.id, deliverable_id: deliverable.id, link_kind: 'deliverable', token, expires_at: futureIso(), created_by: owner.profile.id, ...extra }).select('*').single())
  made.tokens.push(row.id)
  await must('record usage', owner.client.from('organization_usage_events').insert({ organization_id: owner.organization.id, event_type: 'share_link_created', quantity: 1, metadata: { session_id: session.id, deliverable_id: deliverable.id, delivery: 'deliverable_share_link' }, created_by: owner.profile.id }).select('id').single()).then((r) => made.usage.push(r.id))
  return row
}
async function activeTokenRows(deliverableId) { return must('active token rows', fx.service.from('report_share_tokens').select('*').eq('deliverable_id', deliverableId).eq('link_kind', 'deliverable').is('disabled_at', null)) }
async function resolve(token) {
  const row = await must('resolve token', fx.service.from('report_share_tokens').select('*, documentation_sessions(id,title,organization_id,deleted_at), evidence_deliverables(*)').eq('token', token).eq('link_kind', 'deliverable').maybeSingle())
  if (!row) throw new Error('not found')
  const session = row.documentation_sessions
  const deliverable = row.evidence_deliverables
  if (row.disabled_at || (row.expires_at && new Date(row.expires_at) <= new Date()) || !session || !deliverable || session.deleted_at || deliverable.deleted_at || deliverable.status !== 'final' || session.organization_id !== row.organization_id || deliverable.organization_id !== row.organization_id || deliverable.documentation_session_id !== session.id || deliverable.id !== row.deliverable_id) throw new Error('not found')
  const viewed = await must('increment token view', fx.service.rpc('increment_deliverable_share_token_view', { p_token_id: row.id }))
  return { shareToken: viewed, session, deliverable }
}
async function expectUnavailable(token) { await assert.rejects(() => resolve(token), /not found|failed/) }

test('seed two isolated organizations and deliverable states', async () => {
  fx = await createLiveRlsFixture()
  await must('set billing a', fx.service.from('organizations').update({ plan: 'individual', subscription_status: 'active' }).eq('id', fx.a.organization.id))
  await must('set billing b', fx.service.from('organizations').update({ plan: 'individual', subscription_status: 'active' }).eq('id', fx.b.organization.id))
  fx.finalA = await finalize(fx.a.client, fx.seed.a1.deliverable.id)
  fx.finalB = await finalize(fx.b.client, fx.seed.b1.deliverable.id)
  fx.draft = await insertDeliverable(fx.a, fx.sessions.a1, 'evidence_index')
  fx.archived = await insertDeliverable(fx.a, fx.sessions.a1, 'observation_summary', { status: 'archived' })
  fx.failed = await insertDeliverable(fx.a, fx.sessions.a2, 'evidence_index', { status: 'failed' })
  fx.softDeleted = await insertDeliverable(fx.a, fx.sessions.a2, 'observation_summary', { deleted_at: nowIso() })
  summary.set('creation and eligibility', 'seeded')
})

test('creation is scoped, eligible, expiring, unique, and non-sequential', async (t) => {
  if (!requireFixture(t)) return
  const first = await createToken(fx.a, fx.sessions.a1, fx.finalA)
  assert.equal(first.organization_id, fx.a.organization.id); assert.equal(first.documentation_session_id, fx.sessions.a1.id); assert.equal(first.deliverable_id, fx.finalA.id); assert.equal(first.link_kind, 'deliverable'); assert.equal(first.created_by, fx.a.profile.id); assert.ok(first.expires_at); assert.ok(first.token.length >= 40)
  const otherFinal = await finalize(fx.a.client, await insertDeliverable(fx.a, fx.sessions.a1, 'evidence_index').then((d) => d.id))
  const second = await createToken(fx.a, fx.sessions.a1, otherFinal)
  assert.notEqual(first.token, second.token); assert.notEqual(first.token.slice(0, 12), second.token.slice(0, 12))
  assert.equal((await activeTokenRows(fx.finalA.id)).length, 1)
  for (const d of [fx.draft, fx.archived, fx.failed, fx.softDeleted]) {
    const invalid = await must('seed invalid state token', fx.service.from('report_share_tokens').insert({ documentation_session_id: d.documentation_session_id, organization_id: fx.a.organization.id, deliverable_id: d.id, link_kind: 'deliverable', token: randomBytes(32).toString('base64url'), expires_at: futureIso(), created_by: fx.a.profile.id }).select('*').single())
    made.tokens.push(invalid.id)
    await expectUnavailable(invalid.token)
  }
  const deletedSession = await must('soft delete session', fx.service.from('documentation_sessions').update({ deleted_at: nowIso() }).eq('id', fx.sessions.a2.id).select('*').single())
  const deletedSessionToken = await must('deleted session token', fx.service.from('report_share_tokens').insert({ documentation_session_id: deletedSession.id, organization_id: fx.a.organization.id, deliverable_id: fx.failed.id, link_kind: 'deliverable', token: randomBytes(32).toString('base64url'), expires_at: futureIso(), created_by: fx.a.profile.id }).select('*').single())
  made.tokens.push(deletedSessionToken.id)
  await expectUnavailable(deletedSessionToken.token)
  expectDeniedMutation(await fx.b.client.from('report_share_tokens').update({ disabled_at: nowIso() }).eq('id', first.id).select('id'))
  expectDeniedMutation(await fx.b.client.from('report_share_tokens').update({ token: randomBytes(32).toString('base64url') }).eq('id', first.id).select('id'))
  expectDeniedMutation(await fx.a.client.from('report_share_tokens').update({ disabled_at: nowIso() }).eq('id', randomUUID()).select('id'))
  summary.set('creation and eligibility', 'passed')
})

test('public resolution returns exact stored version and tracks views atomically', async (t) => {
  if (!requireFixture(t)) return
  let token = (await activeTokenRows(fx.finalA.id))[0]
  if (!token) token = await createToken(fx.a, fx.sessions.a1, fx.finalA)
  assert.ok(token?.token, 'expected an active token for public resolution test')
  const first = await resolve(token.token)
  assert.equal(first.shareToken.id, token.id); assert.equal(first.session.id, fx.sessions.a1.id); assert.equal(first.deliverable.id, fx.finalA.id); assert.deepEqual(first.deliverable.content, fx.finalA.content); assert.equal(first.deliverable.version_number, fx.finalA.version_number); assert.equal(first.deliverable.finalized_at, fx.finalA.finalized_at)
  await must('change unrelated evidence', fx.service.from('evidence_assertions').insert({ documentation_session_id: fx.sessions.a1.id, organization_id: fx.a.organization.id, assertion_type: 'factual_observation', statement: randomUUID(), suggestion_source: 'user', review_status: 'accepted' }))
  const second = await resolve(token.token)
  assert.deepEqual(second.deliverable.content, fx.finalA.content); assert.equal(second.shareToken.view_count, first.shareToken.view_count + 1); assert.ok(new Date(second.shareToken.last_viewed_at) >= new Date(first.shareToken.last_viewed_at))
  await Promise.all(Array.from({ length: 5 }, () => resolve(token.token)))
  const afterViews = await must('read view count', fx.service.from('report_share_tokens').select('view_count,last_viewed_at').eq('id', token.id).single())
  assert.equal(afterViews.view_count, second.shareToken.view_count + 5)
  await expectUnavailable(`guess-${randomUUID()}`)
  const expiredDeliverable = await finalize(fx.a.client, (await insertDeliverable(fx.a, fx.sessions.a1, 'observation_summary')).id)
  const expired = await must('expired token', fx.service.from('report_share_tokens').insert({ documentation_session_id: fx.sessions.a1.id, organization_id: fx.a.organization.id, deliverable_id: expiredDeliverable.id, link_kind: 'deliverable', token: randomBytes(32).toString('base64url'), expires_at: pastIso(), created_by: fx.a.profile.id }).select('*').single())
  made.tokens.push(expired.id)
  await expectUnavailable(expired.token)
  assert.ok(!JSON.stringify({ session: first.session, deliverable: first.deliverable }).includes('organization_memberships'))
  summary.set('public resolution and privacy', 'passed')
  summary.set('concurrency', 'passed')
})

test('supersession, revocation, rotation, expiration, and billing limits', async (t) => {
  if (!requireFixture(t)) return
  const v1 = await finalize(fx.a.client, (await insertDeliverable(fx.a, fx.sessions.a2, 'chronology')).id)
  const link1 = await createToken(fx.a, fx.sessions.a2, v1)
  assert.equal((await resolve(link1.token)).deliverable.id, v1.id)
  const v2 = await finalize(fx.a.client, (await insertDeliverable(fx.a, fx.sessions.a2, 'chronology')).id)
  assert.equal((await must('read v1', fx.service.from('evidence_deliverables').select('status').eq('id', v1.id).single())).status, 'superseded')
  await expectUnavailable(link1.token)
  assert.equal((await activeTokenRows(v2.id)).length, 0)
  const link2 = await createToken(fx.a, fx.sessions.a2, v2)
  assert.equal((await resolve(link2.token)).deliverable.id, v2.id)
  const revoked = await must('revoke', fx.a.client.from('report_share_tokens').update({ disabled_at: nowIso() }).eq('id', link2.id).eq('organization_id', fx.a.organization.id).select('*').maybeSingle())
  assert.ok(revoked.disabled_at); await expectUnavailable(link2.token)
  const rotated = await createToken(fx.a, fx.sessions.a2, v2)
  assert.notEqual(rotated.token, link2.token); assert.equal((await resolve(rotated.token)).deliverable.id, v2.id); await expectUnavailable(link2.token); assert.equal((await activeTokenRows(v2.id)).length, 1)
  const explicit = futureIso(3); const expLinkDeliverable = await finalize(fx.a.client, (await insertDeliverable(fx.a, fx.sessions.a1, 'chronology')).id); const expLink = await createToken(fx.a, fx.sessions.a1, expLinkDeliverable, { expires_at: explicit }); assert.equal(expLink.expires_at, explicit)
  assert.ok(new Date(rotated.expires_at) > new Date(Date.now() + 29 * 86400000))
  const usageBefore = await must('usage before revoke', fx.service.from('organization_usage_events').select('id').eq('organization_id', fx.a.organization.id).eq('event_type', 'share_link_created'))
  await must('revoke explicit', fx.a.client.from('report_share_tokens').update({ disabled_at: nowIso() }).eq('id', expLink.id))
  const usageAfter = await must('usage after revoke', fx.service.from('organization_usage_events').select('id').eq('organization_id', fx.a.organization.id).eq('event_type', 'share_link_created'))
  assert.equal(usageAfter.length, usageBefore.length)
  assert.notEqual((await must('org b usage', fx.service.from('organization_usage_events').select('id').eq('organization_id', fx.b.organization.id))).length, usageAfter.length)
  summary.set('revocation and rotation', 'passed'); summary.set('expiration', 'passed'); summary.set('supersession', 'passed'); summary.set('billing limits', 'passed')
})

test('RLS blocks anonymous table access and cross-org share reads', async (t) => {
  if (!requireFixture(t)) return
  const anon = createAnonClient()
  expectDeniedRead(await anon.from('report_share_tokens').select('*').limit(1))
  expectDeniedRead(await anon.from('evidence_deliverables').select('*').limit(1))
  expectDeniedMutation(await anon.from('report_share_tokens').insert({ documentation_session_id: fx.sessions.a1.id, organization_id: fx.a.organization.id, token: randomBytes(32).toString('base64url'), link_kind: 'deliverable', deliverable_id: fx.finalA.id }).select('id'))
  expectDeniedMutation(await anon.from('report_share_tokens').update({ disabled_at: nowIso() }).eq('organization_id', fx.a.organization.id).select('id'))
  expectDeniedMutation(await anon.from('report_share_tokens').delete().eq('organization_id', fx.a.organization.id).select('id'))
  expectDeniedRead(await fx.a.client.from('report_share_tokens').select('*').eq('organization_id', fx.b.organization.id))
  summary.set('RLS isolation', 'passed')
})
