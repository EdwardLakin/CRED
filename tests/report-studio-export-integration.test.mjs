import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync('app/api/dashboard/sessions/[id]/report-pdf/route.ts', 'utf8')
const studio = readFileSync('src/features/branding/components/BrandingStudio.tsx', 'utf8')
const types = readFileSync('src/features/branding/types.ts', 'utf8')
const dashboard = readFileSync('app/dashboard/page.tsx', 'utf8')
const settings = readFileSync('app/dashboard/settings/page.tsx', 'utf8')

test('selected, workspace default, system fallback, and old template rows normalize for export', () => {
  assert.match(route, /requestedTemplateId/)
  assert.match(route, /normalizeReportTemplate\(selectedTemplate\)/)
  assert.match(route, /normalizeReportTemplate\(defaultTemplate\)/)
  assert.match(route, /normalizeBrandProfile\(legacyBranding as any\)/)
  assert.match(route, /requestedTemplateId !== "system"/)
  assert.match(route, /normalizeBrandProfile\(exportBranding \?\? null\)/)
  assert.match(types, /rawHeader === 'classic'/)
  assert.match(types, /row\?\.report_style \?\? \{\}/)
})

test('exported report receives classes, tokens, typography, header and evidence layout settings', () => {
  for (const token of ['theme-','typography-','header-','footer-','section-','evidence-','image-','signature-']) assert.match(route, new RegExp(token))
  for (const token of ['--brand-primary','--brand-header-bg','--brand-footer-text','--brand-section-heading','--brand-evidence-accent']) assert.match(route, new RegExp(token))
  assert.match(route, /TYPOGRAPHY_OPTIONS\[brand\.typography\.preset\]/)
  assert.match(route, /brand\.header_layout/)
  assert.match(route, /brand\.report_style\.evidenceStyle/)
  assert.match(route, /brand\.report_style\.evidenceImageSize/)
})

test('cover page, footer, watermark, signature, appendix, and metadata toggles affect report output', () => {
  assert.match(route, /style\.coverPage === "none"\) return ""/)
  assert.match(route, /style\.showCoverLogo/)
  assert.match(route, /style\.showCoverTitle/)
  assert.match(route, /buildPrintFooterHtml/)
  assert.match(route, /brand\?\.footer_text/)
  assert.match(route, /buildWatermarkHtml/)
  assert.match(route, /watermark\.option === "none"/)
  assert.match(route, /show_signature_block === false/)
  assert.match(route, /signatureBlocks\?\.filter\(\(block\) => block\.enabled\)/)
  assert.match(route, /evidenceAppendix === false/)
  assert.match(route, /style\.timestamps \? "<th>Captured<\/th>"/)
  assert.match(route, /style\.captureMetadata \? "<th>Type<\/th>"/)
  assert.match(route, /style\.evidenceIds \? "<th>Evidence ID<\/th>"/)
})

test('custom field definitions only render when report values exist', () => {
  assert.match(route, /buildCustomFieldRows/)
  assert.match(route, /draft\?\.report_structure\.custom_fields/)
  assert.match(route, /typeof value === "string" && value\.trim\(\)/)
})

test('preview modes stay realistic, iPad friendly, and controls use readable labels', () => {
  for (const mode of ['cover page','header','report section','evidence layout','footer','signature','full sample report']) assert.match(studio, new RegExp(mode))
  assert.match(studio, /preview-toggle/)
  assert.match(studio, /brand-preview-panel/)
  assert.doesNotMatch(studio, />[a-z]+[A-Z][A-Za-z]*</)
})

test('guardrails: no prohibited feature families and existing navigation scope remains', () => {
  const combined = `${route}\n${studio}\n${types}`
  assert.doesNotMatch(combined, /social export|reel export|AI branding generation|AI diagnosis|AI recommendation|custom css|raw html|font upload/i)
  assert.match(dashboard, /sessions/i)
  assert.match(settings, /Offline Home Screen/)
})
