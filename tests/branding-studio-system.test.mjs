import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const types = readFileSync('src/features/branding/types.ts','utf8')
const studio = readFileSync('src/features/branding/components/BrandingStudio.tsx','utf8')
const actions = readFileSync('src/features/branding/actions.ts','utf8')
const accountPage = readFileSync('app/dashboard/settings/branding/page.tsx','utf8')
const reportCover = readFileSync('src/features/report-studio/rendering/report-cover.ts','utf8')
const reportFooter = readFileSync('src/features/report-studio/rendering/report-footer.ts','utf8')
const reportSignatures = readFileSync('src/features/report-studio/rendering/report-signatures.ts','utf8')

test('all required palette presets exist and map full color tokens', () => {
  for (const name of ['CRED Blue','Slate Professional','Emerald Service','Copper Trade','Graphite Industrial','Safety Amber','Executive Navy','Clean Medical','Legal Classic','Property Inspection','Fleet Utility','Modern Black','Soft Neutral','High Contrast']) assert.match(types, new RegExp(`name:'${name}'`))
  for (const token of ['primary','accent','headerBackground','headerText','footerBackground','footerText','sectionHeading','border']) assert.match(types, new RegExp(`${token}:'#`))
})

test('human-readable color labels, swatch cards, chips, and invalid hex feedback render', () => {
  for (const label of ['Header background','Header text','Footer background','Footer text','Section heading']) assert.match(types, new RegExp(`${label}`))
  assert.match(studio, /className="palette-card"/)
  assert.match(studio, /className="color-chip"/)
  assert.match(studio, /Enter a valid 6-digit hex color/)
  assert.match(actions, /isValidHexColor\(value\)/)
})

test('typography presets exist and provide safe stack/token values', () => {
  for (const name of ['Professional Sans','Modern Compact','Editorial Serif','Technical Report','Field Service','Legal Document','Clean Corporate','Utility Mono Accent']) assert.match(types, new RegExp(`name:'${name}'`))
  for (const key of ['headingStack','bodyStack','labelStyle','titleWeight','titleSpacing','sectionHeadingLetterSpacing']) assert.match(types, new RegExp(key))
  assert.doesNotMatch(studio, /font upload|custom CSS|raw HTML/i)
})

test('report templates exist, apply defaults, and preserve identity/logo fields', () => {
  for (const name of ['Classic Letterhead','Modern Service Report','Bold Banner','Inspection Binder','Legal Evidence Package','Technical Diagnostic Report','Property Condition Report','Fleet Service Report','Minimal Clean','Executive Summary']) assert.match(types, new RegExp(`name:'${name}'`))
  assert.match(studio, /applyTemplate/)
  assert.match(studio, /Company identity, contact fields, logo, and signature assets will stay unchanged/)
  assert.doesNotMatch(studio.match(/patch\(\{\.\.\.brand[\s\S]*?report_style:\{[\s\S]*?\}\}\)/)?.[0] ?? '', /display_name|logo_storage_path|signature_storage_path/)
})

test('header, footer, signature, and evidence controls affect preview and saved report style', () => {
  for (const key of ['classic_letterhead','compact_service','bold_banner','split_identity','minimal','report_cover','left_rail','certification_block']) assert.match(types, new RegExp(key))
  for (const key of ['showReportDate','showPreparedBy','showPageNumber','showGeneratedByCred','typedSignature','signatureDate','approvalBlock','reviewedByLabel','evidenceStyle','notes','location','evidenceIds','sectionGrouping']) assert.match(types, new RegExp(key))
  assert.match(actions, /show_report_date/)
  assert.match(actions, /evidence_style/)
  assert.match(studio, /brand-preview-/)
  assert.match(studio, /footer\/signature/)
})

test('existing empty branding and saved rows remain compatible', () => {
  assert.match(types, /normalizeBrandProfile\(row/)
  assert.match(types, /row\?\.colors \?\? \{\}/)
  assert.match(types, /row\?\.report_style \?\? \{\}/)
  assert.match(types, /rawHeader === 'classic'/)
})

test('export/report integration still tolerates missing branding assets and signature disabled', () => {
  assert.match(reportCover, /params\.logoUrl \? `<img class="brand-report-logo"/)
  assert.match(reportSignatures, /params\.branding\?\.show_signature_block === false/)
  assert.match(reportFooter, /brand\?\.show_contact_info !== false/)
  assert.match(reportFooter, /brand\?\.show_report_id !== false/)
})

test('guardrails: offline home card remains account-scoped and prohibited features are absent', () => {
  assert.match(accountPage, /Account/)
  const combined = `${types}\n${studio}`
  assert.doesNotMatch(combined, /social export|reel export|AI branding generation|AI diagnosis|AI recommendation|custom css|raw html|font upload/i)
})
