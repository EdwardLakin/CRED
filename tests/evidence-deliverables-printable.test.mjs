import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const detailRoute = readFileSync('app/dashboard/sessions/[id]/deliverables/[deliverableId]/page.tsx', 'utf8')
const printRoute = readFileSync('app/dashboard/sessions/[id]/deliverables/[deliverableId]/print/page.tsx', 'utf8')
const data = readFileSync('src/features/evidence/deliverables/data.ts', 'utf8')
const workspace = readFileSync('src/features/evidence/deliverables/components/DeliverablesWorkspace.tsx', 'utf8')
const detail = readFileSync('src/features/evidence/deliverables/components/DeliverableDetail.tsx', 'utf8')
const print = readFileSync('src/features/evidence/deliverables/components/DeliverablePrintView.tsx', 'utf8')
const printableChronology = readFileSync('src/features/evidence/deliverables/components/PrintableChronology.tsx', 'utf8')
const printableEvidenceIndex = readFileSync('src/features/evidence/deliverables/components/PrintableEvidenceIndex.tsx', 'utf8')
const printableObservationSummary = readFileSync('src/features/evidence/deliverables/components/PrintableObservationSummary.tsx', 'utf8')

test('deliverable detail and print routes are present', () => {
  assert.match(detailRoute, /getDeliverableDetail\(id, deliverableId\)/)
  assert.match(detailRoute, /DeliverableDetail/)
  assert.match(printRoute, /getDeliverableDetail\(id, deliverableId\)/)
  assert.match(printRoute, /DeliverablePrintView/)
})

test('deliverable access is scoped to organization and session and hides deleted deliverables', () => {
  assert.match(data, /validateDeliverableAccess/)
  assert.match(data, /if \(!canUseFeature\(profile, 'deliverables'\)\) notFound\(\)/)
  assert.match(data, /from\('documentation_sessions'\).*eq\('id', sessionId\).*eq\('organization_id', profile\.organization_id\).*is\('deleted_at', null\)/s)
  assert.match(data, /from\('evidence_deliverables'\).*eq\('id', deliverableId\).*eq\('documentation_session_id', sessionId\).*eq\('organization_id', profile\.organization_id\).*is\('deleted_at', null\)/s)
})

test('deliverables workspace links to detail and print views', () => {
  assert.match(workspace, /deliverables\/\$\{deliverable\.id\}/)
  assert.match(workspace, /deliverables\/\$\{deliverable\.id\}\/print/)
  assert.match(detail, /Deliverables workspace/)
  assert.match(detail, /Print \/ export/)
})

test('printable phase one deliverable renderers are present', () => {
  assert.match(printableChronology, /PrintableChronology/)
  assert.match(printableChronology, /linked_factual_observations/)
  assert.match(printableChronology, /print-table/)
  assert.match(printableEvidenceIndex, /PrintableEvidenceIndex/)
  assert.match(printableEvidenceIndex, /include_in_outputs/)
  assert.match(printableObservationSummary, /PrintableObservationSummary/)
  assert.match(printableObservationSummary, /supporting_evidence_count/)
})

test('print view has print-friendly CSS and no app navigation content', () => {
  assert.match(print, /@media print/)
  assert.match(print, /dashboard-frame > nav/) 
  assert.match(print, /Source \/ provenance note/)
  assert.doesNotMatch(print, /DashboardNavigation/)
  assert.doesNotMatch(print, /raw storage path/i)
  assert.doesNotMatch(print, /signed evidence URL/i)
})
