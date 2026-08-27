import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const toolbar = readFileSync('src/features/report-studio-v2/ReportStudioToolbar.tsx', 'utf8')
const mobile = readFileSync('src/features/report-studio-v2/ReportStudioMobileLite.tsx', 'utf8')
const drawer = readFileSync('src/features/report-studio-v2/ReportTemplateDrawer.tsx', 'utf8')
const controls = readFileSync('src/features/report-studio-v2/ReportControlPanel.tsx', 'utf8')
const fields = readFileSync('src/features/report-studio-v2/formFields.tsx', 'utf8')
const actions = readFileSync('src/features/branding/actions.ts', 'utf8')
const pdf = readFileSync('app/api/dashboard/sessions/[id]/report-pdf/route.ts', 'utf8')
const previewEvidence = readFileSync('src/features/report-studio-v2/preview/PreviewEvidence.tsx', 'utf8')

test('Report Studio v2 button and action map is explicit and uses isolated forms', () => {
  for (const action of ['back', 'templates', 'apply-system-template', 'apply-saved-template', 'save-template', 'save-report-studio', 'apply-export', 'session-selector', 'template-selector', 'right-panel-controls']) {
    assert.match(toolbar, new RegExp(action))
  }
  assert.match(toolbar, /id="report-studio-save-template-form" action=\{saveReportTemplate\}/)
  assert.match(toolbar, /id="report-studio-save-form" action=\{saveBrandingSettings\}/)
  assert.match(toolbar, /id="report-studio-export-form" action=\{saveBrandingAndExport\}/)
  assert.match(toolbar, /type="button" onClick=\{onTemplates\}/)
  assert.match(drawer, /type="button"[^>]+onClick=\{onClose\}/)
  assert.match(drawer, /System Templates[\s\S]*type="button"[\s\S]*onApply\(normalizeBrandProfile/)
  assert.match(drawer, /Saved Custom Templates[\s\S]*type="button"[\s\S]*onApply\(t,t\.id\)/)
  assert.match(controls, /<button type="button"/)
})

test('Save Template and Save Report Studio post current draftBrandProfile fields', () => {
  assert.match(toolbar, /ReportStudioHiddenFields brand=\{state\.draftBrandProfile\} selectedSessionId=\{state\.selectedSessionId\}/)
  assert.match(mobile, /ReportStudioHiddenFields brand=\{b\} selectedSessionId=\{props\.state\.selectedSessionId\}/)
  assert.match(fields, /name="selected_session_output_id"/)
  assert.match(actions, /const brand=normalizeBrandProfile\(await buildBrandingSettingsPayload\(formData,profile,\{logo:s\(formData,'current_logo'\)/)
  assert.match(actions, /async function persistBrandingSettings/)
  assert.match(actions, /export async function saveBrandingSettings/)
})

test('Apply & Export saves draft first, uses selected session, and falls back to working report-pdf params', () => {
  for (const source of [toolbar, mobile, actions]) {
    assert.match(source, /selected_session_output_id/)
    assert.match(source, /studio_export=1/)
    assert.match(source, /template=workspace-default/)
  }
  assert.match(pdf, /selected_session_output_id/)
  assert.match(pdf, /searchParams\.get\("studio_export"\)/)
  assert.match(pdf, /searchParams\.set\("studio_export", "1"\)/)
  assert.match(actions, /export async function saveBrandingAndExport/)
  assert.match(actions, /await persistBrandingSettings\(formData\)/)
  assert.match(actions, /redirect\(`\/api\/dashboard\/sessions\/\$\{id\}\/report-pdf\?review_output=\$\{id\}&selected_session_output_id=\$\{id\}&template=workspace-default&studio_export=1`\)/)
  assert.match(pdf, /selectedSessionOutputId[\s\S]*resolvedSessionId && resolvedSessionId !== id[\s\S]*redirectToCanonicalStudioExport/)
  const workspaceDefaultFallback = pdf.slice(
    pdf.indexOf('if (\n    !exportBranding'),
    pdf.indexOf('const branding = normalizeBrandProfile'),
  )
  assert.match(workspaceDefaultFallback, /requestedTemplateId !== "system"/)
  assert.doesNotMatch(workspaceDefaultFallback, /requestedTemplateId !== "workspace-default"/)
})

test('customer-visible v2 preview/export paths do not expose ai_summary', () => {
  assert.doesNotMatch(previewEvidence, /ai_summary/)
  assert.match(pdf, /getUserEvidenceText\(capture\)/)
  assert.doesNotMatch(pdf.slice(pdf.indexOf('function getPrimaryEvidenceLabel'), pdf.indexOf('function looksLikeRawUploadFilename')), /ai_summary/)
})

test('Report Studio v2 saves fail inline without clearing draft state or redirecting early', () => {
  assert.match(toolbar, /useActionState\(saveBrandingSettings(?: as BrandingFormAction)?, initialActionState\)/)
  assert.match(toolbar, /useActionState\(saveBrandingAndExport(?: as BrandingFormAction)?, initialActionState\)/)
  assert.match(toolbar, /rsv2-inline-error/) 
  assert.match(toolbar, /role="alert"/) 
  assert.match(toolbar, /if \(saveState\.ok\) handlers\.setIsDirty\(false\)/)
  assert.doesNotMatch(toolbar, /setDraftBrandProfile\(props\.profile|window\.location\.assign\(exportHref/) 
  assert.match(toolbar, /if \(exportState\.ok && exportState\.redirectTo\) window\.open\(exportState\.redirectTo, "_blank", "noopener,noreferrer"\)/)
})

test('Save Template does not upsert workspace_brand_profiles before template insert', () => {
  const saveTemplateBody = actions.slice(actions.indexOf('export async function saveReportTemplate'), actions.indexOf('export async function deleteReportTemplate'))
  assert.doesNotMatch(saveTemplateBody, /from\('workspace_brand_profiles'\)/)
  assert.match(saveTemplateBody, /from\('workspace_report_templates'\)/)
  assert.match(saveTemplateBody, /buildBrandingSettingsPayload/) 
})

test('workspace_brand_profiles failures log and surface useful Supabase errors', () => {
  assert.match(actions, /logSupabaseSaveError/) 
  assert.match(actions, /console\.error\('\[workspace_brand_profiles save failed\]'/) 
  for (const field of ['message','code','details','hint','status','payloadColumns']) assert.match(actions, new RegExp(field))
  assert.match(actions, /return \{ok:false,error\}/)
})
