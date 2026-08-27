import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const studio = readFileSync('src/features/branding/components/BrandingStudio.tsx', 'utf8')
const page = readFileSync('app/dashboard/settings/branding/page.tsx', 'utf8')
const route = readFileSync('app/api/dashboard/sessions/[id]/report-pdf/route.ts', 'utf8')

test('Report Studio preview does not use ai_summary as visible item text', () => {
  assert.doesNotMatch(studio, /ai_summary/)
  assert.match(page, /note:c\.technician_note\|\|null/)
  assert.doesNotMatch(page, /note:c\.technician_note\|\|c\.ai_summary/)
  assert.match(studio, /e\?\.note \|\| e\?\.label \|\| 'No included items found for this session\.'/)
})

test('report-pdf export labels items from reviewed text before a neutral fallback, never ai_summary', () => {
  assert.match(route, /function getCustomerObservationText[\s\S]*capture\.customer_facing_observation\?\.trim\(\) \|\| capture\.technician_note\?\.trim\(\) \|\| capture\.transcript\?\.trim\(\)/)
  assert.match(route, /function getUserEvidenceText[\s\S]*getCustomerObservationText\(capture\)/)
  assert.match(route, /function getPrimaryEvidenceLabel[\s\S]*getUserEvidenceText\(capture\)[\s\S]*Supporting photo/)
  assert.doesNotMatch(route, /getPrimaryEvidenceLabel[\s\S]*ai_summary[\s\S]*\}\n\nfunction looksLikeRawUploadFilename/)
})
