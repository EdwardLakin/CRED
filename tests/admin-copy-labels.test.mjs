import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const templates = readFileSync('src/features/templates/types.ts', 'utf8')
const suggestionService = readFileSync('src/features/evidence/suggestions/service.ts', 'utf8')
const suggestionValidation = readFileSync('src/features/evidence/suggestions/validation.ts', 'utf8')
const diagnosticExtractor = readFileSync('src/lib/openai/diagnostic-procedure-extractor.ts', 'utf8')

test('system templates present documentation and items without changing compatibility keys', () => {
  assert.doesNotMatch(templates, /description: '[^']*\bevidence\b/i)
  assert.doesNotMatch(templates, /sections: \[[^\]]*'Evidence'/)
  assert.match(templates, /'Items'/)
  assert.match(templates, /requiredEvidence:/)
  assert.match(templates, /includeEvidenceGallery:/)
})

test('suggestion copy uses item language while preserving provenance keys', () => {
  for (const retired of ['existing evidence text', 'import batch evidence', "?? 'evidence'", "?? 'batch evidence'"]) {
    assert.equal(suggestionService.includes(retired), false)
  }
  assert.match(suggestionService, /Drafted from existing item text/)
  assert.match(suggestionService, /source_evidence_ids:/)
  assert.match(suggestionValidation, /source item IDs in source_evidence_ids/)
})

test('diagnostic fallback and generation guidance use customer-facing documentation terms', () => {
  assert.doesNotMatch(diagnosticExtractor, /requested evidence|notes, and evidence against/i)
  assert.match(diagnosticExtractor, /requested documentation items/)
  assert.match(diagnosticExtractor, /notes, and supporting items/)
  assert.match(diagnosticExtractor, /instead of "evidence"/)
  assert.match(diagnosticExtractor, /required_evidence:/)
  assert.match(diagnosticExtractor, /evidence_type:/)
})
