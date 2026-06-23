import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const inclusion = readFileSync('src/features/reports/capture-inclusion.ts', 'utf8')
const reportPage = readFileSync('app/dashboard/sessions/[id]/report/page.tsx', 'utf8')
const review = readFileSync('src/features/reports/review/ReviewComponents.tsx', 'utf8')
const deliverables = readFileSync('src/features/evidence/deliverables/service.ts', 'utf8')
const sessionDisplay = readFileSync('src/features/sessions/display.ts', 'utf8')
const titleData = readFileSync('src/features/sessions/report-title-data.ts', 'utf8')
const dashboard = readFileSync('app/dashboard/page.tsx', 'utf8')
const sessions = readFileSync('app/dashboard/sessions/page.tsx', 'utf8')
const archived = readFileSync('app/dashboard/settings/archived-sessions/page.tsx', 'utf8')

test('canonical capture inclusion includes technician evidence without mass review', () => {
  assert.match(inclusion, /include_in_report === false\) return false/)
  assert.match(inclusion, /reviewStatus === 'rejected'\) return false/)
  assert.match(inclusion, /capture\.deleted_at != null\) return false/)
  assert.match(inclusion, /hidden_from_report === true/)
  assert.match(inclusion, /internal_only === true/)
  assert.match(inclusion, /isAiDerivedCapture\(capture\) && !isReviewedForOutput/)
  assert.match(inclusion, /status === 'accepted' \|\| status === 'edited'/)
  assert.doesNotMatch(inclusion, /unreviewed.*accepted|accepted.*unreviewed/)
})

test('report, print model, and deliverables use the same inclusion helper', () => {
  assert.match(reportPage, /allCaptures\.filter\(isCaptureIncludedInOutput\)/)
  assert.match(reportPage, /buildUniversalReportDocument\(\{[\s\S]*captures: visibleCaptures/)
  assert.match(reportPage, /createSignedUrl[\s\S]*visibleCaptures\.map/)
  assert.match(deliverables, /isCaptureIncludedInOutput\(item\)/)
  assert.doesNotMatch(deliverables, /\['reviewed', 'needs_followup'\]\.includes\(item\.evidence_review_status\)/)
})

test('review UI is non-blocking and treats legacy null inclusion as checked', () => {
  assert.match(review, /includedReviewSummary\.included} included · \{includedReviewSummary\.reviewed} reviewed · \{includedReviewSummary\.unreviewed} not individually reviewed/)
  assert.match(review, /defaultChecked=\{item\.capture\.include_in_report !== false\}/)
  assert.match(review, /isCaptureIncludedInOutput\(item\.capture\)/)
})

test('session cards prefer active report titles without N+1 queries', () => {
  assert.match(sessionDisplay, /getDisplayReportTitle\(currentReport, session\)/)
  assert.match(titleData, /in\('documentation_session_id', sessionIds\)/)
  assert.match(titleData, /eq\('organization_id', organizationId\)/)
  assert.match(titleData, /getCurrentReportDraftBySession/)
  for (const source of [dashboard, sessions, archived]) {
    assert.match(source, /loadCurrentReportDraftsBySession\(supabase, profile\.organization_id, sessionIds\)/)
    assert.match(source, /currentReport=\{reportDraftBySession\.get\(session\.id\)\}/)
  }
})
