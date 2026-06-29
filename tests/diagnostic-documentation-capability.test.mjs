import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const constants = readFileSync('src/features/evidence/constants.ts', 'utf8')
const timelineValidation = readFileSync('src/features/evidence/timeline/validation.ts', 'utf8')
const timelineActions = readFileSync('src/features/evidence/timeline/actions.ts', 'utf8')
const timelineUi = readFileSync('src/features/evidence/components/TimelineWorkspace.tsx', 'utf8')
const reportActions = readFileSync('src/features/reports/actions.ts', 'utf8')
const reportStructure = readFileSync('src/features/reports/report-structure.ts', 'utf8')

const diagnosticDocumentationEventTypes = [
  'read_codes',
  'freeze_frame',
  'live_data',
  'functional_test',
  'measurement',
  'repair_performed',
  'verification',
  'road_test',
  'forced_regen',
  'reference_document',
  'technician_observation',
]

const genericReportSections = [
  'Customer Concern',
  'Vehicle / Asset Information',
  'DTCs / Fault Codes',
  'Freeze Frame Data',
  'Live Data / Measurements',
  'Functional Tests',
  'Repairs Performed',
  'Verification / Retest Results',
  'Road Test Results',
  'Technician Observations',
  'Reference Documents Reviewed',
  'Diagnostic Summary',
  'Recommended Next Step / Escalation',
  'Evidence Appendix',
]

test('diagnostic documentation workflow has generic technician-selected event types', () => {
  for (const eventType of diagnosticDocumentationEventTypes) {
    assert.ok(constants.includes(`'${eventType}'`), `missing ${eventType}`)
  }
  assert.doesNotMatch(constants, /Ford|Transit|diesel/i)
  assert.doesNotMatch(constants, /ai_suggestion|AI suggestion/)
  assert.match(timelineValidation, /parseDiagnosticEventType/)
  assert.match(timelineValidation, /DIAGNOSTIC_EVENT_TYPES\.includes/)
  assert.match(timelineActions, /event_type: values\.event_type/)
  assert.match(timelineUi, /name="event_type"/)
  assert.match(timelineUi, /formatDiagnosticEventType\(event\.event_type\)/)
})

test('service diagnostic report export uses generic evidence sections', () => {
  for (const sectionTitle of genericReportSections) {
    assert.ok(reportStructure.includes(`'${sectionTitle}'`), `missing ${sectionTitle}`)
  }
  assert.doesNotMatch(reportStructure, /Initial Inspection|Retrieved DTCs|Live Data Analysis|Post Repair Verification|Forced Regeneration Results|Workshop Information Reviewed|'Recommended Next Step'/)
})

test('diagnostic report assembly preserves chronology and avoids generated diagnosis content', () => {
  assert.match(reportActions, /GENERIC_REPORT_SECTION_TITLES\.map\(\(title, index\)/)
  assert.match(reportActions, /sort_order: index/)
  assert.match(reportActions, /title === 'Diagnostic Summary' \? 'No technician diagnostic summary entered\.'/)
  assert.doesNotMatch(reportActions, /root[- ]cause ranking|likely cause|suggested cause|diagnostic recommendation|recommended fix|diagnosis engine/i)
})
