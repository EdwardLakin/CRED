import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const ts = require('typescript')

async function loadReportStudioRendering() {
  let source = `
function formatDateTimeInTimeZone(value, timeZone) { return new Date(value).toISOString() }
function stripConfidenceText(value) { return String(value ?? '').replace(/\s*\(confidence:?\s*[^)]*\)/ig, '') }
function getReportInfoValue(draft, session, key) { return draft?.report_structure?.report_info?.[key] ?? '' }
`
  for (const file of [
    'src/features/branding/types.ts',
    'src/features/branding/templates.ts',
    'src/features/report-studio/rendering/html.ts',
    'src/features/report-studio/rendering/report-watermark.ts',
    'src/features/report-studio/rendering/report-brand-css.ts',
    'src/features/report-studio/rendering/report-shell.ts',
    'src/features/report-studio/rendering/report-cover.ts',
    'src/features/report-studio/rendering/report-footer.ts',
    'src/features/report-studio/rendering/report-signatures.ts',
  ]) {
    source += `\n${readFileSync(file, 'utf8').replace(/^import .*$/mg, '')}\n`
  }
  const outputText = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const dir = mkdtempSync(join(tmpdir(), 'cred-report-studio-fixtures-'))
  const modulePath = join(dir, 'rendering.mjs')
  writeFileSync(modulePath, outputText)
  return import(modulePath)
}

const session = {
  display_id: 'CRED-2026-001',
  title: 'Fleet unit inspection',
  session_type: 'inspection',
  customer_name: 'Northwind Fleet',
  asset_label: 'Unit 42',
  unit_number: '42',
  created_at: '2026-06-20T10:00:00.000Z',
  updated_at: '2026-06-21T11:30:00.000Z',
}
const draft = {
  updated_at: '2026-06-22T12:00:00.000Z',
  report_structure: {
    report_info: { location: 'Bay 3', reference_number: 'WO-123' },
    custom_fields: { 'Work Order #': 'WO-123' },
  },
}
const captures = [
  { id: 'cap-img', media_kind: 'image', type: 'photo', captured_at: '2026-06-20T10:02:00.000Z', technician_note: 'front brake photo' },
  { id: 'cap-doc', media_kind: 'document', type: 'pdf', captured_at: '2026-06-20T10:03:00.000Z', technician_note: 'signed work order' },
  { id: 'cap-missing', media_kind: 'image', type: 'photo', captured_at: '2026-06-20T10:04:00.000Z', technician_note: '' },
]
const imageAssets = {
  'cap-img': { classification: 'webSafeImage', mediaUrl: 'https://cdn.example.test/evidence/cap-img.jpg', originalMediaUrl: 'https://cdn.example.test/evidence/cap-img-original.jpg' },
  'cap-missing': { classification: 'unsupported' },
}

function rowsHtml(rows) {
  return `<dl>${rows.filter((row) => row.value).map((row) => `<div><dt>${row.label}</dt><dd>${row.value}</dd></div>`).join('')}</dl>`
}
function renderExportImage(asset, alt, fallbackText) {
  const fallback = `<div class="media-fallback export-image-fallback">${fallbackText}</div>`
  if (asset?.classification === 'webSafeImage' && asset.mediaUrl) {
    return `<img src="${asset.mediaUrl}" alt="${alt}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />${fallback.replace('>', ' style="display:none">')}`
  }
  return fallback
}
function appendixHtml(captures, assets, brand) {
  const style = brand.report_style
  if (style.evidenceAppendix === false) return ''
  return `<section class="item service-section evidence-appendix-section"><h2>Evidence Appendix</h2><table class="evidence-appendix"><thead><tr><th>Preview</th>${style.evidenceIds ? '<th>Evidence ID</th>' : ''}<th>Caption / Title</th>${style.timestamps ? '<th>Captured</th>' : ''}${style.captureMetadata ? '<th>Type</th>' : ''}</tr></thead><tbody>${captures.map((capture, index) => `<tr><td class="appendix-thumb">${capture.media_kind === 'image' ? renderExportImage(assets[capture.id], `Evidence ${index + 1}`, 'Image unavailable') : capture.media_kind}</td>${style.evidenceIds ? `<td>EV-${String(index + 1).padStart(3, '0')}</td>` : ''}<td>${capture.technician_note || `Evidence ${index + 1}`}</td>${style.timestamps ? `<td>${capture.captured_at}</td>` : ''}${style.captureMetadata ? `<td>${capture.media_kind}</td>` : ''}</tr>`).join('')}</tbody></table></section>`
}

function makeBrand(api, overrides = {}) {
  return api.normalizeBrandProfile({
    display_name: 'Acme Service',
    tagline: 'Customer-ready documentation.',
    phone: '555-0100',
    email: 'service@example.test',
    website: 'https://example.test',
    address: '1 Service Way',
    footer_text: 'Prepared for customer records.',
    colors: { primary: '#0f766e', evidenceAccent: '#b91c1c' },
    report_style: { ...overrides.report_style },
    ...overrides,
  })
}

