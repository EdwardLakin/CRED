import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260623190000_deliverable_share_links.sql', 'utf8')
const hardeningMigration = readFileSync('supabase/migrations/20260623201000_harden_deliverable_share_links.sql', 'utf8')
const accessMigration = readFileSync('supabase/migrations/20260623202000_restore_scoped_report_share_token_access.sql', 'utf8')
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
  assert.match(hardeningMigration, /report_share_tokens_one_open_deliverable_idx/i)
  assert.match(hardeningMigration, /where link_kind = 'deliverable'[\s\S]*disabled_at is null/i)
  assert.doesNotMatch(hardeningMigration, /grant\s+.*\s+to\s+anon/i)
})


test('report share token access is minimally granted and publicly blocked', () => {
  assert.match(accessMigration, /alter table public\.report_share_tokens enable row level security/i)
  assert.match(accessMigration, /revoke all on table public\.report_share_tokens from anon/i)
  assert.match(accessMigration, /revoke all on table public\.report_share_tokens from authenticated/i)
  assert.match(accessMigration, /grant select, insert, update on table public\.report_share_tokens to authenticated/i)
  assert.doesNotMatch(accessMigration, /grant\s+(?:all|delete)[\s\S]*on table public\.report_share_tokens[\s\S]*to authenticated/i)
  assert.doesNotMatch(accessMigration, /grant\s+[\s\S]*on table public\.report_share_tokens[\s\S]*to anon/i)
  assert.match(accessMigration, /revoke all on function public\.increment_deliverable_share_token_view\(uuid\) from authenticated/i)
  assert.match(accessMigration, /grant execute on function public\.increment_deliverable_share_token_view\(uuid\) to service_role/i)
})

test('report share token RLS scopes select insert and revoke updates', () => {
  assert.match(accessMigration, /create policy "Organization members can read report share tokens"[\s\S]*for select[\s\S]*to authenticated[\s\S]*profiles\.organization_id = report_share_tokens\.organization_id[\s\S]*profiles\.user_id = auth\.uid\(\)/i)
  assert.match(accessMigration, /create policy "Organization members can create report share tokens"[\s\S]*for insert[\s\S]*created_by is not null[\s\S]*profiles\.id = report_share_tokens\.created_by[\s\S]*profiles\.user_id = auth\.uid\(\)/i)
  assert.match(accessMigration, /documentation_sessions\.id = report_share_tokens\.documentation_session_id[\s\S]*documentation_sessions\.organization_id = report_share_tokens\.organization_id[\s\S]*documentation_sessions\.deleted_at is null/i)
  assert.match(accessMigration, /create policy "Organization members can update report share tokens"[\s\S]*for update[\s\S]*using[\s\S]*profiles\.organization_id = report_share_tokens\.organization_id[\s\S]*with check/i)
  assert.match(actions, /update\(\{ disabled_at: new Date\(\)\.toISOString\(\) \}\)[\s\S]*eq\('id', tokenId\)[\s\S]*eq\('organization_id', profile\.organization_id\)[\s\S]*eq\('documentation_session_id', sessionId\)[\s\S]*eq\('deliverable_id', deliverableId\)[\s\S]*eq\('link_kind', 'deliverable'\)[\s\S]*maybeSingle\(\)/i)
})

test('deliverable share token RLS validates final in-scope targets and immutable token targets', () => {
  assert.match(accessMigration, /link_kind = 'deliverable'[\s\S]*deliverable_id is not null[\s\S]*evidence_deliverables\.id = report_share_tokens\.deliverable_id[\s\S]*evidence_deliverables\.organization_id = report_share_tokens\.organization_id[\s\S]*evidence_deliverables\.documentation_session_id = report_share_tokens\.documentation_session_id[\s\S]*evidence_deliverables\.deleted_at is null[\s\S]*evidence_deliverables\.status = 'final'/i)
  assert.match(accessMigration, /create or replace function public\.reject_report_share_token_retargeting\(\)[\s\S]*new\.organization_id is distinct from old\.organization_id[\s\S]*new\.documentation_session_id is distinct from old\.documentation_session_id[\s\S]*new\.deliverable_id is distinct from old\.deliverable_id[\s\S]*new\.link_kind is distinct from old\.link_kind[\s\S]*new\.token is distinct from old\.token[\s\S]*new\.created_by is distinct from old\.created_by/i)
  assert.match(accessMigration, /create trigger report_share_tokens_reject_retargeting[\s\S]*before update on public\.report_share_tokens[\s\S]*execute function public\.reject_report_share_token_retargeting\(\)/i)
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
  assert.match(share, /validateDeliverableShareExpiration/)
  assert.match(share, /Share-link expiration must be a valid future date\./)
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
  assert.match(share, /increment_deliverable_share_token_view/)
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
