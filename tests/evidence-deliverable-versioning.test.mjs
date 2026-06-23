import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync('supabase/migrations/20260623160000_deliverable_version_lifecycle.sql', 'utf8')
const hardeningMigration = readFileSync('supabase/migrations/20260623170000_harden_deliverable_finalization.sql', 'utf8')
const data = readFileSync('src/features/evidence/deliverables/data.ts', 'utf8')
const actions = readFileSync('src/features/evidence/deliverables/actions.ts', 'utf8')
const workspace = readFileSync('src/features/evidence/deliverables/components/DeliverablesWorkspace.tsx', 'utf8')
const assemblyPanel = readFileSync('src/features/evidence/deliverables/components/DeliverableAssemblyPanel.tsx', 'utf8')
const card = readFileSync('src/features/evidence/deliverables/components/DeliverableCard.tsx', 'utf8')
const detail = readFileSync('src/features/evidence/deliverables/components/DeliverableDetail.tsx', 'utf8')
const print = readFileSync('src/features/evidence/deliverables/components/DeliverablePrintView.tsx', 'utf8')

test('deliverable versions are assigned server-side and scoped by org session and type', () => {
  assert.match(migration, /version_number integer/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /partition by organization_id, documentation_session_id, deliverable_type/i)
  assert.match(migration, /where organization_id = new\.organization_id and documentation_session_id = new\.documentation_session_id and deliverable_type = new\.deliverable_type/i)
  assert.match(migration, /evidence_deliverables_version_unique_idx.*organization_id, documentation_session_id, deliverable_type, version_number/is)
})

test('lifecycle status and one-final enforcement are in the database', () => {
  assert.match(migration, /status in \('draft', 'final', 'superseded', 'archived', 'failed'\)/)
  assert.match(migration, /evidence_deliverables_one_final_idx.*where status = 'final' and deleted_at is null/is)
  assert.match(migration, /finalize_evidence_deliverable/)
  assert.match(migration, /status = 'superseded'/)
  assert.match(hardeningMigration, /finalize_evidence_deliverable\(p_deliverable_id uuid\)/)
  assert.match(hardeningMigration, /auth\.uid\(\) is null/)
  assert.match(hardeningMigration, /p\.user_id = auth\.uid\(\)[\s\S]*p\.organization_id = selected\.organization_id/)
  assert.match(hardeningMigration, /finalized_by = actor_profile_id/)
  assert.match(hardeningMigration, /revoke all on function public\.finalize_evidence_deliverable\(uuid, uuid\) from authenticated/i)
  assert.doesNotMatch(hardeningMigration, /grant execute on function public\.finalize_evidence_deliverable\(uuid\) to anon/i)
})

test('server actions authenticate scope and reject unsafe lifecycle changes', () => {
  assert.match(actions, /requireSessionWorkspace\(\)/)
  assert.match(actions, /assertSession\(supabase, sessionId, profile\.organization_id\)/)
  assert.match(data, /eq\('id', deliverableId\).*eq\('documentation_session_id', sessionId\).*eq\('organization_id', organizationId\).*is\('deleted_at', null\)/s)
  assert.match(data, /row\.status !== 'draft'/)
  assert.match(data, /Only draft deliverables can be finalized/)
  assert.match(data, /rpc\('finalize_evidence_deliverable', \{ p_deliverable_id: deliverableId \}\)/)
  assert.doesNotMatch(data, /p_actor_profile_id/)
  assert.match(data, /Only draft deliverables can be archived/)
})

test('immutable generated snapshots are preserved after finalization and regeneration inserts', () => {
  assert.match(data, /insert\(\{[\s\S]*status: 'draft'[\s\S]*content: generated\.content[\s\S]*provenance: generated\.provenance/s)
  assert.match(migration, /protect_evidence_deliverable_snapshot/)
  assert.match(migration, /old\.status in \('final', 'superseded'\).*new\.content is distinct from old\.content/s)
  assert.doesNotMatch(data, /update\(\{[\s\S]*(content|provenance)[\s\S]*\}/)
})

test('workspace groups versions, hides archived drafts by default, and keeps history readable', () => {
  assert.match(workspace, /Version history/)
  assert.match(workspace, /Show archived versions/)
  assert.match(workspace, /deliverable\.status !== 'archived'/)
  assert.match(workspace, /Current final version/)
  assert.match(workspace, /Generate new version/)
  assert.match(workspace, /finalizeEvidenceDeliverableFormAction/)
  assert.match(workspace, /archiveEvidenceDeliverableFormAction/)
  assert.match(workspace, /dashboard\/sessions\/\$\{sessionId\}\/deliverables\/\$\{deliverable\.id\}\/print/)
})

test('detail UI displays stored source-selection provenance', () => {
  assert.match(detail, /Source provenance/)
  assert.match(detail, /immutable provenance stored on this deliverable version/)
  for (const key of ['selectedImportBatchIds', 'selectedCaptureItemIds', 'selectedAssertionIds', 'selectedTimelineEventIds', 'selectedEntityIds', 'includeNeedsFollowUpEvidence', 'includeOutputExcludedEvidence', 'includeAcceptedSuggestions', 'includeEditedSuggestions']) assert.match(detail, new RegExp(key))
  assert.match(detail, /Raw provenance JSON for debugging/)
})

test('print UI displays version and lifecycle metadata', () => {
  assert.match(print, /Version \{deliverable\.version_number\}/)
  assert.match(print, /formatDeliverableStatus\(deliverable\.status\)/)
  assert.match(print, /deliverable\.finalized_at/)
  assert.match(print, /Source-controlled deliverable/)
})

test('React forms use void-returning deliverable action wrappers', () => {
  for (const source of [assemblyPanel, card, workspace]) {
    assert.match(source, /generateEvidenceDeliverableFormAction\.bind\(null,/)
    assert.doesNotMatch(source, /action=\{generateEvidenceDeliverable\.bind/)
  }
  assert.match(workspace, /finalizeEvidenceDeliverableFormAction\.bind\(null, sessionId, deliverable\.id\)/)
  assert.match(workspace, /archiveEvidenceDeliverableFormAction\.bind\(null, sessionId, deliverable\.id\)/)
  assert.match(workspace, /restoreArchivedDeliverableFormAction\.bind\(null, sessionId, deliverable\.id\)/)
  assert.doesNotMatch(workspace, /action=\{(?:finalizeEvidenceDeliverable|archiveEvidenceDeliverable|restoreArchivedDeliverable)\.bind/)
})

test('deliverable action wrappers preserve ActionResult-returning actions', () => {
  const wrappers = [
    ['generateEvidenceDeliverable', 'generateEvidenceDeliverableFormAction'],
    ['finalizeEvidenceDeliverable', 'finalizeEvidenceDeliverableFormAction'],
    ['archiveEvidenceDeliverable', 'archiveEvidenceDeliverableFormAction'],
    ['restoreArchivedDeliverable', 'restoreArchivedDeliverableFormAction'],
  ]
  for (const [actionName, wrapperName] of wrappers) {
    assert.match(actions, new RegExp(`export async function ${actionName}\\([\\s\\S]*?\\): Promise<ActionResult>`))
    assert.match(actions, new RegExp(`export async function ${wrapperName}\\([\\s\\S]*?\\): Promise<void> \\{\\n  await ${actionName}\\(`))
  }
})
