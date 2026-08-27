import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const functionSignature = String.raw`public\.sync_organization_subscription\(uuid, text, text, text, text, timestamptz\)`
const migration = readFileSync(
  'supabase/migrations/20260827012954_restrict_subscription_sync_to_service_role.sql',
  'utf8',
)
const webhookRoute = readFileSync('app/api/stripe/webhook/route.ts', 'utf8')
const adminClient = readFileSync('src/lib/supabase/admin.ts', 'utf8')

test('subscription sync RPC is executable only by the service role', () => {
  for (const role of ['public', 'anon', 'authenticated']) {
    assert.match(
      migration,
      new RegExp(`revoke execute on function ${functionSignature} from ${role};`, 'i'),
    )
  }

  assert.match(
    migration,
    new RegExp(`grant execute on function ${functionSignature} to service_role;`, 'i'),
  )
  assert.doesNotMatch(migration, /create\s+(?:or\s+replace\s+)?function/i)
})

test('Stripe webhook uses the server-only service-role client for subscription sync', () => {
  assert.match(webhookRoute, /import \{ createAdminClient \} from '@\/lib\/supabase\/admin'/)
  assert.match(webhookRoute, /const supabase = createAdminClient\(\)/)
  assert.match(webhookRoute, /supabase\.rpc\('sync_organization_subscription'/)
  assert.doesNotMatch(webhookRoute, /from '@\/lib\/supabase\/server'/)

  assert.match(adminClient, /getSupabaseServiceRoleKey\(\)/)
  assert.match(adminClient, /persistSession: false/)
})
