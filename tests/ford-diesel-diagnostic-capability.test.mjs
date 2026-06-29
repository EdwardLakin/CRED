import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const constants = readFileSync('src/features/evidence/constants.ts', 'utf8')
const timelineValidation = readFileSync('src/features/evidence/timeline/validation.ts', 'utf8')
const timelineActions = readFileSync('src/features/evidence/timeline/actions.ts', 'utf8')
const timelineUi = readFileSync('src/features/evidence/components/TimelineWorkspace.tsx', 'utf8')
const reportStructure = readFileSync('src/features/reports/report-structure.ts', 'utf8')

const fordDiagnosticEventTypes = [
  'read_codes',
  'freeze_frame',
  'live_data',
  'functional_test',
  'repair',
  'verification',
  'road_test',
  'forced_regen',
  'measurement',
  'reference_document',
]

const fordReportSections = [
  'Customer Concern',
  'Initial Inspection',
  'Retrieved DTCs',
  'Freeze Frame',
  'Live Data Analysis',
  'Functional Testing',
  'Repairs Performed',
  'Post Repair Verification',
  'Forced Regeneration Results',
  'Technician Observations',
  'Workshop Information Reviewed',
  'Diagnostic Summary',
  'Recommended Next Step',
  'Evidence Appendix',
]

test('Ford diesel diagnostic session has first-class diagnostic event types', () => {
  for (const eventType of fordDiagnosticEventTypes) {
    assert.ok(constants.includes(`'${eventType}'`), `missing ${eventType}`)
  }
  assert.match(timelineValidation, /parseDiagnosticEventType/)
  assert.match(timelineValidation, /DIAGNOSTIC_EVENT_TYPES\.includes/)
  assert.match(timelineActions, /event_type: values\.event_type/)
  assert.match(timelineUi, /name="event_type"/)
  assert.match(timelineUi, /formatDiagnosticEventType\(event\.event_type\)/)
})

test('generic diagnostic report export follows dealership chronology sections', () => {
  for (const sectionTitle of fordReportSections) {
    assert.ok(reportStructure.includes(`'${sectionTitle}'`), `missing ${sectionTitle}`)
  }
})
