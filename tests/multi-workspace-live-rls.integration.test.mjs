import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { randomUUID } from 'node:crypto'

import { createAnonClient, createLiveRlsFixture, expectDeniedInsert, expectDeniedMutation, expectDeniedRead, validateSupabaseTestEnvironment } from './helpers/supabase-test-environment.mjs'

validateSupabaseTestEnvironment()
let fx
const summary = new Map()

function requireFixture(t) {
  if (!fx) {
    t.skip('fixture unavailable because seed setup failed')
    return false
  }
  return true
}

async function must(label, promise) {
  const { data, error } = await promise
  if (error) throw new Error(`${label} failed: ${error.message}`)
  return data
}

after(async () => {
  if (fx) {
    await fx.cleanup()
    summary.set('cleanup', 'passed')
  }
  console.log('Live multi-workspace RLS integration tests')
  for (const [key, value] of summary) console.log(`- ${key}: ${value}`)
})

test('seed workspace memberships for live Phase 1 RLS checks', async () => {
  fx = await createLiveRlsFixture()
  fx.memberPassword = `${randomUUID()}aA!1`
  const email = `${fx.runId}-member@example.invalid`
  const created = await must('create member auth user', fx.service.auth.admin.createUser({ email, password: fx.memberPassword, email_confirm: true }))
  fx.member = { email, userId: created.user.id }
  const originalCleanup = fx.cleanup
  fx.cleanup = async () => {
    await originalCleanup()
    await fx.service.auth.admin.deleteUser(fx.member.userId)
  }
  const memberClient = createAnonClient()
  const signedIn = await memberClient.auth.signInWithPassword({ email, password: fx.memberPassword })
  assert.ifError(signedIn.error)
  fx.member.client = memberClient

  for (const [owner, workspace] of [[fx.a, fx.a.organization], [fx.b, fx.b.organization]]) {
    const account = await must('create billing account', fx.service.from('billing_accounts').insert({ owner_user_id: owner.userId, name: `${fx.runId} ${workspace.name}` }).select('*').single())
    fx.ids.billingAccounts.push(account.id)
    await must('assign billing account', fx.service.from('organizations').update({ billing_account_id: account.id }).eq('id', workspace.id))
  }

  await must('owner a membership', fx.service.from('workspace_memberships').insert({ workspace_id: fx.a.organization.id, user_id: fx.a.userId, role: 'owner', status: 'active', joined_at: new Date().toISOString() }).select('id').single())
  await must('owner b membership', fx.service.from('workspace_memberships').insert({ workspace_id: fx.b.organization.id, user_id: fx.b.userId, role: 'owner', status: 'active', joined_at: new Date().toISOString() }).select('id').single())
  fx.memberMembership = await must('member a membership', fx.service.from('workspace_memberships').insert({ workspace_id: fx.a.organization.id, user_id: fx.member.userId, role: 'member', status: 'active', joined_at: new Date().toISOString() }).select('*').single())
  summary.set('seed', 'passed')
})

test('member can read own workspace membership but cannot read another workspace', async (t) => {
  if (!requireFixture(t)) return
  const own = await must('member reads own membership', fx.member.client.from('workspace_memberships').select('id, workspace_id, role').eq('id', fx.memberMembership.id).single())
  assert.equal(own.workspace_id, fx.a.organization.id)
  expectDeniedRead(await fx.member.client.from('workspace_memberships').select('id').eq('workspace_id', fx.b.organization.id))
  expectDeniedRead(await fx.member.client.from('organizations').select('id').eq('id', fx.b.organization.id))
  summary.set('member read isolation', 'passed')
})

test('admin can manage memberships and regular member cannot manage memberships', async (t) => {
  if (!requireFixture(t)) return
  const promoted = await fx.a.client.from('workspace_memberships').update({ role: 'viewer' }).eq('id', fx.memberMembership.id).select('id, role').single()
  assert.ifError(promoted.error)
  assert.equal(promoted.data.role, 'viewer')
  expectDeniedMutation(await fx.member.client.from('workspace_memberships').update({ role: 'admin' }).eq('id', fx.memberMembership.id).select('id'))
  const inserted = await fx.a.client.from('workspace_memberships').insert({ workspace_id: fx.a.organization.id, user_id: fx.member.userId, role: 'member', status: 'active' }).select('id')
  assert.ok(inserted.error, 'duplicate member insert should fail rather than creating another active membership')
  summary.set('membership management', 'passed')
})

test('archived workspace and removed membership revoke access while profile fallback still works', async (t) => {
  if (!requireFixture(t)) return
  await must('archive workspace b', fx.service.from('organizations').update({ archived_at: new Date().toISOString() }).eq('id', fx.b.organization.id))
  expectDeniedRead(await fx.b.client.from('workspace_memberships').select('id').eq('workspace_id', fx.b.organization.id))
  await must('unarchive workspace b', fx.service.from('organizations').update({ archived_at: null }).eq('id', fx.b.organization.id))
  await must('remove member membership', fx.service.from('workspace_memberships').update({ status: 'removed' }).eq('id', fx.memberMembership.id))
  expectDeniedRead(await fx.member.client.from('documentation_sessions').select('id').eq('id', fx.sessions.a1.id))
  const fallback = await must('legacy profile fallback reads session', fx.a.client.from('documentation_sessions').select('id').eq('id', fx.sessions.a1.id).single())
  assert.equal(fallback.id, fx.sessions.a1.id)
  summary.set('archive removal fallback', 'passed')
})

test('user can belong to two workspaces and cross-workspace organization/session access still fails', async (t) => {
  if (!requireFixture(t)) return
  await must('reactivate member a', fx.service.from('workspace_memberships').update({ status: 'active', role: 'member' }).eq('id', fx.memberMembership.id))
  fx.memberSecondMembership = await must('member b membership', fx.service.from('workspace_memberships').insert({ workspace_id: fx.b.organization.id, user_id: fx.member.userId, role: 'member', status: 'active', joined_at: new Date().toISOString() }).select('*').single())
  const memberships = await must('member reads both memberships', fx.member.client.from('workspace_memberships').select('workspace_id').in('workspace_id', [fx.a.organization.id, fx.b.organization.id]))
  assert.deepEqual(new Set(memberships.map((row) => row.workspace_id)), new Set([fx.a.organization.id, fx.b.organization.id]))
  expectDeniedInsert(await fx.member.client.from('documentation_sessions').insert({ organization_id: fx.a.organization.id, created_by: fx.b.profile.id, title: `${fx.runId} denied`, session_type: 'inspection', status: 'draft' }))
  expectDeniedInsert(await fx.member.client.from('capture_items').insert({ documentation_session_id: fx.sessions.a1.id, organization_id: fx.b.organization.id, type: 'photo', storage_path: `tests/${fx.runId}/cross.jpg` }))
  summary.set('multi-workspace and cross-session denial', 'passed')
})
