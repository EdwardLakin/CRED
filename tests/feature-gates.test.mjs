import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync('src/features/billing/feature-gates.ts', 'utf8')

test('feature gates define tier visibility centrally', () => {
  assert.match(source, /export type CredTier = 'essentials' \| 'professional' \| 'investigation'/)
  assert.match(source, /review_queue: 'professional'/)
  assert.match(source, /timeline: 'professional'/)
  assert.match(source, /entities: 'investigation'/)
  assert.match(source, /relationship_explorer: 'investigation'/)
  assert.match(source, /export function getVisibleWorkspaceFeatures/)
})

test('UI consumes centralized feature visibility instead of hard-coded investigation links', () => {
  const sessionPage = readFileSync('app/dashboard/sessions/[id]/page.tsx', 'utf8')
  const nav = readFileSync('src/features/evidence/components/EvidenceWorkspaceNav.tsx', 'utf8')
  assert.match(sessionPage, /getVisibleWorkspaceFeatures\(profile\)/)
  assert.match(nav, /canUseFeature\(subject, card\.feature\)/)
})
