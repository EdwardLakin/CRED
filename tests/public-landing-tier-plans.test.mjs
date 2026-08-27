import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync('app/page.tsx', 'utf8')
const publicPlans = readFileSync('src/features/billing/public-plans.ts', 'utf8')
const gates = readFileSync('src/features/billing/feature-gates.ts', 'utf8')
const seats = readFileSync('src/features/billing/seat-entitlements.ts', 'utf8')
const pricingButton = readFileSync('src/features/billing/components/PricingCheckoutButton.tsx', 'utf8')
const readme = readFileSync('public/marketing/cred/README.md', 'utf8')

test('public landing uses new plan names and included seats from centralized entitlements', () => {
  assert.match(publicPlans, /individual: 'essentials'/)
  assert.match(publicPlans, /team: 'professional'/)
  assert.match(publicPlans, /shop: 'investigation'/)
  assert.match(publicPlans, /CRED Essentials/)
  assert.match(publicPlans, /CRED Professional/)
  assert.match(publicPlans, /CRED Investigation/)
  assert.match(seats, /essentials: 3/)
  assert.match(seats, /professional: 10/)
  assert.match(seats, /investigation: 20/)
  assert.match(publicPlans, /getIncludedSeats\(billingKey\)/)
})

test('landing page does not recreate plan feature mappings inline', () => {
  assert.match(page, /PUBLIC_CRED_PLANS/)
  assert.match(page, /PUBLIC_FEATURE_COMPARISON/)
  assert.doesNotMatch(page, /const plans:/)
  assert.doesNotMatch(page, /name: 'Individual'/)
  assert.doesNotMatch(page, /name: 'Team'/)
  assert.doesNotMatch(page, /name: 'Shop'/)
})

test('feature comparison derives booleans from centralized gates', () => {
  assert.match(gates, /const FEATURE_MINIMUM_TIER/)
  assert.match(publicPlans, /canUseFeature\('individual', feature\)/)
  assert.match(publicPlans, /canUseFeature\('team', feature\)/)
  assert.match(publicPlans, /canUseFeature\('shop', feature\)/)
  assert.match(publicPlans, /Investigation outputs/)
  assert.match(publicPlans, /label: 'Storage'/)
  assert.match(publicPlans, /label: 'AI actions \/ month'/)
})

test('checkout buttons retain valid legacy plan keys and no unsupported seat-pack checkout is rendered', () => {
  assert.match(pricingButton, /router\.push\(`\/sign-up\?plan=\$\{plan\}`\)/)
  assert.match(page, /dashboard\?checkout=individual/)
  assert.match(page, /sign-up\?plan=individual/)
  assert.match(page, /plan=\{plan\.billingKey\}/)
  assert.match(page, /User-pack pricing coming with account billing/)
})

test('Essentials remains primary and mobile comparison plus screenshot fallbacks are present', () => {
  assert.match(page, /Start with Essentials/)
  assert.match(page, /Capture → Review → Approve → Export/)
  assert.match(page, /mobile-comparison-cards/)
  assert.match(page, /publicAssetExists/)
  assert.match(page, /screenshot-placeholder/)
  assert.match(readme, /evidence-library\.png/)
  assert.match(readme, /review-queue\.png/)
  assert.match(readme, /relationship-explorer\.png/)
})

test('landing page renders authenticated and unauthenticated CTA paths', () => {
  assert.match(page, /isAuthenticated \? '\/dashboard\?checkout=individual' : '\/sign-up\?plan=individual'/)
  assert.match(page, /PricingCheckoutButton plan=\{plan\.billingKey\} isAuthenticated=\{isAuthenticated\}/)
})

test('public plan and landing copy use the plain item vocabulary', () => {
  for (const label of ['Items', 'Advanced Review', 'Connections', 'Additional Outputs']) {
    assert.match(publicPlans + page, new RegExp(label))
  }
  for (const retired of ['Evidence Library', 'Relationship Explorer', 'structured evidence review', 'evidence workflow']) {
    assert.doesNotMatch(publicPlans + page, new RegExp(retired, 'i'))
  }
})
