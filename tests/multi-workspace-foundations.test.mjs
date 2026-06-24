import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync('supabase/migrations/20260624120000_multi_workspace_membership_foundations.sql', 'utf8')
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

test('RLS compatibility delegates organization checks to workspace membership helpers', () => {
  assert.match(migration, /create or replace function public\.is_workspace_member/)
  assert.match(migration, /from public\.workspace_memberships wm/)
  assert.match(migration, /wm\.status = 'active'/)
  assert.match(migration, /create or replace function public\.is_org_member/)
  assert.match(migration, /select public\.is_workspace_member\(target_organization_id\)/)
  assert.match(migration, /create or replace function public\.is_organization_admin/)
  assert.match(migration, /select public\.is_workspace_admin\(target_organization_id\)/)
})

test('workspace context helpers require server-side membership authorization', () => {
  assert.match(workspaceServer, /export async function listAccessibleWorkspaces/)
  assert.match(workspaceServer, /\.from\('workspace_memberships'\)/)
  assert.match(workspaceServer, /\.eq\('user_id', user\.id\)/)
  assert.match(workspaceServer, /export async function getCurrentWorkspace/)
  assert.match(workspaceServer, /export async function requireWorkspaceMembership/)
  assert.match(workspaceServer, /export async function requireWorkspaceRole/)
  assert.match(workspaceServer, /export async function setActiveWorkspace/)
  assert.match(workspaceServer, /httpOnly: true/)
})

test('workspace type and membership database types are available to application code', () => {
  assert.match(workspaceTypes, /export type WorkspaceType = 'team' \| 'shop' \| 'office' \| 'location' \| 'matter' \| 'general'/)
  assert.match(workspaceTypes, /export type WorkspaceRole = 'owner' \| 'admin' \| 'manager' \| 'member' \| 'viewer'/)
  assert.match(databaseTypes, /workspace_memberships: \{/)
  assert.match(databaseTypes, /billing_accounts: \{/)
  assert.match(databaseTypes, /workspace_type: 'team' \| 'shop' \| 'office' \| 'location' \| 'matter' \| 'general'/)
})
