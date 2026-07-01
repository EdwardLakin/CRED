import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const studio = readFileSync('src/features/branding/components/BrandingStudio.tsx', 'utf8')
const page = readFileSync('app/dashboard/settings/branding/page.tsx', 'utf8')
const route = readFileSync('app/api/dashboard/sessions/[id]/report-pdf/route.ts', 'utf8')

test('Report Studio preview does not use ai_summary as visible evidence text', () => {
  assert.doesNotMatch(studio, /ai_summary/)
  assert.match(page, /note:c\.technician_note\|\|null/)
  assert.doesNotMatch(page, /note:c\.technician_note\|\|c\.ai_summary/)
  assert.match(studio, /e\?\.note \|\| e\?\.label \|\| 'No included evidence found for this session\.'/)
})

test('report-pdf export labels evidence from technician note before neutral manual fallback, never ai_summary', () => {
  assert.match(route, /function getUserEvidenceText[\s\S]*capture\.technician_note\?\.trim\(\) \|\| capture\.transcript\?\.trim\(\)/)
  assert.match(route, /function getPrimaryEvidenceLabel[\s\S]*original_filename[\s\S]*getUserEvidenceText\(capture\)[\s\S]*Photo evidence/)
  assert.doesNotMatch(route, /getPrimaryEvidenceLabel[\s\S]*ai_summary[\s\S]*\}\n\nfunction looksLikeRawUploadFilename/)
})

