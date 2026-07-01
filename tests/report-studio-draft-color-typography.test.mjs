import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const studio = readFileSync('src/features/report-studio/components/ReportStudioPageShell.tsx', 'utf8')
const actions = readFileSync('src/features/branding/actions.ts', 'utf8')
const renderModel = readFileSync('src/features/report-studio/rendering/buildReportRenderModel.ts', 'utf8')

test('template save posts the current draft brand fields instead of reloading stale workspace profile', () => {
  assert.match(studio, /draftBrandProfile/)
  assert.match(studio, /<form id="save-report-template-form" action=\{saveReportTemplate\}><HiddenBrandFields brand=\{brand\}/)
  const saveTemplateBody = actions.slice(actions.indexOf('export async function saveReportTemplate'), actions.indexOf('export async function deleteReportTemplate'))
  assert.doesNotMatch(saveTemplateBody, /from\('workspace_brand_profiles'\).*maybeSingle\(\)/s)
  assert.match(actions, /buildBrandingSettingsPayload\(formData,profile/)
})

test('color token editing exposes picker, hex validation, reset, and known-token hidden payload', () => {
  for (const token of ['primary','accent','headerBackground','headerText','footerBackground','footerText','sectionHeading','border','mutedBackground','evidenceAccent']) {
    assert.match(studio, new RegExp(`color_\\$\\{k\\}`))
  }
  assert.match(studio, /type="color"/)
  assert.match(studio, /aria-invalid=\{!isValidHexColor/)
  assert.match(studio, /Reset token/)
  assert.match(actions, /const colorKeys=\['primary','accent','headerBackground','headerText','footerBackground','footerText','sectionHeading','border','mutedBackground','evidenceAccent'\]/)
})

test('safe typography saves full editable object and preview/render model reads the same draft tokens', () => {
  for (const field of ['headingStack','bodyStack','labelStyle','headingWeight','titleWeight','letterSpacing','titleSpacing','sectionHeadingLetterSpacing','metadataStyle']) {
    assert.match(studio, new RegExp(`typography_${field}`))
    assert.match(actions, new RegExp(field))
  }
  assert.match(studio, /SAFE_FONT_STACKS/)
  assert.match(renderModel, /typography: brand\.typography/)
})
