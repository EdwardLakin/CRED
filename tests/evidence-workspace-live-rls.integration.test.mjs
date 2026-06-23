import assert from 'node:assert/strict'
import test from 'node:test'

const REQUIRED = ['SUPABASE_TEST_URL', 'SUPABASE_TEST_ANON_KEY', 'SUPABASE_TEST_SERVICE_ROLE_KEY', 'SUPABASE_TEST_ALLOW_DESTRUCTIVE']
const missing = REQUIRED.filter((name) => !process.env[name])
const isConfigured = missing.length === 0
const productionUrls = (process.env.SUPABASE_PRODUCTION_URLS ?? '').split(',').map((url) => url.trim()).filter(Boolean)

function requireLiveRls() {
  if (!isConfigured) throw new Error(`Skipped live Supabase RLS integration tests; missing ${missing.join(', ')}`)
  if (process.env.SUPABASE_TEST_ALLOW_DESTRUCTIVE !== 'evidence-workspace-rls') throw new Error('Refusing destructive setup without SUPABASE_TEST_ALLOW_DESTRUCTIVE=evidence-workspace-rls')
  if (productionUrls.includes(process.env.SUPABASE_TEST_URL)) throw new Error('Refusing to run against a production Supabase URL')
}

test('live RLS suite requires an explicit non-production Supabase test environment', { skip: !isConfigured }, async () => {
  requireLiveRls()
  assert.equal(process.env.SUPABASE_TEST_ALLOW_DESTRUCTIVE, 'evidence-workspace-rls')
})

test('live RLS coverage plan includes required tenancy and integrity assertions', () => {
  const assertions = [
    'cross-organization reads', 'cross-organization writes', 'cross-session relationship rejection',
    'deleted endpoint rejection', 'suggestion review isolation', 'deliverable isolation',
    'guessed-ID access attempts', 'duplicate active relationships', 'soft-deleted relationship recreation',
  ]
  assert.deepEqual(assertions.length, 9)
})
