import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistant = readFileSync('src/lib/openai/report-summary-assistant.ts', 'utf8')

test('executive summary pipeline is staged with typed structured outputs', () => {
  for (const fn of ['understandReport', 'understandEvidence', 'generateExecutiveSummary', 'improveExecutiveSummary']) {
    assert.match(assistant, new RegExp(`export async function ${fn}\\(`))
  }
  assert.match(assistant, /export type ReportUnderstanding = \{[\s\S]*reportType: string;[\s\S]*documentationMode: DocumentationMode;[\s\S]*confidence: ConfidenceLevel;/)
  assert.match(assistant, /export type EvidenceUnderstanding = \{[\s\S]*majorThemes: string\[\];[\s\S]*summaryFacts: string\[\];[\s\S]*unsupportedOrWeakAreas: string\[\];/)
  assert.match(assistant, /"report_understanding"/)
  assert.match(assistant, /"evidence_understanding"/)
  assert.match(assistant, /"executive_summary"/)
})

test('tool inventory reports are treated as inventory records, not inspections or deficiencies', () => {
  for (const term of ['Ratchets', '18Volt', '12V', 'Sockets', 'Tool box', 'Tool cart']) {
    assert.match(assistant, new RegExp(term, 'i'))
  }
  assert.match(assistant, /documentationMode === "inventory"/)
  assert.match(assistant, /This report documents an inventory record for \$\{subject\}/)
  assert.match(assistant, /calls an inventory an inspection/)
  assert.match(assistant, /calls inventory items deficiencies/)
  assert.match(assistant, /electrical deficiencies/)
  assert.match(assistant, /deteriorat/)
})

test('rental and property condition reports can mention property only when context supports it', () => {
  assert.match(assistant, /function hasPropertySignals/)
  assert.match(assistant, /property\|rental\|tenant\|unit\|home\|house\|building\|flooring\|fixture\|interior\|exterior\|room\|kitchen\|bathroom/)
  assert.match(assistant, /condition assessment/)
  assert.match(assistant, /!hasPropertySignals\(`\$\{report\.subject\} \$\{report\.reportType\} \$\{sourceText\}`\) && \/\\bproperty\\b\/i\.test\(summary\)/)
  assert.match(assistant, /over-lists individual observations/)
})

test('generic evidence reports use a safe industry-neutral fallback', () => {
  assert.match(assistant, /This report summarizes the documented evidence for \$\{subjectLabel\}/)
  assert.match(assistant, /This report summarizes the documented evidence captured for review/)
  assert.match(assistant, /items, observations, or conditions captured during the documentation process/)
  assert.match(assistant, /general documentation/)
  assert.doesNotMatch(assistant, /return "inspected subject"/)
  assert.doesNotMatch(assistant, /property located at/)
})

test('diagnostic and service reports use supported diagnostic or service language without property assumptions', () => {
  assert.match(assistant, /diagnostic/)
  assert.match(assistant, /fault code\|test reading\|scan\|diagnosis/)
  assert.match(assistant, /service documentation/)
  assert.match(assistant, /work performed\|parts used\|work order\|field service/)
  assert.match(assistant, /Do not mention property unless the report is actually about property/)
  assert.match(assistant, /Do not assume inspection, defects, deficiencies, property, equipment failure/)
})

test('improve writing preserves facts and blocks unsupported recommendations or severity', () => {
  assert.match(assistant, /Do not regenerate from scratch/)
  assert.match(assistant, /Preserve all factual meaning and user edits/)
  assert.match(assistant, /Do not add facts, recommendations, severity, urgency, liability, repairs, replacement, or remediation/)
  assert.match(assistant, /Do not change the documentation mode unless the current text clearly supports it/)
  assert.match(assistant, /return validation\.valid \? cleaned : currentSummary/)
})

test('validation retries once and then falls back safely', () => {
  assert.match(assistant, /validateSummary/)
  assert.match(assistant, /retryReasons/)
  assert.match(assistant, /Previous validation failed for:/)
  assert.match(assistant, /const firstValidation = validateSummary/)
  assert.match(assistant, /const secondValidation = validateSummary/)
  assert.match(assistant, /return deterministicValidation\.valid \? deterministic : safeFallbackSummary/)
  assert.match(assistant, /placeholder caption used as theme/)
  assert.match(assistant, /irrelevant hardcoded industry language/)
})
