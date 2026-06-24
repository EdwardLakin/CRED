import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync('supabase/migrations/20260624120000_multi_workspace_membership_foundations.sql', 'utf8')
const correctiveMigration = readFileSync('supabase/migrations/20260624123000_canonicalize_owner_billing_accounts.sql', 'utf8')
const validationSql = readFileSync('supabase/verification/20260624123000_multi_workspace_foundation_checks.sql', 'utf8')
const workspaceServer = readFileSync('src/features/workspaces/server.ts', 'utf8')
const workspaceTypes = readFileSync('src/features/workspaces/types.ts', 'utf8')
const databaseTypes = readFileSync('src/lib/supabase/database.types.ts', 'utf8')

test('phase 1 migration creates billing accounts and workspace-scoped memberships', () => {
  assert.match(migration, /create table if not exists public\.billing_accounts/)
  assert.match(migration, /owner_user_id uuid not null references auth\.users/)
  assert.match(migration, /create table if not exists public\.workspace_memberships/)
  assert.match(migration, /workspace_id uuid not null references public\.organizations\(id\)/)
  assert.match(migration, /unique \(workspace_id, user_id\)/)
})

test('organizations are preserved as workspaces with extensible type and billing account fields', () => {
  assert.match(migration, /add column if not exists billing_account_id uuid/)
  assert.match(migration, /add column if not exists workspace_type text not null default 'general'/)
  assert.match(migration, /workspace_type in \('team', 'shop', 'office', 'location', 'matter', 'general'\)/)
  assert.match(migration, /add column if not exists archived_at timestamptz/)
})

test('existing single-organization profiles are backfilled into active memberships', () => {
  assert.match(migration, /insert into public\.billing_accounts/)
  assert.match(migration, /insert into public\.workspace_memberships/)
  assert.match(migration, /case p\.role\s+when 'owner' then 'owner'\s+when 'admin' then 'admin'\s+when 'reviewer' then 'viewer'\s+else 'member'/)
  assert.match(migration, /on conflict \(workspace_id, user_id\) do update/)
})

test('corrective migration canonicalizes one billing account for one owner with many workspaces', () => {
  assert.match(correctiveMigration, /single_owner_workspaces/)
  assert.match(correctiveMigration, /canonical_existing/)
  assert.match(correctiveMigration, /order by sow\.owner_user_id, ba\.created_at asc, ba\.id asc/)
  assert.match(correctiveMigration, /update public\.organizations o\s+set billing_account_id = owner_group\.canonical_billing_account_id/)
  assert.match(correctiveMigration, /owner_user_id is intentionally not unique/)
})

test('corrective migration keeps different owners on different billing accounts', () => {
  assert.match(correctiveMigration, /owner_user_id uuid primary key/)
  assert.match(correctiveMigration, /join pg_temp\.multi_workspace_billing_owner_groups owner_group\s+on owner_group\.owner_user_id = single_owner\.owner_user_id/)
})

test('ownerless and multi-owner organizations are reported without arbitrary reassignment', () => {
  assert.match(correctiveMigration, /organizations_with_no_owner_profile/)
  assert.match(correctiveMigration, /organizations_with_more_than_one_owner_profile/)
  assert.match(correctiveMigration, /having count\(distinct p\.user_id\) = 1/)
  assert.doesNotMatch(correctiveMigration, /where o\.billing_account_id is null[\s\S]*limit 1[\s\S]*update public\.organizations/)
})

test('corrective migration is idempotent and preserves existing data', () => {
  assert.match(correctiveMigration, /create index if not exists/)
  assert.match(correctiveMigration, /create temporary table if not exists/)
  assert.match(correctiveMigration, /is distinct from owner_group\.canonical_billing_account_id/)
  assert.doesNotMatch(correctiveMigration, /delete from public\.billing_accounts/i)
  assert.doesNotMatch(correctiveMigration, /drop table public\.billing_accounts/i)
})

