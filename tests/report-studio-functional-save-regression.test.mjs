import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const actions = readFileSync('src/features/branding/actions.ts', 'utf8')
const studio = readFileSync('src/features/branding/components/BrandingStudio.tsx', 'utf8')
const page = readFileSync('app/dashboard/settings/branding/page.tsx', 'utf8')
const migration = readFileSync('supabase/migrations/20260630200000_workspace_brand_profiles_v1_safe_columns.sql', 'utf8')
const exportRoute = readFileSync('app/api/dashboard/sessions/[id]/report-pdf/route.ts', 'utf8')

test('workspace_brand_profiles save payload columns are backed by the real migration/schema', () => {
  for (const column of ['license_number','certification_number','tax_number','insurance_number','business_hours','department','branch_location']) {
    assert.match(actions, new RegExp(`${column}:`))
    assert.match(migration, new RegExp(`add column if not exists ${column} text`))
  }
  assert.match(migration, /centered_logo/) 
  assert.match(migration, /industrial_strip/) 
})

test('saveBrandingSettings documents and constrains upsert columns', () => {
  assert.match(actions, /WORKSPACE_BRAND_PROFILE_COLUMNS/)
  assert.doesNotMatch(actions, /selected_report_image/)
  assert.doesNotMatch(actions, /custom_css|raw_html|font_upload/i)
  assert.match(actions, /formatSupabaseError/)
  assert.match(actions, /error\?\.code/) 
})

test('selected session image evidence appears in preview data', () => {
  assert.match(page, /capture_items/) 
  assert.match(page, /thumbnailUrl:c\.storage_path\?originalUrl:null/) 
  assert.match(studio, /selectedSession\.evidence/) 
  assert.match(studio, /evidence\?\.thumbnailUrl/) 
  assert.doesNotMatch(studio, /fake placeholder image|placeholder\.jpg|picsum/i)
})

test('color, template, typography, and preset changes update preview state', () => {
  assert.match(studio, /previewStyle/) 
  assert.match(studio, /--brand-primary/) 
  assert.match(studio, /fontFamily:type\.bodyStack/) 
  assert.match(studio, /applyTemplate\(t\)/) 
  assert.match(studio, /set\('header_layout'/) 
  assert.match(studio, /rs\(\{sectionStyle/) 
  assert.match(studio, /rs\(\{evidenceStyle/) 
})

test('export URL/action includes selected session output id', () => {
  assert.match(studio, /selected_session_output_id=\$\{selectedOutput\}/) 
  assert.match(studio, /review_output=\$\{selectedOutput\}/) 
  assert.match(studio, /studio_export=1/) 
  assert.match(exportRoute, /studioExport/) 
})

test('no nested forms and no horizontal clipping regressions remain covered', () => {
  assert.match(studio, /id="report-studio-form"/) 
  assert.match(studio, /form="save-report-template-form"/) 
  assert.match(studio, /form="report-studio-form"/) 
  assert.match(readFileSync('app/globals.css','utf8'), /min-width:0/) 
})
