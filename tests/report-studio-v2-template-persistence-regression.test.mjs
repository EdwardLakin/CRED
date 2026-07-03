import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const toolbar = readFileSync('src/features/report-studio-v2/ReportStudioToolbar.tsx', 'utf8')
const desktop = readFileSync('src/features/report-studio-v2/ReportStudioDesktop.tsx', 'utf8')
const drawer = readFileSync('src/features/report-studio-v2/ReportTemplateDrawer.tsx', 'utf8')
const route = readFileSync('src/features/report-studio-v2/ReportStudioRoute.tsx', 'utf8')
const actions = readFileSync('src/features/branding/actions.ts', 'utf8')
const templates = readFileSync('src/features/branding/templates.ts', 'utf8')
const formFields = readFileSync('src/features/report-studio-v2/formFields.tsx', 'utf8')

test('save as template preserves current draft UI state instead of refreshing stale branding', () => {
  assert.doesNotMatch(toolbar, /window\.location\.replace\(window\.location\.pathname \+ "\?template_saved=1"\)/)
  assert.match(toolbar, /if \(!templateState\.ok\) return/)
  assert.match(toolbar, /setSaveTemplateOpen\(false\)/)
  assert.match(toolbar, /Template saved/)
})

test('saved template payload includes colors typography layout and report settings from current draft', () => {
  assert.match(toolbar, /ReportStudioHiddenFields brand=\{state\.draftBrandProfile\}/)
  assert.match(formFields, /Object\.entries\(brand\.colors\)/)
  assert.match(formFields, /typography_preset/)
  assert.match(formFields, /header_layout/)
  assert.match(formFields, /footer_layout/)
  assert.match(formFields, /cover_page/)
  assert.match(formFields, /signature_layout/)
  assert.match(actions, /buildBrandingSettingsPayload\(formData,profile/)
  assert.match(templates, /colors: brand\.colors/)
  assert.match(templates, /typography: brand\.typography/)
  assert.match(templates, /report_style: brand\.report_style/)
})

test('applying saved templates restores saved colors while system templates keep current colors unless default palette is requested', () => {
  assert.match(route, /const isSystemTemplate = id\.startsWith\("system:"\)/)
  assert.match(route, /patchBrand\(isSystemTemplate \? \{ \.\.\.next, colors: currentColors \} : next\)/)
  assert.match(route, /applyTemplateDefaultPalette = \(template: WorkspaceBrandProfile, id: string\) => \{ patchBrand\(normalizeBrandProfile\(template\)\)/)
  assert.match(drawer, /Applying a template changes layout only/)
  assert.match(drawer, /Apply default palette/)
})

test('applying palette changes only colors and keeps selected template layout', () => {
  assert.match(route, /applyPalette = \(name: string, colors: WorkspaceBrandProfile\["colors"\]\) => \{ patchBrand\(\{ \.\.\.draftBrandProfile, colors \}\); setSelectedPaletteName\(name\); \}/)
  assert.doesNotMatch(route, /applyPalette[\s\S]{0,120}setSelectedTemplateId/)
})

test('toolbar buttons open separate drawer content for templates and palettes', () => {
  assert.match(toolbar, /onTemplates: \(\) => void; onPalettes: \(\) => void/)
  assert.match(toolbar, /onClick=\{onTemplates\}>Templates/)
  assert.match(toolbar, /onClick=\{onPalettes\}>Palettes/)
  assert.match(desktop, /openTemplates=\(\)=>setDrawerMode\("templates"\)/)
  assert.match(desktop, /openPalettes=\(\)=>setDrawerMode\("palettes"\)/)
  assert.match(drawer, /drawerMode === 'palettes' \? 'Color Palettes' : 'Templates'/)
  assert.match(drawer, /drawerMode==='templates'/)
  assert.match(drawer, /drawerMode==='palettes'/)
})

test('newly saved template is returned and added to Saved Templates immediately', () => {
  assert.match(actions, /insert\(payload\)\.select\('\*'\)\.single\(\)/)
  assert.match(actions, /template:savedTemplate \? normalizeReportTemplate\(savedTemplate\) : undefined/)
  assert.match(toolbar, /onTemplateSaved\?\.\(templateState\.template\)/)
  assert.match(desktop, /upsertSavedTemplate=\(template:any\)=>setSavedTemplates/)
})

test('default template persists and is visually marked', () => {
  assert.match(actions, /update\(\{is_default:false\}\)\.eq\('organization_id',profile\.organization_id\)/)
  assert.match(actions, /update\(\{is_default:true\}\)\.eq\('id',templateId\)\.eq\('organization_id',profile\.organization_id\)/)
  assert.match(drawer, /status-pill">Default/)
  assert.match(drawer, /className=\{t\.is_default \|\| t\.id===defaultTemplateId \? 'rsv2-template-row is-default'/)
})

test('save as template does not upsert workspace_brand_profiles', () => {
  const saveTemplateBody = actions.slice(actions.indexOf('export async function saveReportTemplateAction'), actions.indexOf('export async function saveReportTemplate(formData'))
  assert.doesNotMatch(saveTemplateBody, /workspace_brand_profiles/)
  assert.doesNotMatch(saveTemplateBody, /persistBrandingSettings/)
})
