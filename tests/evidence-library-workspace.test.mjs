import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const dataSource = readFileSync('src/features/evidence/library/data.ts', 'utf8')
const actionSource = readFileSync('src/features/evidence/library/actions.ts', 'utf8')
const validationSource = readFileSync('src/features/evidence/library/validation.ts', 'utf8')
const sessionPage = readFileSync('app/dashboard/sessions/[id]/page.tsx', 'utf8')
const libraryPage = readFileSync('app/dashboard/sessions/[id]/evidence/page.tsx', 'utf8')
const detailPage = readFileSync('app/dashboard/sessions/[id]/evidence/[captureId]/page.tsx', 'utf8')
const listComponent = readFileSync('src/features/evidence/components/EvidenceLibraryList.tsx', 'utf8')
const detailComponent = readFileSync('src/features/evidence/components/EvidenceDetail.tsx', 'utf8')
const formsComponent = readFileSync('src/features/evidence/components/EvidenceForms.tsx', 'utf8')

test('evidence data loader scopes session and capture items to organization and excludes deleted rows', () => {
  assert.match(dataSource, /from\('documentation_sessions'\)[\s\S]*\.eq\('id', sessionId\)[\s\S]*\.eq\('organization_id', profile\.organization_id\)[\s\S]*\.is\('deleted_at', null\)/)
  assert.match(dataSource, /from\('capture_items'\)[\s\S]*\.eq\('documentation_session_id', sessionId\)[\s\S]*\.eq\('organization_id', profile\.organization_id\)[\s\S]*\.is\('deleted_at', null\)/)
  assert.match(dataSource, /from\('evidence_import_batches'\)[\s\S]*\.eq\('documentation_session_id', sessionId\)[\s\S]*\.eq\('organization_id', profile\.organization_id\)[\s\S]*\.is\('deleted_at', null\)/)
})

test('review status action validates against evidence review statuses before update', () => {
  assert.match(validationSource, /EVIDENCE_REVIEW_STATUSES\.includes/)
  assert.match(actionSource, /if \(!status\) return \{ ok: false, message: EVIDENCE_MUTATION_ERROR \}/)
  assert.match(actionSource, /evidence_review_status: status/)
  assert.match(actionSource, /Review status saved\./)
})

test('include and exclude action preserves include_in_report behavior', () => {
  assert.match(actionSource, /updateEvidenceOutputInclusion/)
  assert.match(actionSource, /include_in_report: submitted\.get\('include_in_report'\) === 'on'/)
  assert.match(actionSource, /Output preference saved\./)
  assert.doesNotMatch(actionSource, /evidence_review_status: 'excluded'/)
})

test('source date action validates event date precision and normalizes date values', () => {
  assert.match(validationSource, /EVENT_DATE_PRECISIONS\.includes/)
  assert.match(actionSource, /throw new Error\('Invalid event date precision'\)/)
  assert.match(actionSource, /normalizeOptionalIsoDateTime\(formData\.get\('event_date'\)\)/)
  assert.match(actionSource, /source_created_at: normalizeOptionalIsoDateTime/)
})

test('evidence routes and session navigation are present without changing capture or report routes', () => {
  assert.match(libraryPage, /Evidence Library/)
  assert.match(detailPage, /Evidence Details/)
  assert.match(sessionPage, /feature\.hrefSegment/)
  assert.match(sessionPage, /feature\.label/)
})

test('library and details display requested evidence fields and import batch status', () => {
  for (const expected of ['original_filename', 'source_kind', 'processing_status', 'ai_status', 'captured_at', 'event_date', 'source_created_at', 'evidence_review_status', 'include_in_report', 'duplicate_status', 'import_batch_id']) {
    assert.ok(listComponent.includes(expected) || detailComponent.includes(expected) || formsComponent.includes(expected), `missing ${expected}`)
  }
})
