import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const studio = readFileSync('src/features/report-studio/components/ReportStudioPageShell.tsx', 'utf8')
const css = readFileSync('app/globals.css', 'utf8')
const actions = readFileSync('src/features/branding/actions.ts', 'utf8')
const route = readFileSync('app/api/dashboard/sessions/[id]/report-pdf/route.ts', 'utf8')

test('preview-first desktop removes left navigation and uses preview clicks as navigation', () => {
  assert.doesNotMatch(studio, /className="report-studio-sidebar"/)
  assert.doesNotMatch(studio, /Templates"\s*\|/)
  assert.match(studio, /Click any preview section to open matching editable controls/)
  assert.match(studio, /onClick=\{\(\) => setActive\("Header"\)\}/)
  assert.match(studio, /<h1>\{active\}<\/h1>/)
})

test('templates are a global toolbar action with separated saved and system presets', () => {
  assert.match(studio, /setTemplatesOpen\(true\)/)
  assert.match(studio, /Templates[\s\S]*<\/button>/)
  assert.match(studio, /<h3>Saved Templates<\/h3>/)
  assert.match(studio, /<h3>System Templates<\/h3>/)
  assert.match(studio, /Built-in read-only templates\. Apply only\./)
})

test('desktop studio fits viewport and only preview and editor scroll', () => {
  assert.match(css, /\.report-studio-desktop-shell\{[^}]*height:100vh[^}]*overflow:hidden/)
  assert.match(css, /\.report-studio-workbench\{[^}]*overflow:hidden/)
  assert.match(css, /\.report-studio-main\{[^}]*overflow:hidden/)
  assert.match(css, /\.exported-report-preview\{[^}]*overflow:auto/)
  assert.match(css, /\.report-studio-config-panel\{[^}]*overflow:auto/)
})

test('evidence full width and carded preview layouts are visibly different', () => {
  assert.match(css, /\.evidence-image-full_width \.evidence-thumbnail\{[^}]*width:100%/)
  assert.match(css, /\.evidence-layout-carded \.evidence-item[^}]*box-shadow/)
  assert.match(css, /\.evidence-layout-full_width_photos \.evidence-thumbnail\{[^}]*height:320px/)
  assert.match(studio, /data-evidence-image-size=\{brand\.report_style\.evidenceImageSize\}/)
  assert.match(studio, /data-evidence-style=\{brand\.report_style\.evidenceStyle\}/)
})

test('header styling and per-area typography are editable and persisted', () => {
  for (const token of ['Header background color','Header text color','Divider / accent color','Header font family','Optional gradient presets']) assert.match(studio, new RegExp(token))
  for (const area of ['cover_page','header','section_headings','body_text','evidence_titles','evidence_notes','footer','signature']) {
    assert.match(studio, new RegExp(`typography_area_\\$\\{area\\}`))
    assert.match(actions, new RegExp(area))
  }
  assert.match(actions, /areaStacks/)
})

test('ai_summary is not rendered as customer-visible evidence', () => {
  const evidencePreview = studio.slice(studio.indexOf('function ReportStudioEvidencePreview'))
  assert.doesNotMatch(evidencePreview, /ai_summary/)
  assert.doesNotMatch(route, /getPrimaryEvidenceLabel[\s\S]*ai_summary[\s\S]*function looksLikeRawUploadFilename/)
})
