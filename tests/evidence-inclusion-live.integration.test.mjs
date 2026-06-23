import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { randomUUID } from 'node:crypto'

import { createLiveRlsFixture, expectDeniedMutation, expectSingleMutationRow, validateSupabaseTestEnvironment } from './helpers/supabase-test-environment.mjs'

validateSupabaseTestEnvironment()
let fx
after(async () => { if (fx) await fx.cleanup() })

function isCaptureIncludedInOutput(capture) {
  const status = capture.evidence_review_status ?? capture.review_status ?? null
  if (capture.deleted_at != null) return false
  if (capture.extracted_data?.hidden_from_report === true || capture.extracted_data?.internal === true || capture.extracted_data?.internal_only === true || capture.capture_ai_analysis?.internal_only === true) return false
  if (capture.include_in_report === false) return false
  if (status === 'excluded') return false
  if (['ai', 'system', 'suggested', 'system_suggested'].includes(String(capture.source_kind ?? capture.suggestion_source ?? '').toLowerCase())) return status === 'reviewed'
  return true
}

async function insertCapture(owner, session, extra = {}) {
  const row = await fx.service.from('capture_items').insert({
    documentation_session_id: session.id,
    organization_id: owner.organization.id,
    type: 'photo',
    media_kind: 'image',
    source_kind: 'upload',
    storage_path: `tests/${fx.runId}/${randomUUID()}.jpg`,
    original_filename: `${randomUUID()}.jpg`,
    technician_note: 'live evidence note',
    include_in_report: true,
    evidence_review_status: 'unreviewed',
    ...extra,
  }).select('*').single()
  assert.ifError(row.error)
  return row.data
}

async function readCapture(client, id) {
  const row = await client.from('capture_items').select('*').eq('id', id).maybeSingle()
  assert.ifError(row.error)
  return row.data
}

test('seed isolated organizations and capture inclusion fixtures', async () => {
  fx = await createLiveRlsFixture()
  const base = await insertCapture(fx.a, fx.sessions.a1)
  const excluded = await insertCapture(fx.a, fx.sessions.a1, { evidence_review_status: 'excluded' })
  const nonIncluded = await insertCapture(fx.a, fx.sessions.a1, { include_in_report: false })
  const deleted = await insertCapture(fx.a, fx.sessions.a1, { deleted_at: new Date().toISOString() })
  const ai = await insertCapture(fx.a, fx.sessions.a1, { source_kind: 'system' })
  fx.evidenceRegression = { base, excluded, nonIncluded, deleted, ai }
})

test('same-org review and inclusion mutations persist and zero-row cases are detectable', async (t) => {
  if (!fx?.evidenceRegression) return t.skip('fixture unavailable')
  const { base, deleted } = fx.evidenceRegression
  expectSingleMutationRow(await fx.a.client.from('capture_items').update({ evidence_review_status: 'reviewed' }).eq('id', base.id).select('id, evidence_review_status'), base.id)
  assert.equal((await readCapture(fx.a.client, base.id)).evidence_review_status, 'reviewed')
  expectSingleMutationRow(await fx.a.client.from('capture_items').update({ include_in_report: false }).eq('id', base.id).select('id, include_in_report'), base.id)
  assert.equal((await readCapture(fx.a.client, base.id)).include_in_report, false)
  expectDeniedMutation(await fx.b.client.from('capture_items').update({ evidence_review_status: 'reviewed' }).eq('id', base.id).select('id'))
  expectDeniedMutation(await fx.a.client.from('capture_items').update({ evidence_review_status: 'reviewed' }).eq('id', randomUUID()).select('id'))
  expectDeniedMutation(await fx.a.client.from('capture_items').update({ evidence_review_status: 'reviewed' }).eq('id', deleted.id).select('id'))
})

test('capture ownership fields cannot be retargeted by authenticated users', async (t) => {
  if (!fx?.evidenceRegression) return t.skip('fixture unavailable')
  const { base } = fx.evidenceRegression
  for (const patch of [
    { organization_id: fx.b.organization.id },
    { documentation_session_id: fx.sessions.a2.id },
    { storage_path: `tests/${fx.runId}/retargeted.jpg` },
  ]) {
    const attempt = await fx.a.client.from('capture_items').update(patch).eq('id', base.id).select('*')
    assert.ok(attempt.error || (attempt.data ?? []).length === 0, `retarget patch must not persist: ${JSON.stringify(patch)}`)
  }
  const reread = await readCapture(fx.a.client, base.id)
  assert.equal(reread.organization_id, fx.a.organization.id)
  assert.equal(reread.documentation_session_id, fx.sessions.a1.id)
  assert.equal(reread.storage_path, base.storage_path)
})

test('canonical inclusion semantics produce expected final report source set', async (t) => {
  if (!fx?.evidenceRegression) return t.skip('fixture unavailable')
  const reviewed = await insertCapture(fx.a, fx.sessions.a1, { evidence_review_status: 'reviewed' })
  const followup = await insertCapture(fx.a, fx.sessions.a1, { evidence_review_status: 'needs_followup' })
  const unreviewed = await insertCapture(fx.a, fx.sessions.a1)
  const { excluded, nonIncluded, deleted, ai } = fx.evidenceRegression
  const ids = [reviewed.id, followup.id, unreviewed.id, excluded.id, nonIncluded.id, deleted.id, ai.id]
  const rows = await fx.a.client.from('capture_items').select('*').in('id', ids)
  assert.ifError(rows.error)
  const includedIds = rows.data.filter(isCaptureIncludedInOutput).map((row) => row.id).sort()
  assert.deepEqual(includedIds, [reviewed.id, followup.id, unreviewed.id].sort())
})
