import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const REQUIRED = ['SUPABASE_TEST_URL','SUPABASE_TEST_ANON_KEY','SUPABASE_TEST_SERVICE_ROLE_KEY','SUPABASE_TEST_ALLOW_DESTRUCTIVE','SUPABASE_PRODUCTION_URLS']
export function validateSupabaseTestEnvironment() {
  const missing = REQUIRED.filter((name) => !process.env[name])
  if (missing.length) throw new Error(`Live Supabase RLS integration tests are misconfigured; missing ${missing.join(', ')}`)
  if (!['evidence-workspace-rls','cred-test-multi-workspace-rls'].includes(process.env.SUPABASE_TEST_ALLOW_DESTRUCTIVE)) throw new Error('Refusing destructive setup without SUPABASE_TEST_ALLOW_DESTRUCTIVE=evidence-workspace-rls or cred-test-multi-workspace-rls')
  const testUrl = normalizeUrl(process.env.SUPABASE_TEST_URL)
  const productionUrls = (process.env.SUPABASE_PRODUCTION_URLS ?? '').split(',').map(normalizeUrl).filter(Boolean)
  if (productionUrls.includes(testUrl)) throw new Error('Refusing to run against a Supabase URL listed in SUPABASE_PRODUCTION_URLS')
}
function normalizeUrl(value='') { try { return new URL(value.trim()).origin } catch { return value.trim().replace(/\/$/, '') } }
export function createSupabaseServiceClient() { validateSupabaseTestEnvironment(); return createClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) }
export function createAnonClient() { validateSupabaseTestEnvironment(); return createClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) }
async function must(label, promise) { const { data, error } = await promise; if (error) throw new Error(`${label} failed: ${error.message}`); return data }
async function insertOne(client, table, row) { return must(`insert ${table}`, client.from(table).insert(row).select('*').single()) }
export async function createLiveRlsFixture() {
  validateSupabaseTestEnvironment()
  const service = createSupabaseServiceClient(); const runId = `cred-rls-${Date.now()}-${randomUUID().slice(0,8)}`; const password = `${randomUUID()}aA!1`; const users=[]
  const cleanup = async () => { const errors=[]; for (const table of ['organization_usage_events','report_share_tokens','evidence_deliverables','evidence_relationships','evidence_assertions','evidence_entities','timeline_events','capture_items','documentation_sessions']) { const { error } = await service.from(table).delete().in('organization_id', ids.organizations); if (error) errors.push(`${table}: ${error.message}`) } { const { error } = await service.from('workspace_memberships').delete().in('workspace_id', ids.organizations); if (error) errors.push(`workspace_memberships: ${error.message}`) } for (const table of ['company_profiles','profiles','organizations']) { const { error } = await service.from(table).delete().in(table==='organizations'?'id':'organization_id', ids.organizations); if (error) errors.push(`${table}: ${error.message}`) } if (ids.billingAccounts.length) { const { error } = await service.from('billing_accounts').delete().in('id', ids.billingAccounts); if (error) errors.push(`billing_accounts: ${error.message}`) } for (const userId of users) { const { error } = await service.auth.admin.deleteUser(userId); if (error) errors.push(`auth.users: ${error.message}`) } if (errors.length) throw new Error(`cleanup failed: ${errors.join('; ')}`) }
  const ids = { organizations: [], billingAccounts: [] }
  async function org(label) { const email = `${runId}-${label}@example.invalid`; const created = await must(`create auth user ${label}`, service.auth.admin.createUser({ email, password, email_confirm: true })); users.push(created.user.id); const organization = await insertOne(service, 'organizations', { name: `${runId} Org ${label}`, industry: 'testing' }); ids.organizations.push(organization.id); const profile = await insertOne(service, 'profiles', { user_id: created.user.id, organization_id: organization.id, full_name: `RLS User ${label}`, role: 'owner', inspector_email: email }); await insertOne(service, 'company_profiles', { organization_id: organization.id, company_name: `${runId} Company ${label}` }); const anon = createAnonClient(); const signedIn = await anon.auth.signInWithPassword({ email, password }); if (signedIn.error) throw new Error(`sign in ${label} failed: ${signedIn.error.message}`); return { email, userId: created.user.id, organization, profile, client: anon } }
  const a = await org('a'); const b = await org('b')
  async function session(owner, name) { return insertOne(service, 'documentation_sessions', { organization_id: owner.organization.id, created_by: owner.profile.id, title: `${runId} ${name}`, session_type: 'inspection', session_metadata: { runId }, status: 'draft', display_id: `${name}-${runId.slice(-6)}` }) }
  const a1 = await session(a,'A1'), a2 = await session(a,'A2'), b1 = await session(b,'B1')
  async function seed(owner, sess, suffix, extra={}) { const capture = await insertOne(service,'capture_items',{ documentation_session_id:sess.id, organization_id:owner.organization.id, type:'photo', storage_path:`tests/${runId}/${suffix}.jpg`, original_filename:`${suffix}.jpg`, media_kind:'image', technician_note:`${suffix} note` }); const timeline = await insertOne(service,'timeline_events',{ documentation_session_id:sess.id, organization_id:owner.organization.id, capture_item_id:capture.id, title:`${suffix} timeline`, event_type:'manual', event_start_at:new Date().toISOString(), source_kind:'user', review_status:'accepted', created_by:owner.profile.id }); const entity = await insertOne(service,'evidence_entities',{ documentation_session_id:sess.id, organization_id:owner.organization.id, entity_type:'asset', display_name:`${suffix} asset`, suggestion_source:'user', review_status:'accepted', created_by:owner.profile.id }); const assertion = await insertOne(service,'evidence_assertions',{ documentation_session_id:sess.id, organization_id:owner.organization.id, assertion_type:'factual_observation', statement:`${suffix} observation`, normalized_statement:`${suffix} observation`, suggestion_source:'user', review_status:'accepted', created_by:owner.profile.id }); const relationship = await insertOne(service,'evidence_relationships',{ documentation_session_id:sess.id, organization_id:owner.organization.id, source_type:'capture_item', source_id:capture.id, target_type:'entity', target_id:entity.id, relationship_type:'documents', suggestion_source:'user', review_status:'accepted', created_by:owner.profile.id }); const suggestion = await insertOne(service,'evidence_relationships',{ documentation_session_id:sess.id, organization_id:owner.organization.id, source_type:'capture_item', source_id:capture.id, target_type:'assertion', target_id:assertion.id, relationship_type:'supports', suggestion_source:'ai', confidence:0.8, provenance:{ runId }, created_by:owner.profile.id }); const deliverable = await insertOne(service,'evidence_deliverables',{ documentation_session_id:sess.id, organization_id:owner.organization.id, deliverable_type:'chronology', title:`${suffix} deliverable`, summary:'seeded', content:{ runId }, source_ids:{ capture_items:[capture.id] }, generated_by:owner.profile.id }); return { capture, timeline, entity, assertion, relationship, suggestion, deliverable, ...extra } }
  const a1Seed = await seed(a,a1,'a1'); const a2Seed = await seed(a,a2,'a2'); const b1Seed = await seed(b,b1,'b1')
  const deletedEndpoint = await insertOne(service,'evidence_entities',{ documentation_session_id:a1.id, organization_id:a.organization.id, entity_type:'asset', display_name:'deleted endpoint' })
  const softDeletedRelationship = await insertOne(service,'evidence_relationships',{ documentation_session_id:a1.id, organization_id:a.organization.id, source_type:'entity', source_id:a1Seed.entity.id, target_type:'entity', target_id:deletedEndpoint.id, relationship_type:'related_to', deleted_at:new Date().toISOString() })
  await must('soft delete endpoint', service.from('evidence_entities').update({ deleted_at:new Date().toISOString() }).eq('id', deletedEndpoint.id))
  return { runId, service, cleanup, a, b, sessions:{ a1, a2, b1 }, seed:{ a1:a1Seed, a2:a2Seed, b1:b1Seed, deletedEndpoint, softDeletedRelationship } }
}
export function expectDeniedRead(result) { if (result.error) return; if (Array.isArray(result.data)) { if (result.data.length !== 0) throw new Error('expected denied read to return no rows'); return } if (result.data != null) throw new Error('expected denied read to return null') }
export function expectDeniedInsert(result) { if (!result.error) throw new Error('expected RLS denied insert to return an error') }
export function expectDeniedMutation(result) {
  if (result.error) return
  const rows = Array.isArray(result.data) ? result.data : (result.data == null ? [] : [result.data])
  if (rows.length !== 0) throw new Error(`expected denied mutation to affect zero rows; received ${rows.length}`)
}
export function expectSingleMutationRow(result, expectedId) {
  if (result.error) throw new Error(`expected mutation to succeed: ${result.error.message}`)
  const rows = Array.isArray(result.data) ? result.data : (result.data == null ? [] : [result.data])
  if (rows.length !== 1) throw new Error(`expected mutation to affect exactly one row; received ${rows.length}`)
  if (expectedId && rows[0]?.id !== expectedId) throw new Error(`expected mutation row ${expectedId}; received ${rows[0]?.id}`)
  return rows[0]
}
export const expectDeniedWrite = expectDeniedInsert
export function duplicateRelationshipMessage(error) { return error?.code === '23505' ? 'This relationship already exists.' : error?.message ?? 'Unable to create relationship' }
