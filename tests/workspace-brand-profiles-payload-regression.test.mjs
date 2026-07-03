import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const actions = readFileSync('src/features/branding/actions.ts', 'utf8')
const v2Fields = readFileSync('src/features/report-studio-v2/formFields.tsx', 'utf8')
const constants = readFileSync('src/features/branding/actionConstants.ts', 'utf8')

const workspaceBrandWriteMatches = [...actions.matchAll(/from\('workspace_brand_profiles'\)[\s\S]{0,120}?\.(upsert|insert)\(/g)]

test('workspace_brand_profiles writes are centralized through schemaSafeBrandPayload', () => {
  assert.equal(workspaceBrandWriteMatches.length, 1)
  assert.equal(workspaceBrandWriteMatches[0][1], 'upsert')
  assert.match(actions, /const payload=await buildBrandingSettingsPayload\(formData,profile,\{logo,darkLogo,icon,signature:sig\}\)/)
  assert.match(actions, /return schemaSafeBrandPayload\(\{organization_id:profile\.organization_id,/) 
})

test('workspace_brand_profiles write payload never includes branch_location', () => {
  const schemaSafeBody = actions.slice(actions.indexOf('function schemaSafeBrandPayload'), actions.indexOf('function logSupabaseSaveError'))
  const builderBody = actions.slice(actions.indexOf('export async function buildBrandingSettingsPayload'), actions.indexOf('async function persistBrandingSettings'))
  assert.doesNotMatch(constants, /branch_location/)
  assert.doesNotMatch(schemaSafeBody, /branch_location/)
  assert.doesNotMatch(builderBody, /branch_location\s*:/)
  assert.doesNotMatch(actions, /\.upsert\(\{[\s\S]*branch_location/)
  assert.doesNotMatch(actions, /\.insert\(\{[\s\S]*branch_location/)
  assert.doesNotMatch(actions, /\.upsert\(\s*draftBrandProfile|\.insert\(\s*draftBrandProfile|\.upsert\(\s*\{\s*\.\.\.draftBrandProfile|\.insert\(\s*\{\s*\.\.\.draftBrandProfile/)
  assert.doesNotMatch(v2Fields, /name=\{?['\"]branch_location/)
})

test('workspace_brand_profiles upsert logs safe structured payload metadata before sending it to Supabase', () => {
  assert.match(actions, /console\.info\('\[workspace_brand_profiles upsert payload\]', \{action,payloadColumns:Object\.keys\(payload\),organizationIdPresent:Boolean\(payload\.organization_id\)\}\); const \{error\}=await \(supabase\.from\('workspace_brand_profiles'\) as any\)\.upsert\(payload,\{onConflict:'organization_id'\}\)/)
  assert.doesNotMatch(actions, /console\.info\('\[workspace_brand_profiles upsert payload\]', payload\)/)
})
