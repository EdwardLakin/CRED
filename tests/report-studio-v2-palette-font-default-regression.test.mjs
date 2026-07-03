import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const types = readFileSync('src/features/branding/types.ts', 'utf8')
const route = readFileSync('src/features/report-studio-v2/ReportStudioRoute.tsx', 'utf8')
const drawer = readFileSync('src/features/report-studio-v2/ReportTemplateDrawer.tsx', 'utf8')
const toolbar = readFileSync('src/features/report-studio-v2/ReportStudioToolbar.tsx', 'utf8')
const actions = readFileSync('src/features/branding/actions.ts', 'utf8')
const pdf = readFileSync('app/api/dashboard/sessions/[id]/report-pdf/route.ts', 'utf8')

function countArrayItems(source, name) {
  const start = source.indexOf(`export const ${name}`)
  assert.notEqual(start, -1, `${name} exported`)
  const endToken = name === 'BRAND_PALETTES' ? ']\nconst t=' : '] as const'
  const end = source.indexOf(endToken, start)
  assert.notEqual(end, -1, `${name} end`)
  const body = source.slice(start, end)
  return name === 'BRAND_PALETTES' ? (body.match(/name:'/g) || []).length : (body.match(/\n\s*'/g) || []).length
}


test('expanded safe font list has at least 15 CSS system stacks', () => {
  assert.ok(countArrayItems(types, 'SAFE_FONT_STACKS') >= 15)
  assert.doesNotMatch(types, /https?:|@font-face|font upload/i)
  for (const expected of ['Inter','Arial','Helvetica','Verdana','Georgia','Times New Roman','Courier New','Trebuchet MS','Tahoma','Segoe UI','Palatino','Garamond','Baskerville','Avenir','ui-monospace']) assert.match(types, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('palette list has at least 20 full-token palettes', () => {
  assert.ok(countArrayItems(types, 'BRAND_PALETTES') >= 20)
  assert.match(types, /type BrandColors = \{ primary:string; accent:string; headerBackground:string; headerText:string; footerBackground:string; footerText:string; sectionHeading:string; border:string; mutedBackground:string; evidenceAccent:string \}/)
  assert.match(types, /const c=\(x:Partial<BrandColors>\):BrandColors=>\(\{\.\.\.DEFAULT_BRAND_COLORS,\.\.\.x\}\)/)
})

test('palette apply changes draft color tokens independently from template layout', () => {
  assert.match(drawer, /title = drawerMode === 'palettes' \? 'Color Palettes' : 'Templates'/)
  assert.match(drawer, /onApplyPalette\(p\.name,p\.colors\)/)
  assert.match(route, /applyPalette = \(name: string, colors: WorkspaceBrandProfile\["colors"\]\) => \{ patchBrand\(\{ \.\.\.draftBrandProfile, colors \}\)/)
  assert.match(route, /isSystemTemplate \? \{ \.\.\.next, colors: currentColors \} : next/)
  assert.match(drawer, /Applying a template changes layout only/)
  assert.match(drawer, /Apply default palette/)
})

test('saving a custom template persists current template and palette combination', () => {
  assert.match(toolbar, /ReportStudioHiddenFields brand=\{state\.draftBrandProfile\}/)
  assert.match(toolbar, /action=\{saveReportTemplate\}/)
  assert.match(actions, /templatePayloadFromBrand\(brand,profile\.organization_id,profile\.id,name,description,makeDefault\)/)
})

test('setting one saved template as default clears previous default and default loads for studio and export', () => {
  assert.match(drawer, /Currently default/)
  assert.match(drawer, /Set as default/)
  assert.match(actions, /update\(\{is_default:false\}\)\.eq\('organization_id',profile\.organization_id\)/)
  assert.match(actions, /update\(\{is_default:true\}\)\.eq\('id',templateId\)\.eq\('organization_id',profile\.organization_id\)/)
  assert.match(route, /props\.templates\.find\(\(t\) => t\.is_default\)/)
  assert.match(pdf, /eq\("is_default", true\)/)
})
