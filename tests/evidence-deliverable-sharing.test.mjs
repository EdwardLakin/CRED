import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260623190000_deliverable_share_links.sql', 'utf8')
const share = readFileSync('src/features/evidence/deliverables/share.ts', 'utf8')
const actions = readFileSync('src/features/evidence/deliverables/actions.ts', 'utf8')
const workspace = readFileSync('src/features/evidence/deliverables/components/DeliverablesWorkspace.tsx', 'utf8')
const detail = readFileSync('src/features/evidence/deliverables/components/DeliverableDetail.tsx', 'utf8')
const sharing = readFileSync('src/features/evidence/deliverables/components/DeliverableSharing.tsx', 'utf8')
const route = readFileSync('app/deliverables/share/[token]/page.tsx', 'utf8')

test('existing report share token table is extended for exact deliverable targets', () => {
  assert.match(migration, /alter table public\.report_share_tokens[\s\S]*add column if not exists link_kind/i)
  assert.match(migration, /add column if not exists deliverable_id uuid references public\.evidence_deliverables\(id\)/i)
  assert.match(migration, /link_kind in \('report', 'deliverable'\)/i)
  assert.match(migration, /report_share_tokens_active_deliverable_idx/i)
  assert.doesNotMatch(migration, /grant\s+.*\s+to\s+anon/i)
})

test('only final non-deleted in-scope deliverables can be shared', () => {
  assert.match(share, /requireShareableDeliverable/)
  assert.match(share, /eq\('documentation_session_id', sessionId\)/)
  assert.match(share, /eq\('organization_id', organizationId\)/)
  assert.match(share, /is\('deleted_at', null\)/)
  assert.match(share, /deliverable\.status !== 'final'/)
  assert.match(actions, /createDeliverableShareLink/)
})

test('tokens are unguessable, unique, expiring, revocable, and billing limited', () => {
  assert.match(share, /randomBytes\(32\)\.toString\('base64url'\)/)
  assert.match(share, /requireUsageAllowance\([\s\S]*eventType: 'share_link_created'/)
  assert.match(share, /recordUsageEvent\([\s\S]*eventType: 'share_link_created'/)
  assert.match(share, /disabled_at/)
  assert.match(share, /expires_at/)
  assert.match(actions, /revokeEvidenceDeliverableShareLink/)
  assert.match(actions, /rotateEvidenceDeliverableShareLink/)
})

test('public resolution rejects expired revoked deleted and superseded deliverables', () => {
  assert.match(share, /eq\('token', token\)/)
  assert.match(share, /eq\('link_kind', 'deliverable'\)/)
  assert.match(share, /!isActiveShareToken\(shareToken\)/)
  assert.match(share, /deliverable\.status !== 'final'/)
  assert.match(share, /deliverable\.deleted_at/)
  assert.match(share, /session\.deleted_at/)
  assert.match(share, /notFound\(\)/)
})

test('workspace and detail UI expose share controls only for current final version', () => {
  assert.match(workspace, /current \? <DeliverableSharing/)
  assert.match(sharing, /deliverable\.status !== 'final'\) return null/)
  assert.match(sharing, /Share finalized version/)
  assert.match(sharing, /Secure share link/)
  assert.match(sharing, /This exact finalized version|this exact finalized version/i)
  assert.match(sharing, /Revoke access/)
  assert.match(detail, /<DeliverableSharing/)
})

test('shared route is read-only and hides dashboard internals and raw provenance', () => {
  assert.match(route, /deliverables\/share/)
  assert.match(route, /createAdminClient/)
  assert.match(route, /resolveDeliverableShareToken/)
  assert.match(route, /Finalized deliverable/)
  assert.match(route, /Source-controlled deliverable/)
  assert.doesNotMatch(route, /dashboard-shell|DashboardNavigation|Raw provenance JSON|source-selection debug|prompt/i)
})
