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
  assert.match(css, /@media\(max-width:1100px\)[\s\S]*\.report-studio-split\{grid-template-columns:1fr\}/)
})

test('Report Studio does not render nested forms', () => {
  const formCount = (studio.match(/<form\b/g) ?? []).length
  assert.equal(formCount, 2)
  assert.doesNotMatch(studio, /<form[\s\S]*<form[\s\S]*<\/form>[\s\S]*<\/form>/)
  assert.match(studio, /form="save-report-template-form"/)
})

test('selected Review output is passed into Report Studio and export controls', () => {
  assert.match(reviewPage, /review_output=\$\{currentReport\.id \?\? session\.id\}/)
  assert.match(studio, /name="review_output_id"/)
  assert.match(studio, /Apply &amp; Export/)
  assert.match(route, /requestedTemplateId/)
})

test('Report Studio cover choices remain v1-only', () => {
  assert.match(types, /COVER_PAGE_LAYOUTS = \['none','simple_cover','professional_cover'\]/)
  assert.match(studio, /COVER_PAGE_LAYOUTS\.map/)
  assert.doesNotMatch(studio, /letterhead_cover|image_cover|selected_report_image/)
  assert.doesNotMatch(actions, /selected_report_image/)
})

test('export continues to use normalized Report Studio template', () => {
  assert.match(route, /normalizeReportTemplate\(selectedTemplate\)/)
  assert.match(route, /normalizeBrandProfile\(exportBranding \?\? null\)/)
})
