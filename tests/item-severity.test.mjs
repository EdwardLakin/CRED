import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const severityModule = readFileSync('src/features/capture/item-severity.ts', 'utf8')
/** Same source with comments removed, for assertions about what the code does rather than what it documents. */
const severityCode = severityModule
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
const migration = readFileSync('supabase/migrations/20260910140000_capture_item_severity.sql', 'utf8')
const reportActions = readFileSync('src/features/reports/actions.ts', 'utf8')
const reviewComponents = readFileSync('src/features/reports/review/ReviewComponents.tsx', 'utf8')
const exportRoute = readFileSync('app/api/dashboard/sessions/[id]/report-pdf/route.ts', 'utf8')
const executivePdf = readFileSync('src/features/reports/export/executive-pdf.ts', 'utf8')

test('severity is a technician-set field with no inferred default', () => {
  // The whole point of this field is that a person assigns it. If it ever gains
  // a default, an unrated item starts asserting a severity nobody chose.
  assert.match(severityModule, /ITEM_SEVERITIES = \['low', 'medium', 'high', 'critical'\]/)
  assert.match(severityModule, /ItemSeverity \| null/)
  assert.doesNotMatch(severityModule, /DEFAULT_ITEM_SEVERITY/)
  assert.match(migration, /severity is null or severity in \('low', 'medium', 'high', 'critical'\)/)
  // Nullable, no default: an unrated item stays unrated.
  assert.doesNotMatch(migration, /add column if not exists severity text[^;]*default/i)
})

test('severity is never derived from the text-inference helper', () => {
  // normalizeReportSeverity() pattern-matches prose (its patterns include brake
  // pads and wear limits) and is for internal grouping only. It must not be the
  // source of anything printed against a customer-facing item.
  // Asserted against comment-stripped source: the module's own doc comment names
  // the inference helper in order to explain why it is deliberately not used.
  assert.doesNotMatch(severityCode, /normalizeReportSeverity/)
  assert.match(exportRoute, /severity: getItemSeverityLabel\(capture\.severity\)/)
  assert.doesNotMatch(exportRoute, /severity: normalizeReportSeverity/)
})

test('the review editor offers severity and the save path persists it', () => {
  assert.match(reviewComponents, /name=\{`capture_severity_\$\{item\.capture\.id\}`\}/)
  // "Not rated" has to remain selectable, otherwise the field cannot be cleared.
  assert.match(reviewComponents, /Not rated/)
  assert.match(reportActions, /normalizeItemSeverity\(getString\(formData, `capture_severity_\$\{capture\.id\}`\)\)/)
  assert.match(reportActions, /evidence_category: evidenceCategory, severity,/)
})

test('both exports print severity only when one was set', () => {
  // PDF: guarded on item.severity being present.
  assert.match(executivePdf, /item\.severity \? `\$\{item\.severity\} severity` : null/)
  // HTML: guarded on the label resolving.
  assert.match(exportRoute, /getItemSeverityLabel\(entry\.capture\.severity\) \? /)
})
