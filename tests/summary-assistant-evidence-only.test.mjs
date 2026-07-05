import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistant = readFileSync('src/lib/openai/report-summary-assistant.ts', 'utf8')

test('summary assistant prompt uses a compact plan instead of raw observation JSON', () => {
  assert.match(assistant, /function buildSummaryPlan/)
  assert.match(assistant, /Summary plan JSON \(primary input\)/)
  assert.match(assistant, /Supporting evidence digest JSON \(broad categories only; do not extract additional component names\)/)
  assert.match(assistant, /Do not expand the plan into an observation list/)
  assert.doesNotMatch(assistant, /Included capture items JSON:/)
  assert.doesNotMatch(assistant, /Grouped observation data JSON:/)
})

test('summary assistant prompt is executive-level and forbids unsupported action language', () => {
  assert.match(assistant, /opening paragraph of a professional property inspection/)
  assert.match(assistant, /not to summarize every observation or create a compressed observation list/)
  assert.match(assistant, /90–130 words/)
  assert.match(assistant, /Do not add recommendations, repair instructions, replacement instructions, remediation language, severity, urgency, hazard, liability language/)
  assert.match(assistant, /Never invent observations/)
  assert.match(assistant, /Never speculate/)
  assert.match(assistant, /Do not use words such as recommend, recommended, repair, replacement, remediate, remediation, required, requires, severe, severity, urgent, hazard, or liability unless those words already appear/)
})

test('over-specific regenerated summaries are rejected for larger reports', () => {
  assert.match(assistant, /INDIVIDUAL_DETAIL_TERMS = \[/)
  assert.match(assistant, /"fireplace"/)
  assert.match(assistant, /"stove"/)
  assert.match(assistant, /"humidifier"/)
  assert.match(assistant, /"linoleum"/)
  assert.match(assistant, /"carpet"/)
  assert.match(assistant, /function isOverSpecificExecutiveSummary/)
  assert.match(assistant, /observationCount <= 4/)
  assert.match(assistant, /countIndividualDetailTerms\(summary\) > 3/)
  assert.match(assistant, /enforceExecutiveSpecificity\(cleaned, summaryPlan, fallbackSummary\)/)
})

test('deterministic fallback produces theme-based executive summaries', () => {
  assert.match(assistant, /function deterministicSummaryFromPlan/)
  assert.match(assistant, /The documented findings primarily relate to/)
  assert.match(assistant, /flooring deterioration/)
  assert.match(assistant, /moisture-related damage/)
  assert.match(assistant, /aging interior finishes/)
  assert.match(assistant, /Detailed observations and supporting evidence are presented in the sections that follow/)
})

test('summary assistant post-check removes unsupported action terms and falls back deterministically', () => {
  assert.match(assistant, /UNSUPPORTED_ACTION_TERMS = \[/)
  assert.match(assistant, /function getUnsupportedActionTerms/)
  assert.match(assistant, /function removeUnsupportedActionLanguage/)
  assert.match(assistant, /deterministicEvidenceOnlySummary/)
  assert.match(assistant, /fallbackSummary \|\|/g)
})

test('improve writing preserves unsupported action language guard and consolidates components', () => {
  assert.match(assistant, /may appear only when already present in the current summary/)
  assert.match(assistant, /Consolidate individual component, appliance, and room references into themes where possible/)
  assert.match(assistant, /removeUnsupportedActionLanguage\(improved, currentSummary\)/)
  assert.match(assistant, /isOverSpecificExecutiveSummary\(cleaned, 5\)/)
  assert.match(assistant, /return cleaned \|\| currentSummary/)
})
