import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'

const dataSource = readFileSync('src/features/evidence/timeline/data.ts', 'utf8')
const actionSource = readFileSync('src/features/evidence/timeline/actions.ts', 'utf8')
const validationSource = readFileSync('src/features/evidence/timeline/validation.ts', 'utf8')
const sessionPage = readFileSync('app/dashboard/sessions/[id]/page.tsx', 'utf8')
const timelinePage = readFileSync('app/dashboard/sessions/[id]/timeline/page.tsx', 'utf8')
const timelineComponent = readFileSync('src/features/evidence/components/TimelineWorkspace.tsx', 'utf8')

test('timeline route and session navigation are present', () => {
  assert.ok(existsSync('app/dashboard/sessions/[id]/timeline/page.tsx'))
  assert.match(timelinePage, /getTimelineData\(id\)/)
  assert.match(sessionPage, /\/timeline`}/)
  assert.match(sessionPage, /Timeline/)
})

test('timeline loader scopes session, events, evidence, and relationships to organization and session', () => {
  assert.match(dataSource, /from\('documentation_sessions'\)[\s\S]*\.eq\('id', sessionId\)[\s\S]*\.eq\('organization_id', profile\.organization_id\)[\s\S]*\.is\('deleted_at', null\)/)
  for (const table of ['timeline_events', 'capture_items', 'evidence_relationships']) {
    assert.match(dataSource, new RegExp(`from\\('${table}'\\)[\\s\\S]*\\.eq\\('documentation_session_id', sessionId\\)[\\s\\S]*\\.eq\\('organization_id', profile\\.organization_id\\)[\\s\\S]*\\.is\\('deleted_at', null\\)`))
  }
  assert.match(dataSource, /sortTimelineEvents/)
  assert.match(dataSource, /event_start_at \?\? event\.event_time \?\? event\.created_at/)
})

test('create and update timeline validation uses constants and defaults human-created events to accepted', () => {
  assert.match(validationSource, /EVENT_DATE_PRECISIONS\.includes/)
  assert.match(validationSource, /SUGGESTION_REVIEW_STATUSES\.includes/)
  assert.match(validationSource, /EVIDENCE_SOURCE_KINDS\.includes/)
  assert.match(actionSource, /parseTimelineEventForm\(formData\)/)
  assert.match(actionSource, /reviewStatus = values\.source_kind === 'system' \? values\.review_status : 'accepted'/)
  assert.match(actionSource, /event_type: 'manual'/)
})

test('evidence relationship actions validate same session and organization', () => {
  assert.match(validationSource, /assertSameWorkspace/)
  assert.match(validationSource, /documentation_session_id !== right\.documentation_session_id/)
  assert.match(validationSource, /organization_id !== right\.organization_id/)
  assert.match(actionSource, /loadTimelineEvent\(supabase, eventId, sessionId, profile\.organization_id\)/)
  assert.match(actionSource, /loadCaptureItem\(supabase, captureId, sessionId, profile\.organization_id\)/)
  assert.match(actionSource, /assertSameWorkspace\(event, capture\)/)
})

test('timeline links evidence through accepted user documents or supports relationships', () => {
  assert.match(validationSource, /\['documents', 'supports'\]\.includes/)
  assert.match(actionSource, /source_type: 'capture_item'/)
  assert.match(actionSource, /target_type: 'timeline_event'/)
  assert.match(actionSource, /suggestion_source: 'user'/)
  assert.match(actionSource, /review_status: 'accepted'/)
  assert.match(actionSource, /deleted_at: new Date\(\)\.toISOString\(\)/)
})

test('timeline UI displays event details and evidence linking controls', () => {
  for (const expected of ['title', 'description', 'event_date_precision', 'source_kind', 'review_status', 'Linked evidence', 'relationship_type', 'capture_item_id']) {
    assert.ok(timelineComponent.includes(expected), `missing ${expected}`)
  }
})
