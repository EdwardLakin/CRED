import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistant = readFileSync('src/lib/openai/report-summary-assistant.ts', 'utf8')

test('summary assistant prompt is evidence-only and forbids unsupported action language', () => {
  assert.match(assistant, /Summarize documented observations only/)
  assert.match(assistant, /Do not add recommendations, repair instructions, replacement instructions, remediation language, severity, urgency, hazard, liability language/)
  assert.match(assistant, /Do not use words such as recommend, recommended, repair, replacement, remediate, remediation, required, requires, severe, severity, urgent, hazard, or liability unless those words already appear/)
})

test('summary assistant post-check removes unsupported action terms and falls back deterministically', () => {
  assert.match(assistant, /UNSUPPORTED_ACTION_TERMS = \[/)
  assert.match(assistant, /function getUnsupportedActionTerms/)
  assert.match(assistant, /function removeUnsupportedActionLanguage/)
  assert.match(assistant, /deterministicEvidenceOnlySummary/)
  assert.match(assistant, /fallbackSummary \|\|/g)
})

test('improve writing preserves unsupported action language guard against current text', () => {
  assert.match(assistant, /may appear only when already present in the current summary/)
  assert.match(assistant, /removeUnsupportedActionLanguage\(improved, currentSummary\)/)
  assert.match(assistant, /return cleaned \|\| currentSummary/)
})
