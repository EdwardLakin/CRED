import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync('supabase/migrations/20260630170000_workspace_report_templates.sql', 'utf8')
const brandingPage = readFileSync('app/dashboard/settings/branding/page.tsx', 'utf8')
const studio = readFileSync('src/features/branding/components/BrandingStudio.tsx', 'utf8')
const actions = readFileSync('src/features/branding/actions.ts', 'utf8')
const reportPage = readFileSync('app/dashboard/sessions/[id]/report/page.tsx', 'utf8')
const review = readFileSync('src/features/reports/review/ReviewComponents.tsx', 'utf8')
const exportRoute = readFileSync('app/api/dashboard/sessions/[id]/report-pdf/route.ts', 'utf8')
const reportActions = readFileSync('src/features/reports/actions.ts', 'utf8')

test('workspace report templates are tenant scoped and support multiple templates with one default', () => {
  assert.match(migration, /create table if not exists public\.workspace_report_templates/i)
  assert.match(migration, /organization_id uuid not null references public\.organizations/i)
  assert.match(migration, /identity jsonb/i)
  assert.match(migration, /colors jsonb/i)
  assert.match(migration, /typography jsonb/i)
  assert.match(migration, /report_style jsonb/i)
  assert.match(migration, /workspace_report_templates_one_default_idx[\s\S]*where is_default/i)
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /p\.organization_id = workspace_report_templates\.organization_id/i)
  assert.match(migration, /p\.role in \('owner','admin'\)/i)
})

test('Branding Studio renders saved template management controls', () => {
  assert.match(brandingPage, /workspace_report_templates/)
  assert.match(studio, /Saved Custom Report Templates/)
  assert.match(studio, /Template selector/)
  assert.match(studio, /Unsaved changes/)
  assert.match(studio, /Save as new template/)
  assert.match(studio, /Update current template/)
  assert.match(studio, /Duplicate template/)
  assert.match(studio, /Set Default/)
  assert.match(studio, /Delete/)
  assert.match(studio, /Reset to system default/)
})

test('template actions create update duplicate default and guard deletion', () => {
  assert.match(actions, /saveReportTemplate/)
  assert.match(actions, /template_mode'\)\|\|'create'/)
  assert.match(actions, /mode==='duplicate'/)
  assert.match(actions, /setDefaultReportTemplate/)
  assert.match(actions, /is_default:false/)
  assert.doesNotMatch(actions, /selected_report_image/)
  assert.match(actions, /Set another template as default before deleting this default template/)
})

test('export exposes template selector and passes selection safely', () => {
  assert.match(reportPage, /workspace_report_templates/)
  assert.match(review, /Report Template/)
  assert.match(review, /Workspace default/)
  assert.match(review, /System default/)
  assert.match(review, /report_template_id/)
  assert.match(exportRoute, /requestedTemplateId/)
  assert.match(exportRoute, /eq\("is_default", true\)/)
  assert.match(exportRoute, /requestedTemplateId !== "system"/)
  assert.match(exportRoute, /report_template_snapshot: branding/)
  assert.match(reportActions, /report_template_id/)
})

test('no social reel or AI branding features are introduced', () => {
  for (const source of [migration, studio, actions, review, exportRoute]) {
    assert.doesNotMatch(source, /reel export|social export|AI branding generation|AI diagnosis/i)
  }
})