test('RLS compatibility delegates organization checks to workspace membership helpers', () => {
  assert.match(migration, /create or replace function public\.is_workspace_member/)
  assert.match(migration, /from public\.workspace_memberships wm/)
  assert.match(migration, /wm\.status = 'active'/)
  assert.match(migration, /create or replace function public\.is_org_member/)
  assert.match(migration, /select public\.is_workspace_member\(target_organization_id\)/)
  assert.match(migration, /create or replace function public\.is_organization_admin/)
  assert.match(migration, /select public\.is_workspace_admin\(target_organization_id\)/)
})

test('workspace context helpers require server-side membership authorization and hardened cookies', () => {
  assert.match(workspaceServer, /export async function listAccessibleWorkspaces/)
  assert.match(workspaceServer, /\.from\('workspace_memberships'\)/)
  assert.match(workspaceServer, /\.eq\('user_id', user\.id\)/)
  assert.match(workspaceServer, /export async function getCurrentWorkspace/)
  assert.match(workspaceServer, /export async function requireWorkspaceMembership/)
  assert.match(workspaceServer, /export async function requireWorkspaceRole/)
  assert.match(workspaceServer, /export async function setActiveWorkspace/)
  assert.match(workspaceServer, /httpOnly: true/)
  assert.match(workspaceServer, /sameSite: 'lax'/)
  assert.match(workspaceServer, /secure: process\.env\.NODE_ENV === 'production'/)
  assert.match(workspaceServer, /maxAge: ACTIVE_WORKSPACE_COOKIE_MAX_AGE_SECONDS/)
})

test('workspace helper has explicit nested query types and no any escape hatches', () => {
  assert.match(workspaceServer, /type WorkspaceMembershipQueryRow =/)
  assert.match(workspaceServer, /organizations: WorkspaceOrganizationProjection \| WorkspaceOrganizationProjection\[\] \| null/)
  assert.match(workspaceServer, /function normalizeWorkspaceOrganization/)
  assert.match(workspaceServer, /\.returns<WorkspaceMembershipQueryRow\[\]>\(\)/)
  assert.doesNotMatch(workspaceServer, /\bany\b/)
  assert.doesNotMatch(workspaceServer, /as unknown as/)
  assert.doesNotMatch(workspaceServer, /@ts-ignore/)
})

test('redirect and stale cookie control flow are safe', () => {
  assert.match(workspaceServer, /redirect\('\/onboarding'\)/)
  assert.doesNotMatch(workspaceServer, /throw new Error\('Redirecting to onboarding'\)/)
  assert.match(workspaceServer, /workspace\.id !== requestedWorkspaceId\) await clearActiveWorkspaceCookie/)
  assert.match(workspaceServer, /explicitWorkspaceRequested \? null : workspaces\[0\]/)
})

test('validation SQL covers read-only migration checks', () => {
  for (const label of ['Workspaces without billing accounts','Workspaces without active memberships','Owners with multiple workspaces','Owners with multiple billing accounts','Profiles not represented in workspace_memberships','Memberships pointing to archived/deleted users where detectable','Duplicate active memberships']) assert.match(validationSql, new RegExp(`-- ${label}`))
  assert.doesNotMatch(validationSql, /\b(insert|update|delete|alter|drop|create|truncate)\b/i)
})

test('workspace type and membership database types include relation metadata', () => {
  assert.match(workspaceTypes, /export type WorkspaceType = 'team' \| 'shop' \| 'office' \| 'location' \| 'matter' \| 'general'/)
  assert.match(workspaceTypes, /export type WorkspaceRole = 'owner' \| 'admin' \| 'manager' \| 'member' \| 'viewer'/)
  assert.match(databaseTypes, /workspace_memberships: \{/)
  assert.match(databaseTypes, /billing_accounts: \{/)
  assert.match(databaseTypes, /workspace_type: 'team' \| 'shop' \| 'office' \| 'location' \| 'matter' \| 'general'/)
  assert.match(databaseTypes, /foreignKeyName: 'workspace_memberships_workspace_id_fkey'/)
  assert.match(databaseTypes, /referencedRelation: 'organizations'/)
  assert.match(databaseTypes, /foreignKeyName: 'organizations_billing_account_id_fkey'/)
})
