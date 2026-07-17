import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const stripe = readFileSync('src/lib/stripe/index.ts', 'utf8')
const checkout = readFileSync('app/api/billing/checkout/route.ts', 'utf8')
const portal = readFileSync('app/api/billing/portal/route.ts', 'utf8')
const billingPage = readFileSync('app/dashboard/billing/page.tsx', 'utf8')
const publicPlans = readFileSync('src/features/billing/public-plans.ts', 'utf8')
const deliverableActions = readFileSync('src/features/evidence/deliverables/actions.ts', 'utf8')
const deliverableData = readFileSync('src/features/evidence/deliverables/data.ts', 'utf8')
const deliverableAssembly = readFileSync('src/features/evidence/deliverables/components/DeliverableAssemblyPanel.tsx', 'utf8')
const deliverableService = readFileSync('src/features/evidence/deliverables/service.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260717020000_investigation_relationship_map_deliverable.sql', 'utf8')

test('customer-facing tier names remain consistent while legacy billing keys stay stable', () => {
  assert.match(stripe, /individual: \{ name: 'CRED Essentials'/)
  assert.match(stripe, /team: \{ name: 'CRED Professional'/)
  assert.match(stripe, /shop: \{ name: 'CRED Investigation'/)
  assert.match(stripe, /export type BillingPlan = 'individual' \| 'team' \| 'shop'/)
  assert.match(billingPage, /getPlanDisplayName/)
})

test('active subscriptions use the Stripe portal and cannot create duplicate checkout subscriptions', () => {
  assert.match(stripe, /billing_portal\/sessions/)
  assert.match(portal, /createBillingPortalSession/)
  assert.match(billingPage, /BillingPortalButton/)
  assert.match(billingPage, /hasStripeSubscription/)
  assert.match(checkout, /stripe_subscription_id/)
  assert.match(checkout, /Manage an existing subscription through the billing portal/)
  assert.match(checkout, /canUseWorkspaceAdmin/)
  assert.match(portal, /canUseWorkspaceAdmin/)
})

test('public comparison exposes the limits already enforced by the app', () => {
  assert.match(publicPlans, /label: 'Storage'/)
  assert.match(publicPlans, /label: 'AI actions \/ month'/)
  assert.match(publicPlans, /label: 'Report emails \/ month'/)
  assert.match(publicPlans, /label: 'Active secure links'/)
  assert.match(publicPlans, /getPlanLimits\('individual'\)/)
})

test('relationship map is a real Investigation-only deliverable', () => {
  assert.match(deliverableData, /type: 'relationship_map'/)
  assert.match(deliverableData, /requiredFeature: 'investigation_deliverables'/)
  assert.match(deliverableAssembly, /availableTypes=\{data\.availableTypes\}/)
  assert.match(deliverableActions, /Relationship Map deliverables require CRED Investigation/)
  assert.match(deliverableService, /generateRelationshipMap/)
  assert.match(migration, /'relationship_map'/)
})
