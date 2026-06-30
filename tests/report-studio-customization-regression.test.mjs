import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const studio = readFileSync('src/features/branding/components/BrandingStudio.tsx', 'utf8')
const page = readFileSync('app/dashboard/settings/branding/page.tsx', 'utf8')
const route = readFileSync('app/api/dashboard/sessions/[id]/report-pdf/route.ts', 'utf8')
const types = readFileSync('src/features/branding/types.ts', 'utf8')

test('Report Studio no longer renders blank placeholder controls or nested forms', () => {
  assert.doesNotMatch(studio, /<span className="palette-card" hidden|<span className="color-chip" hidden|<span className="brand-preview-panel" hidden/)
  assert.equal((studio.match(/<form\b/g) ?? []).length, 2)
})

test('sidebar and preview clicks select matching real editable sections', () => {
  for (const section of ['Cover Page','Header','Report Sections','Evidence Layout','Footer','Signature','Colors & Typography','Templates']) assert.match(studio, new RegExp(section))
  assert.match(studio, /setActive\('Cover Page'\)/)
  assert.match(studio, /setActive\('Header'\)/)
  assert.match(studio, /setActive\('Report Sections'\)/)
  assert.match(studio, /setActive\('Evidence Layout'\)/)
  assert.match(studio, /setActive\('Footer'\)/)
  assert.match(studio, /setActive\('Signature'\)/)
})

test('colors typography templates and v1 cover controls update shared preview state', () => {
  assert.match(studio, /BRAND_PALETTES\.map/)
  assert.match(studio, /TYPOGRAPHY_OPTIONS\[e\.target\.value/)
  assert.match(studio, /applyTemplate/)
  assert.match(studio, /previewStyle=/)
  assert.match(studio, /brand\.report_style\.coverPage/)
  assert.match(types, /COVER_PAGE_LAYOUTS = \['none','simple_cover','professional_cover'\]/)
  assert.doesNotMatch(`${studio}\n${types}`, /selected_report_image|raw html|custom css|font upload/i)
})

test('workspace session selector includes all statuses and export uses selected output/template', () => {
  assert.match(page, /documentation_sessions/)
  assert.match(page, /review_status,updated_at/)
  assert.doesNotMatch(page, /ready_for_delivery'\)/)
  assert.match(studio, /status: \{s\.status\} · review: \{s\.review_status\}/)
  assert.match(studio, /review_output=\$\{selectedOutput\}/)
  assert.match(studio, /template=\$\{selectedTemplateId\}/)
  assert.match(route, /studio_export/) 
})
