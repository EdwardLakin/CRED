import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const studio = readFileSync('src/features/branding/components/BrandingStudio.tsx', 'utf8')
const css = readFileSync('app/globals.css', 'utf8')
const reviewPage = readFileSync('app/dashboard/sessions/[id]/report/page.tsx', 'utf8')
const route = readFileSync('app/api/dashboard/sessions/[id]/report-pdf/route.ts', 'utf8')
const actions = readFileSync('src/features/branding/actions.ts', 'utf8')
const types = readFileSync('src/features/branding/types.ts', 'utf8')

test('Report Studio desktop/tablet layout prevents horizontal clipping', () => {
  for (const token of ['report-studio-desktop-shell','report-studio-appbar','report-studio-sidebar','report-studio-split','report-live-preview-panel','minmax(0,1fr)','min-width:0','overflow:auto']) {
    assert.match(`${studio}\n${css}`, new RegExp(token.replace(/[()]/g, '\\$&')))
  }
  assert.match(css, /@media\(max-width:900px\)[\s\S]*\.report-studio-split\{grid-template-columns:minmax\(0,1fr\)/)
})


test('Report Studio Lite replaces desktop workbench on phone widths without horizontal overflow', () => {
  assert.match(studio, /report-studio-lite-shell/)
  assert.match(studio, /Lite editor on mobile\. Use desktop or tablet for full Report Studio controls\./)
  for (const token of ['Report/session','Template','Primary color','Accent color','Cover on','Logo on','Report ID on','Item layout','Live Preview','Apply &amp; Export']) {
    assert.match(studio, new RegExp(token.replace(/[()]/g, '\\$&')))
  }
  assert.match(css, /@media\(max-width:720px\)[\s\S]*\.report-studio-desktop-shell\{display:none\}/)
  assert.match(css, /@media\(max-width:720px\)[\s\S]*\.report-studio-lite-shell[^{]*\{[\s\S]*overflow-x:hidden/)
  assert.match(css, /@media\(max-width:720px\)[\s\S]*html,body\{max-width:100%;overflow-x:hidden\}/)
  assert.match(css, /@media\(min-width:721px\)[\s\S]*\.report-studio-desktop-shell\{display:block\}/)
})

test('Report Studio does not render nested forms', () => {
  const formCount = (studio.match(/<form\b/g) ?? []).length
  assert.equal(formCount, 3)
  const liteFormStart = studio.indexOf('<form action={saveBrandingSettings')
  const studioFormStart = studio.indexOf('<form id="report-studio-form"')
  const templateFormStart = studio.indexOf('<form id="save-report-template-form"')
  assert.ok(liteFormStart !== -1 && studioFormStart !== -1 && templateFormStart !== -1)
  assert.ok(studio.indexOf('</form>', liteFormStart) < studioFormStart)
  assert.ok(studio.indexOf('</form>', studioFormStart) < templateFormStart)
  assert.match(studio, /form="save-report-template-form"/)
})

test('standard Review stays in the four-step flow without a Report Studio detour', () => {
  assert.doesNotMatch(reviewPage, /review_output=\$\{currentReport\.id \?\? session\.id\}/)
  assert.match(studio, /name="review_output_id"/)
  assert.match(studio, /Apply &amp; Export/)
  assert.match(route, /requestedTemplateId/)
})

test('Report Studio retains the stable cover choices', () => {
  assert.match(types, /COVER_PAGE_LAYOUTS = \[[^\]]*'none'[^\]]*'simple_cover'[^\]]*'professional_cover'/)
  assert.match(studio, /COVER_PAGE_LAYOUTS\.map/)
  assert.doesNotMatch(studio, /letterhead_cover|image_cover|selected_report_image/)
  assert.doesNotMatch(actions, /selected_report_image/)
})

test('export continues to use normalized Report Studio template', () => {
  assert.match(route, /normalizeReportTemplate\(selectedTemplate\)/)
  assert.match(route, /normalizeBrandProfile\(\s*[\s\S]*exportBranding \?\? null,?\s*\)/)
})
