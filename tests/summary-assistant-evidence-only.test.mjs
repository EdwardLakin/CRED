import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistant = readFileSync('src/lib/openai/report-summary-assistant.ts', 'utf8')

test('regenerate summary extracts universal structured inputs and renders deterministic template', () => {
  assert.match(assistant, /Return structured JSON only; do not write the final Executive Summary paragraph/)
  assert.match(assistant, /name: "report_summary_inputs"/)
  assert.match(assistant, /reportIntent: \{ type: "string" \}/)
  assert.match(assistant, /subjectLabel: \{ type: "string" \}/)
  assert.match(assistant, /primaryThemes: \{ type: "array"/)
  assert.match(assistant, /overallSummary: \{ type: "string" \}/)
  assert.doesNotMatch(assistant, /propertyType: \{ type: "string" \}/)
  assert.match(assistant, /This report summarizes documented observations for the \$\{openingNoun\}/)
  assert.match(assistant, /The documentation primarily relates to \$\{formatPhraseList\(themes\)\} captured during review/)
  assert.match(assistant, /Detailed observations and supporting evidence are provided in the following sections/)
})

test('summary assistant normalizes rental/property-style evidence into broad neutral themes', () => {
  assert.match(assistant, /condition concerns/)
  assert.match(assistant, /material deterioration/)
  assert.match(assistant, /moisture-related observations/)
  assert.match(assistant, /maintenance-related observations/)
  assert.match(assistant, /function normalizeTheme/)
  assert.doesNotMatch(assistant, /linoleum and carpet map to flooring deterioration/)
  assert.doesNotMatch(assistant, /fireplace, humidifier, and stove map to equipment or fixture deficiencies/)
  assert.doesNotMatch(assistant, /bathroom ceiling, kitchen ceiling, and basement floor map/)
  assert.doesNotMatch(assistant, /flooring deterioration/)
})

test('summary assistant supports automotive and heavy-duty evidence without over-specific component lists', () => {
  assert.match(assistant, /vehicle\|truck\|trailer\|fleet\|automotive/)
  assert.match(assistant, /return "inspected vehicle"/)
  assert.match(assistant, /mechanical concerns/)
  assert.match(assistant, /fluid\/leak-related observations/)
  for (const term of ['brake', 'engine', 'transmission', 'dpf', 'tire', 'vin']) {
    assert.match(assistant, new RegExp(`"${term}"`))
  }
  assert.match(assistant, /Do not return room names, component names, photo captions, VINs, IDs, codes, or individual defects as themes/)
})

test('summary assistant supports field-service and equipment evidence without assuming property', () => {
  assert.match(assistant, /service visit documentation/)
  assert.match(assistant, /return "documented equipment"/)
  assert.match(assistant, /return "service visit"/)
  assert.match(assistant, /operational issues/)
  assert.match(assistant, /electrical concerns/)
  for (const term of ['pump', 'compressor', 'boiler', 'furnace', 'humidifier']) {
    assert.match(assistant, new RegExp(`"${term}"`))
  }
  assert.doesNotMatch(assistant, /This report summarizes the documented condition of the \$\{propertyType\}/)
  assert.doesNotMatch(assistant, /property located at/)
})

test('generic evidence reports stay neutral when subject type is unknown', () => {
  assert.match(assistant, /return "inspected subject"/)
  assert.match(assistant, /Do not assume industry/)
  assert.match(assistant, /Use the report context to infer the domain only when obvious/)
  assert.match(assistant, /Domain-specific words may help classify a theme, but must not force property-only, vehicle-only, or equipment-only output/)
  assert.match(assistant, /documentation of existing conditions/)
})

test('summary assistant guards final text against component-heavy language and unsupported actions', () => {
  assert.match(assistant, /OVER_SPECIFIC_COMPONENT_TERMS = \[/)
  for (const term of ['linoleum', 'carpet', 'bathroom', 'kitchen', 'basement', 'brake', 'engine', 'transmission', 'pump', 'compressor']) {
    assert.match(assistant, new RegExp(`"${term}"`))
  }
  assert.match(assistant, /countOverSpecificTerms\(summary\) > 1/)
  assert.match(assistant, /Do not include observation counts, recommendations, severity, urgency, liability language, repair instructions, replacement instructions, remediation language, or unsupported conclusions/)
  assert.match(assistant, /removeUnsupportedActionLanguage\(rendered, sourceText\)/)
})

test('improve writing remains industry-neutral and falls back when over-specific', () => {
  assert.match(assistant, /Write one paragraph/)
  assert.match(assistant, /professional, customer-facing evidence documentation report across any industry/)
  assert.match(assistant, /do not assume property, vehicle, equipment, or any other industry unless the current text clearly says so/)
  assert.match(assistant, /Avoid individual component lists; consolidate component-heavy language into broad themes/)
  assert.match(assistant, /may appear only when already present in the current summary/)
  assert.match(assistant, /countOverSpecificTerms\(cleaned\) > 1/)
  assert.match(assistant, /deterministicEvidenceOnlySummary/)
})
