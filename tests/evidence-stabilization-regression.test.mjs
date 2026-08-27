import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const reportPage = readFileSync('app/dashboard/sessions/[id]/report/page.tsx', 'utf8')
const structure = readFileSync('src/features/reports/report-structure.ts', 'utf8')
const actions = readFileSync('src/features/evidence/library/actions.ts', 'utf8')
const forms = readFileSync('src/features/evidence/components/EvidenceForms.tsx', 'utf8')
const nav = readFileSync('src/features/evidence/components/EvidenceWorkspaceNav.tsx', 'utf8')
const css = readFileSync('app/globals.css', 'utf8')
const entitiesPage = readFileSync('app/dashboard/sessions/[id]/entities/page.tsx', 'utf8')
const assertionsPage = readFileSync('app/dashboard/sessions/[id]/assertions/page.tsx', 'utf8')

test('report tracks rendered captures and never suppresses included evidence only because it is referenced', () => {
  assert.match(reportPage, /allCaptures\.filter\(isCaptureIncludedInOutput\)/)
  assert.match(reportPage, /const renderedCaptureIds = new Set\(reviewDocument\.renderedCaptureIds\)/)
  assert.match(reportPage, /missingIncludedCaptures/)
  assert.match(reportPage, /\[report-evidence\]/)
  assert.doesNotMatch(reportPage, /!formSourceCaptureIds\.has\(item\.capture\.id\)/)
  assert.doesNotMatch(structure, /if \(formSourceIds\.has\(capture\.id\)\)/)
})

test('form source detection stays limited to source form IDs', () => {
  const fn = structure.slice(structure.indexOf('export function getFormSourceCaptureIds'), structure.indexOf('export function getCaptureGuidance'))
  assert.match(fn, /source_capture_id/)
  assert.match(fn, /form_capture_ids/)
  assert.doesNotMatch(fn, /evidence_field_mappings/)
  assert.doesNotMatch(fn, /selectedCaptureItemIds/)
  assert.doesNotMatch(fn, /supporting/i)
})

test('evidence mutations return typed safe results and client forms render inline state', () => {
  assert.match(actions, /export type EvidenceMutationResult/)
  assert.match(actions, /Review status saved\./)
  assert.match(actions, /Output preference saved\./)
  assert.match(actions, /This item could not be updated\. Refresh and try again\./)
  assert.match(forms, /useActionState/)
  assert.match(forms, /pending \? 'Saving…'/)
  assert.match(forms, /router\.refresh\(\)/)
})

test('workspace navigation is compact, active, and positioned before workspace content on moved pages', () => {
  assert.match(nav, /EvidenceWorkspaceNavBar/)
  assert.doesNotMatch(nav, /className="form-actions"/)
  assert.match(nav, /aria-current=\{card\.current === current \? 'page'/)
  assert.ok(entitiesPage.indexOf('EvidenceWorkspaceBacklinks') < entitiesPage.indexOf('EntitiesWorkspace'))
  assert.ok(assertionsPage.indexOf('EvidenceWorkspaceBacklinks') < assertionsPage.indexOf('AssertionsWorkspace'))
})

test('mobile workspace CSS uses dedicated one-column cards and scrollable nav chips', () => {
  assert.match(css, /\.workspace-card-grid[\s\S]*grid-template-columns: 1fr/)
  assert.match(css, /\.workspace-destination-card/)
  assert.match(css, /\.evidence-workspace-nav-scroll[\s\S]*overflow-x: auto/)
  assert.match(css, /\.evidence-workspace-nav-link\.active/)
  assert.match(css, /min-height: 46px/)
})