function exportFixtureHtml(api, brand, { logoUrl = null, includeSignature = true } = {}) {
  const helpers = {
    isImageEvidence: (capture) => capture.media_kind === 'image',
    renderDefinitionRows: rowsHtml,
    renderExportImage,
    getUserEvidenceText: (capture) => capture.technician_note || '',
    getPrimaryEvidenceLabel: (capture) => capture.technician_note || 'Evidence',
  }
  return `<!doctype html><html><head><style>${api.buildBrandCss(brand)}</style></head><body>${api.buildReportOpen({ branding: brand, timeZone: 'UTC' })}${api.buildReportCoverHtml({ reportTitle: session.title, reportType: 'Inspection', session, draft, organizationName: 'Acme Service', captures, imageAssets, timeZone: 'UTC', allowCoverImage: true, branding: brand, logoUrl, helpers })}<section class="item service-section"><h2>Findings</h2><p>Observed condition documented from submitted evidence.</p></section>${appendixHtml(captures, imageAssets, brand)}${includeSignature ? api.buildApprovalHtml({ profile: { full_name: 'Pat Inspector', inspector_role_or_title: 'Inspector' }, signatures: [], signatureUrls: {}, draft, session, timeZone: 'UTC', branding: brand, helpers: { renderDefinitionRows: rowsHtml, getApprovalDate: () => '2026-06-22T12:00:00.000Z' } }) : ''}${api.buildPrintFooterHtml({ organizationName: 'Acme Service', reportId: session.display_id, generatedAt: '2026-06-22T12:00:00.000Z', branding: brand })}</main></body></html>`
}

test('fixture exports render system, workspace, custom, and legacy branding classes and tokens', async () => {
  const api = await loadReportStudioRendering()
  const system = api.DEFAULT_BRAND_PROFILE
  const workspace = makeBrand(api, { report_style: { evidenceStyle: 'photo_grid', evidenceImageSize: 'large' } })
  const custom = makeBrand(api, { header_layout: 'bold_banner', footer_layout: 'legal_footer', report_style: { sectionStyle: 'legal', watermark: { option: 'confidential', opacity: 'standard' } } })
  const legacy = api.normalizeReportTemplate({ id: 'tpl-legacy', organization_id: 'org-1', name: 'Legacy', created_at: '2026-06-01', updated_at: '2026-06-02', header_layout: 'classic', footer_layout: 'standard', report_style: { coverPage: 'letterhead_cover' } })

  for (const brand of [system, workspace, custom, legacy]) {
    const html = exportFixtureHtml(api, brand)
    assert.match(html, /class="report theme-/)
    assert.match(html, /typography-professional_sans/)
    assert.match(html, /--brand-primary:/)
    assert.match(html, /--brand-evidence-accent:/)
  }
  assert.match(exportFixtureHtml(api, legacy), /header-classic_letterhead/)
  assert.match(exportFixtureHtml(api, legacy), /report-cover item branded-cover/)
  assert.match(exportFixtureHtml(api, custom), /report-watermark watermark-diagonal watermark-standard/)
})

test('cover, footer, watermark, signature, and appendix toggles control rendered output', async () => {
  const api = await loadReportStudioRendering()
  const professional = makeBrand(api, { report_style: { coverPage: 'professional_cover', showCoverImage: true, coverImageSource: 'first_evidence_image', watermark: { option: 'draft', opacity: 'strong' } } })
  const noCover = makeBrand(api, { report_style: { coverPage: 'none', evidenceAppendix: false }, show_signature_block: false, show_report_id: false, show_contact_info: false })

  const professionalHtml = exportFixtureHtml(api, professional, { logoUrl: 'https://cdn.example.test/logo.png' })
  assert.match(professionalHtml, /brand-report-logo/)
  assert.match(professionalHtml, /report-watermark watermark-diagonal watermark-strong/)
  assert.match(professionalHtml, /approval-section/)
  assert.match(professionalHtml, /Evidence Appendix/)
  assert.match(professionalHtml, /CRED-2026-001/)

  const disabledHtml = exportFixtureHtml(api, noCover)
  assert.doesNotMatch(disabledHtml, /report-cover/)
  assert.doesNotMatch(disabledHtml, /Evidence Appendix/)
  assert.doesNotMatch(disabledHtml, /approval-section/)
  assert.doesNotMatch(disabledHtml, /CRED-2026-001/)
  assert.doesNotMatch(disabledHtml, /555-0100/)
})

test('evidence metadata toggles, evidence IDs, and image fallbacks render consistently', async () => {
  const api = await loadReportStudioRendering()
  const withMeta = makeBrand(api, { report_style: { evidenceIds: true, timestamps: true, captureMetadata: true } })
  const withoutMeta = makeBrand(api, { report_style: { evidenceIds: false, timestamps: false, captureMetadata: false } })

  const richHtml = exportFixtureHtml(api, withMeta)
  assert.match(richHtml, /<th>Evidence ID<\/th>/)
  assert.match(richHtml, /EV-001/)
  assert.match(richHtml, /<th>Captured<\/th>/)
  assert.match(richHtml, /<th>Type<\/th>/)
  assert.match(richHtml, /onerror="this\.style\.display='none';this\.nextElementSibling\.style\.display='flex';"/)
  assert.match(richHtml, /Image unavailable/)

  const leanHtml = exportFixtureHtml(api, withoutMeta)
  assert.doesNotMatch(leanHtml, /<th>Evidence ID<\/th>/)
  assert.doesNotMatch(leanHtml, /EV-001/)
  assert.doesNotMatch(leanHtml, /<th>Captured<\/th>/)
  assert.doesNotMatch(leanHtml, /<th>Type<\/th>/)
})

test('fixture exports omit unsupported controls and AI diagnosis or recommendation copy', async () => {
  const api = await loadReportStudioRendering()
  const html = exportFixtureHtml(api, makeBrand(api, { report_style: { coverPage: 'professional_cover' } }))
  assert.doesNotMatch(html, /selected_report_image|show_page_number|custom css|raw html|font upload|Template marketplace|Brand assets library/i)
  assert.doesNotMatch(html, /AI diagnosis|AI recommendation|AI-generated diagnosis|AI-generated recommendation/i)
  assert.doesNotMatch(html, /diagnostic procedure documentation|Diagnostic Procedure Workspace/i)
})
