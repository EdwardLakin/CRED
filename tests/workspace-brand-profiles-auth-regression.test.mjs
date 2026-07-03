import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const actions = readFileSync('src/features/branding/actions.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260703130000_fix_workspace_brand_profiles_rls_auth_uid.sql', 'utf8')
const toolbar = readFileSync('src/features/report-studio-v2/ReportStudioToolbar.tsx', 'utf8')
const mobile = readFileSync('src/features/report-studio-v2/ReportStudioMobileLite.tsx', 'utf8')

test('unauthenticated Report Studio save is rejected cleanly before workspace_brand_profiles write', () => {
  assert.match(actions, /async function requireAuthorizedBrandWorkspace/)
  assert.match(actions, /const profile=await getCurrentProfile\(\)/)
  assert.match(actions, /if\(!profile\) throw new Error\('Sign in to save Report Studio settings\.'\)/)
  assert.match(actions, /const \{supabase, profile\}=await requireAuthorizedBrandWorkspace\(\)/)
})

test('workspace_brand_profiles RLS uses authenticated user id and permits active workspace members/admins', () => {
  assert.doesNotMatch(migration, /p\.id = auth\.uid\(\)/)
  assert.match(migration, /p\.user_id = auth\.uid\(\)/)
  assert.match(migration, /wm\.user_id = auth\.uid\(\)/)
  assert.match(migration, /wm\.workspace_id = workspace_brand_profiles\.organization_id/)
  assert.match(migration, /wm\.status = 'active'/)
  assert.match(migration, /wm\.role in \('owner','admin','manager','member'\)/)
  assert.match(migration, /for insert[\s\S]*with check/)
  assert.match(migration, /for update[\s\S]*using[\s\S]*with check/)
})

test('cross-organization save remains blocked by server-scoped organization_id and RLS tenant check', () => {
  assert.match(actions, /return schemaSafeBrandPayload\(\{organization_id:profile\.organization_id,/)
  assert.doesNotMatch(actions, /organization_id:s\(formData|'organization_id'\)/)
  assert.match(migration, /p\.organization_id = workspace_brand_profiles\.organization_id/)
  assert.match(migration, /wm\.workspace_id = workspace_brand_profiles\.organization_id/)
})

test('Report Studio save and export use authenticated scoped write path without service-role bypass', () => {
  assert.match(toolbar, /id="report-studio-save-form" action=\{saveAction\}/)
  assert.match(toolbar, /id="report-studio-export-form" action=\{exportAction\}/)
  assert.match(mobile, /action=\{saveAction\}/)
  assert.match(mobile, /action=\{exportAction\}/)
  assert.match(actions, /await persistBrandingSettings\(formData,'saveBrandingSettings'\)/)
  assert.match(actions, /await persistBrandingSettings\(formData,'saveBrandingAndExport'\)/)
  assert.doesNotMatch(actions, /createAdminClient|serviceRole|SERVICE_ROLE/i)
})

test('failed Report Studio save shows inline error and does not reset draft UI', () => {
  assert.match(toolbar, /const inlineError = saveState\.error \|\| exportState\.error/)
  assert.match(toolbar, /role="alert"/)
  assert.match(toolbar, /if \(saveState\.ok\) handlers\.setIsDirty\(false\)/)
  assert.doesNotMatch(toolbar, /setDraftBrandProfile\(props\.profile/)
})
