import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const toolbar = readFileSync('src/features/report-studio-v2/ReportStudioToolbar.tsx', 'utf8')
const fields = readFileSync('src/features/report-studio-v2/formFields.tsx', 'utf8')
const clientAsset = readFileSync('src/features/report-studio-v2/preview/PreviewClientAsset.tsx', 'utf8')
const signature = readFileSync('src/features/report-studio-v2/preview/PreviewSignature.tsx', 'utf8')
const drawer = readFileSync('src/features/report-studio-v2/ReportTemplateDrawer.tsx', 'utf8')
const presets = readFileSync('src/features/branding/report-presets.ts', 'utf8')
const pdf = readFileSync('src/features/reports/export/executive-pdf.ts', 'utf8')

test('Export Report submits and persists the exact visible Studio draft before opening PDF', () => {
  assert.match(toolbar, /form id="report-studio-export-form" action=\{exportAction\}/)
  assert.match(toolbar, /<button className="button button-primary" type="submit" disabled=\{!state\.selectedSessionId\}>Export Report<\/button>/)
  assert.doesNotMatch(toolbar, /href=\{exportHref\}/)
  assert.match(fields, /name="selected_template_id" value="workspace-default"/)
  assert.match(fields, /name="studio_selected_template_id" value=\{selectedTemplateId \?\? ""\}/)
})

test('live preview does not expose internal approval or review workflow status', () => {
  assert.doesNotMatch(clientAsset, /<dt>Status<\/dt>/)
  assert.doesNotMatch(clientAsset, /approval\?\.status/)
  assert.doesNotMatch(signature, /reviewedByLabel/)
  assert.match(signature, /Report Completion/)
  assert.match(signature, /Completed by/)
})

test('Report Studio offers curated built-in templates that preserve editable customization', () => {
  for (const id of ['preset:professional','preset:executive','preset:inspection','preset:photo-report','preset:minimal']) {
    assert.match(presets, new RegExp(id.replace(':', '\\:')))
  }
  assert.match(drawer, /BUILT_IN_REPORT_PRESETS\.map/)
  assert.match(drawer, /applyBuiltInReportPreset\(baseBrand, preset\.id\)/)
  assert.match(drawer, /Apply template/)
})

test('export renderer consumes Studio layout, typography, evidence, section, header and footer controls', () => {
  assert.match(pdf, /branding\.header_layout/)
  assert.match(pdf, /branding\.footer_layout/)
  assert.match(pdf, /branding\.typography\.headingStack/)
  assert.match(pdf, /branding\.typography\.bodyStack/)
  assert.match(pdf, /style\.sectionStyle/)
  assert.match(pdf, /style\.sectionSpacing/)
  assert.match(pdf, /style\.showSectionLabels/)
  assert.match(pdf, /style\.showSectionDividers/)
  assert.match(pdf, /style\.showSectionNumbers/)
  assert.match(pdf, /style\.evidenceStyle/)
  assert.match(pdf, /style\.evidenceImageSize/)
  assert.match(pdf, /style\.coverPage/)
})
