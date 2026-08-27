import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const studio = readFileSync('src/features/branding/components/BrandingStudio.tsx', 'utf8')
const page = readFileSync('app/dashboard/settings/branding/page.tsx', 'utf8')
const route = readFileSync('app/api/dashboard/sessions/[id]/report-pdf/route.ts', 'utf8')
const types = readFileSync('src/features/branding/types.ts', 'utf8')

test('Report Studio no longer renders blank placeholder controls or nested forms', () => {
  assert.doesNotMatch(studio, /<span className="palette-card" hidden|<span className="color-chip" hidden|<span className="brand-preview-panel" hidden/)
  assert.equal((studio.match(/<form\b/g) ?? []).length, 3)
})

test('sidebar and preview clicks select matching real editable sections', () => {
  for (const section of ['Cover Page','Header','Client / Asset','Items','Footer','Signature','Colors & Typography','Templates']) assert.match(studio, new RegExp(section))
  assert.match(studio, /setActive\('Cover Page'\)/)
  assert.match(studio, /setActive\('Header'\)/)
  assert.match(studio, /setActive\('Client \/ Asset'\)/)
  assert.match(studio, /setActive\('Items'\)/)
  assert.match(studio, /setActive\('Footer'\)/)
  assert.match(studio, /setActive\('Signature'\)/)
  assert.match(studio, /ITEM-/)
  assert.doesNotMatch(studio, />Evidence<|Evidence layout|Evidence numbering|EV-/)
})

test('colors typography templates and v1 cover controls update shared preview state', () => {
  assert.match(studio, /BRAND_PALETTES\.map/)
  assert.match(studio, /TYPOGRAPHY_OPTIONS\[e\.target\.value/)
  assert.match(studio, /applyTemplate/)
  assert.match(studio, /previewStyle=/)
  assert.match(studio, /brand\.report_style\.coverPage/)
  assert.match(types, /COVER_PAGE_LAYOUTS = \[[^\]]*'none'[^\]]*'simple_cover'[^\]]*'professional_cover'/)
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

test('preview renderer has explicit component branches for cover, sections, evidence, signature, and footer', () => {
  for (const component of ['ReportStudioPreview','ReportStudioCoverPreview','ReportStudioHeaderPreview','ReportStudioSectionPreview','ReportStudioEvidencePreview','ReportStudioSignaturePreview','ReportStudioFooterPreview']) assert.match(studio, new RegExp(`function ${component}`))
  assert.match(studio, /brand\.report_style\.coverPage==='none'\) return null/)
  const css = readFileSync('app/globals.css', 'utf8')
  assert.match(css, /cover-simple_cover/)
  assert.match(css, /cover-professional_cover/)
  assert.match(studio, /showCoverLogo/)
  assert.match(studio, /showCoverReportId/)
})

test('preview renderer exposes behavior markers for section and evidence presets', () => {
  assert.match(studio, /data-section-style=\{brand\.report_style\.sectionStyle\}/)
  assert.match(studio, /data-section-spacing=\{brand\.report_style\.sectionSpacing\}/)
  assert.match(studio, /data-evidence-style=\{brand\.report_style\.evidenceStyle\}/)
  assert.match(studio, /data-evidence-image-size=\{brand\.report_style\.evidenceImageSize\}/)
  assert.match(studio, /section-layout-\$\{rs\.sectionStyle\}/)
  assert.match(studio, /section-spacing-\$\{rs\.sectionSpacing\}/)
  assert.match(studio, /evidence-layout-\$\{rs\.evidenceStyle\}/)
  assert.match(studio, /evidence-image-\$\{rs\.evidenceImageSize\}/)
  assert.match(studio, /rs\.notes \?/) 
  assert.match(studio, /rs\.timestamps&&/)
  assert.match(studio, /rs\.captureMetadata&&/)
  assert.match(studio, /selectedSession\.evidence/)
})

test('preview CSS gives every section style, spacing, evidence style, and image size visible rules', () => {
  const css = readFileSync('app/globals.css', 'utf8')
  for (const style of ['carded','clean_document','boxed','minimal','classic','industrial','corporate','legal','inspection','technical','clean','ruled','binder','executive']) assert.match(css, new RegExp(`section-layout-${style}`))
  for (const spacing of ['compact','standard','spacious']) assert.match(css, new RegExp(`section-spacing-${spacing}`))
  for (const size of ['compact','standard','large','full_width']) assert.match(css, new RegExp(`evidence-image-${size} \\.evidence-thumbnail`))
  for (const style of ['compact_list','standard_cards','large_photo_cards','full_width_photos','two_column_photo_grid','numbered_appendix','clean_evidence_list','photo_left_notes_right','notes_first_photos_below','insurance_photo_grid','carded','clean_list','photo_grid']) assert.match(css, new RegExp(`evidence-layout-${style}`))
})
