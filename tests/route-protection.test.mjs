import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const routes = new Map([
  ['app/dashboard/sessions/[id]/timeline/page.tsx', 'timeline'],
  ['app/dashboard/sessions/[id]/assertions/page.tsx', 'factual_observations'],
  ['app/dashboard/sessions/[id]/suggestions/page.tsx', 'suggestions'],
  ['app/dashboard/sessions/[id]/deliverables/page.tsx', 'deliverables'],
  ['app/dashboard/sessions/[id]/entities/page.tsx', 'entities'],
  ['app/dashboard/sessions/[id]/relationships/page.tsx', 'relationship_explorer'],
  ['app/dashboard/sessions/[id]/evidence/review/page.tsx', 'review_queue'],
])

test('tiered workspace routes require matching feature access', () => {
  for (const [path, feature] of routes) {
    const source = readFileSync(path, 'utf8')
    assert.match(source, /requireWorkspaceFeatureOrRedirect/)
    assert.match(source, new RegExp(`requireWorkspaceFeatureOrRedirect\\(workspace\\.profile, '${feature}', id\\)`))
  }
})
