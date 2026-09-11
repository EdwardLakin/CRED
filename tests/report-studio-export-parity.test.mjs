import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const toolbar = readFileSync('src/features/report-studio-v2/ReportStudioToolbar.tsx','utf8')
const mobile = readFileSync('src/features/report-studio-v2/ReportStudioMobileLite.tsx','utf8')
const drawer = readFileSync('src/features/report-studio-v2/ReportTemplateDrawer.tsx','utf8')
const presets = readFileSync('src/features/branding/report-presets.ts','utf8')
const exportAction = readFileSync('src/features/report-studio-v2/exportAction.ts','utf8')
const clientAsset = readFileSync('src/features/report-studio-v2/preview/PreviewClientAsset.tsx','utf8')
const signature = readFileSync('src/features/report-studio-v2/preview/PreviewSignature.tsx','utf8')
const previewHeader = readFileSync('src/features/report-studio-v2/preview/PreviewHeader.tsx','utf8')

test('Export Report saves the visible draft and summary before same-tab navigation', () => {
  assert.match(toolbar, /action=\{exportAction\}/)
  assert.match(toolbar, /name="report_summary"/)
  assert.match(toolbar, /name="session_id"/)
  assert.match(toolbar, /window\.location\.assign\(exportState\.redirectTo\)/)
  assert.doesNotMatch(toolbar, /window\.open/)
  assert.match(exportAction, /saveReportSummaryFromStudio/)
  assert.match(exportAction, /STUDIO_EXPORT_TEMPLATE_NAME/)
  assert.match(exportAction, /formData\.set\('selected_template_id', templateId\)/)
})

test('mobile built-in template adapter forwards the explicit preset id', () => {
  assert.match(mobile, /presetId\?:string/)
  assert.match(mobile, /const id=presetId \?\? template\.id/)
})

test('curated built-in report templates are available', () => {
  for (const id of ['preset:professional','preset:executive','preset:inspection','preset:photo-report','preset:minimal']) {
    assert.match(presets, new RegExp(id.replace(':','\\:')))
  }
  assert.match(drawer, /BUILT_IN_REPORT_PRESETS\.map/)
})

test('built-in typography replaces stale area-specific stacks', () => {
  assert.match(presets, /function typography/)
  assert.match(presets, /cover_page: option\.headingStack/)
  assert.match(presets, /signature: option\.bodyStack/)
})

test('customer preview does not expose workflow approval labels', () => {
  assert.doesNotMatch(clientAsset, /<dt>Status<\/dt>/)
  assert.doesNotMatch(clientAsset, /approval\?\.status/)
  assert.doesNotMatch(signature, /reviewedByLabel/)
  assert.match(signature, /Report Completion/)
  assert.match(signature, /Completed by/)
})

test('header Accent rail has the same rail semantics in preview', () => {
  assert.match(previewHeader, /borderLeft:`8px solid/)
  assert.doesNotMatch(previewHeader, /is-gradient/)
})
