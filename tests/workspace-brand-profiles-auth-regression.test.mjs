import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const actions = readFileSync('src/features/branding/actions.ts', 'utf8')
const serverClient = readFileSync('src/lib/supabase/server.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260703130000_fix_workspace_brand_profiles_rls_auth_uid.sql', 'utf8')
const toolbar = readFileSync('src/features/report-studio-v2/ReportStudioToolbar.tsx', 'utf8')
const mobile = readFileSync('src/features/report-studio-v2/ReportStudioMobileLite.tsx', 'utf8')

test('save uses the authenticated server client with request cookies/session', () => {
  assert.match(serverClient, /import \{ cookies \} from 'next\/headers'/)
  assert.match(serverClient, /const cookieStore = await cookies\(\)/)
  assert.match(serverClient, /createServerClient<Database>/)
  assert.match(serverClient, /getSupabaseAnonKey\(\)/)
  assert.match(actions, /const supabase=await createClient\(\);\n  const \{data:\{user\}\}=await supabase\.auth\.getUser\(\)/)
  assert.match(actions, /const \{supabase, profile, authContext\}=await requireAuthorizedBrandWorkspace\(action\)/)
})

test('unauthenticated Report Studio save is rejected cleanly before workspace_brand_profiles write', () => {
  assert.match(actions, /async function requireAuthorizedBrandWorkspace/)
  assert.match(actions, /if\(!user\)\{[\s\S]*throw new Error\('Your session expired\. Refresh and sign in again\.'\)/)
  assert.match(actions, /if\(!profile\?\.id \|\| !profile\.organization_id\) throw new Error\('Your session expired\. Refresh and sign in again\.'\)/)
  assert.match(toolbar, /const inlineError = saveState\.error \|\| exportState\.error/)
})

test('no service role or admin client is used for Report Studio brand profile save/export', () => {
  const savePath = actions.slice(actions.indexOf('async function requireAuthorizedBrandWorkspace'), actions.indexOf('export async function resetBrandingSettings'))
  assert.doesNotMatch(savePath, /createAdminClient|serviceRole|SERVICE_ROLE|getSupabaseServiceRoleKey/i)
  assert.match(savePath, /getSupabaseAnonKey|createClient\(\)/)
})

test('organization_id is derived server-side and never accepted from form data', () => {
  assert.match(actions, /return schemaSafeBrandPayload\(\{organization_id:profile\.organization_id,/)
  assert.doesNotMatch(actions, /organization_id:s\(formData/)
  assert.doesNotMatch(actions, /formData\.get\('organization_id'\)/)
})

test('workspace_brand_profiles RLS uses authenticated user id, not profile id', () => {
  assert.doesNotMatch(migration, /p\.id = auth\.uid\(\)/)
  assert.match(migration, /p\.user_id = auth\.uid\(\)/)
  assert.match(migration, /wm\.user_id = auth\.uid\(\)/)
  assert.match(migration, /for select[\s\S]*using/)
  assert.match(migration, /for insert[\s\S]*with check/)
  assert.match(migration, /for update[\s\S]*using[\s\S]*with check/)
})

test('active workspace membership can save via RLS insert/update policies', () => {
  assert.match(migration, /wm\.workspace_id = workspace_brand_profiles\.organization_id/)
  assert.match(migration, /wm\.status = 'active'/)
  assert.match(migration, /wm\.role in \('owner','admin','manager','member'\)/)
})

test('cross-organization save remains blocked by server-scoped organization_id and RLS tenant check', () => {
  assert.match(actions, /organization_id:profile\.organization_id/)
  assert.match(migration, /p\.organization_id = workspace_brand_profiles\.organization_id/)
  assert.match(migration, /wm\.workspace_id = workspace_brand_profiles\.organization_id/)
})

test('Report Studio save and export use authenticated scoped write path and structured logs', () => {
  assert.match(toolbar, /id="report-studio-save-form" action=\{saveAction\}/)
  assert.match(toolbar, /id="report-studio-export-form" action=\{exportAction\}/)
  assert.match(mobile, /action=\{saveAction\}/)
  assert.match(mobile, /action=\{exportAction\}/)
  assert.match(actions, /await persistBrandingSettings\(formData,'saveBrandingSettings'\)/)
  assert.match(actions, /await persistBrandingSettings\(formData,'saveBrandingAndExport'\)/)
  for (const field of ['hasUser', 'userIdPresent', 'profileIdPresent', 'organizationIdPresent', 'code', 'message']) {
    assert.match(actions, new RegExp(field))
  }
  assert.doesNotMatch(actions, /console\.info\('\[workspace_brand_profiles upsert payload\]', payload\)/)
})

test('failed Report Studio save shows inline error and does not reset draft UI', () => {
  assert.match(toolbar, /const inlineError = saveState\.error \|\| exportState\.error/)
  assert.match(toolbar, /role="alert"/)
  assert.match(toolbar, /if \(saveState\.ok\) handlers\.setIsDirty\(false\)/)
  assert.doesNotMatch(toolbar, /setDraftBrandProfile\(props\.profile/)
})
