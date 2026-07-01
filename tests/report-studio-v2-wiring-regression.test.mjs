import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const files = Object.fromEntries([
  'toolbar','route','drawer','fields','document','cover','header','client','evidence','footer','signature','mobile','actions','css','page','pdf'
].map((name) => [name, readFileSync({toolbar:'src/features/report-studio-v2/ReportStudioToolbar.tsx',route:'src/features/report-studio-v2/ReportStudioRoute.tsx',drawer:'src/features/report-studio-v2/ReportTemplateDrawer.tsx',fields:'src/features/report-studio-v2/formFields.tsx',document:'src/features/report-studio-v2/preview/PreviewDocument.tsx',cover:'src/features/report-studio-v2/preview/PreviewCover.tsx',header:'src/features/report-studio-v2/preview/PreviewHeader.tsx',client:'src/features/report-studio-v2/preview/PreviewClientAsset.tsx',evidence:'src/features/report-studio-v2/preview/PreviewEvidence.tsx',footer:'src/features/report-studio-v2/preview/PreviewFooter.tsx',signature:'src/features/report-studio-v2/preview/PreviewSignature.tsx',mobile:'src/features/report-studio-v2/ReportStudioMobileLite.tsx',actions:'src/features/branding/actions.ts',css:'app/globals.css',page:'app/dashboard/settings/branding/page.tsx',pdf:'app/api/dashboard/sessions/[id]/report-pdf/route.ts'}[name], 'utf8')]))

test('Report Studio v2 controls write draft, preview classes/styles, and save fields', () => {
  for (const token of ['coverPage','showCoverLogo','showCoverReportId','showCoverDate','header_layout','headerBackground','gradientPreset','headerText','primary','headingWeight','sectionStyle','sectionSpacing','showSectionLabels','showSectionDividers','showSectionNumbers','evidenceStyle','evidenceImageSize','evidenceNumbering','timestamps','captureMetadata','notes','footer_text','footer_layout','show_page_date','show_report_id','show_signature_block','signatureLayout','typedSignature','signatureDate']) {
    assert.match(`${files.cover}${files.header}${files.client}${files.evidence}${files.footer}${files.signature}${files.mobile}${files.document}`, new RegExp(token))
  }
  assert.match(files.fields, /Object\.entries\(brand\.colors\).*color_\$\{k\}/s)
  for (const field of ['cover_page','showCoverLogo','showCoverReportId','showCoverDate','header_layout','header_gradient_preset','typography_headingWeight','section_style','section_spacing','showSectionLabels','showSectionDividers','showSectionNumbers','evidence_style','evidence_image_size','evidence_numbering','timestamps','capture_metadata','evidence_notes','footer_text','footer_layout','show_page_date','show_report_id','show_signature_block','signature_layout','typed_signature','signature_date']) {
    assert.match(files.fields, new RegExp(field))
  }
  for (const marker of ['cover-${rs.coverPage}','header-layout-${brand.header_layout}','client-style-${rs.sectionStyle}','client-spacing-${rs.sectionSpacing}','evidence-size-${rs.evidenceImageSize}','evidence-style-${rs.evidenceStyle}','footer-layout-${brand.footer_layout}','signature-${rs.signatureLayout}','--rsv2-header-bg','--rsv2-heading-weight','--rsv2-section-spacing']) {
    assert.ok(`${files.document}${files.cover}${files.header}${files.client}${files.evidence}${files.footer}${files.signature}`.includes(marker), marker)
  }
})

test('template apply and export use current v2 state intent', () => {
  assert.match(files.drawer, /onApply\(normalizeBrandProfile/) 
  assert.match(files.drawer, /onApply\(t,t\.id\)/)
  assert.match(files.route, /setDraftBrandProfile\(normalizeBrandProfile\(next\)\)/)
  assert.match(files.route, /setSelectedTemplateId\(id\)/)
  assert.match(files.toolbar, /selected_session_output_id=.*studio_export=1/)
  assert.match(files.toolbar, /ReportStudioHiddenFields brand=\{state\.draftBrandProfile\}/)
  assert.match(files.toolbar, /action=\{saveReportTemplate\}/)
  assert.match(files.toolbar, /action=\{saveBrandingSettings\}/)
})

test('ai_summary and selected_report_image stay out of customer visible v2 paths', () => {
  assert.doesNotMatch(`${files.page}${files.pdf}${files.evidence}${files.actions}${files.fields}`, /selected_report_image/)
  assert.doesNotMatch(files.page, /ai_summary/)
  assert.doesNotMatch(files.evidence, /ai_summary/)
  assert.match(files.pdf, /getUserEvidenceText\(capture\)/)
  assert.doesNotMatch(files.pdf.slice(files.pdf.indexOf('function getPrimaryEvidenceLabel'), files.pdf.indexOf('function looksLikeRawUploadFilename')), /ai_summary/)
})

test('layout shell uses independent preview and control scrolling with mobile split', () => {
  assert.match(files.css, /\.rsv2-shell\{height:100dvh;width:100%;overflow:hidden/)
  assert.match(files.css, /\.rsv2-preview-canvas\{[^}]*overflow:auto/)
  assert.match(files.css, /\.rsv2-controls\{[^}]*overflow:auto/)
  assert.match(files.route, /if \(isPhone\) return <ReportStudioMobileLite/)
  assert.match(files.route, /return <ReportStudioDesktop/)
  assert.doesNotMatch(files.page, /dashboard-shell|report-studio-sidebar/)
})
