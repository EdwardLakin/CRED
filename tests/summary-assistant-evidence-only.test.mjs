import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistant = readFileSync('src/lib/openai/report-summary-assistant.ts', 'utf8')

test('regenerate summary extracts structured inputs and renders deterministic template', () => {
  assert.match(assistant, /Return structured JSON only; do not write the final paragraph/)
  assert.match(assistant, /name: "report_summary_inputs"/)
  assert.match(assistant, /propertyType: \{ type: "string" \}/)
  assert.match(assistant, /themes: \{ type: "array"/)
  assert.match(assistant, /overallCondition: \{ type: "string" \}/)
  assert.match(assistant, /This report summarizes the documented condition of the \$\{propertyType\} located at \$\{location\}/)
  assert.match(assistant, /Detailed observations and supporting photographic evidence are provided in the following sections/)
})

test('summary assistant normalizes rental-style components into broad themes', () => {
  assert.match(assistant, /linoleum and carpet map to flooring deterioration/)
  assert.match(assistant, /fireplace, humidifier, and stove map to equipment or fixture deficiencies/)
  assert.match(assistant, /bathroom ceiling, kitchen ceiling, and basement floor map to moisture-related conditions, interior finish wear, or flooring deterioration/)
  assert.match(assistant, /function normalizeTheme/)
  assert.match(assistant, /linoleum\|carpet\|floor/)
  assert.match(assistant, /fireplace\|humidifier\|stove/)
})

test('summary assistant guards final text against component-heavy language and unsupported actions', () => {
  assert.match(assistant, /OVER_SPECIFIC_COMPONENT_TERMS = \[/)
  for (const term of ['linoleum', 'carpet', 'fireplace', 'humidifier', 'bathroom', 'kitchen', 'basement']) {
    assert.match(assistant, new RegExp(`"${term}"`))
  }
  assert.match(assistant, /countOverSpecificTerms\(summary\) > 1/)
  assert.match(assistant, /Do not include observation counts, repairs, replacement, recommendations, severity, urgency, hazard, liability language, or unsupported facts/)
  assert.match(assistant, /removeUnsupportedActionLanguage\(rendered, sourceText\)/)
})

test('improve writing remains constrained and falls back when over-specific', () => {
  assert.match(assistant, /Write one paragraph/)
  assert.match(assistant, /Avoid individual component lists; consolidate component-heavy language into broad themes/)
  assert.match(assistant, /may appear only when already present in the current summary/)
  assert.match(assistant, /countOverSpecificTerms\(cleaned\) > 1/)
  assert.match(assistant, /deterministicEvidenceOnlySummary/)
})
