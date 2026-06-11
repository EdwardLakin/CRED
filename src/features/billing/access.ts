import type { Database } from '@/lib/supabase/database.types'
import { normalizeBillingPlan, type OrganizationPlan } from '@/lib/stripe'

export type OrganizationBillingFields = Pick<
  Database['public']['Tables']['organizations']['Row'],
  'plan' | 'subscription_status' | 'trial_ends_at'
>

export type OrganizationBillingAccess = {
  hasAccess: boolean
  reason: 'active_subscription' | 'trial_valid' | 'trial_expired' | 'subscription_inactive'
  isTrialing: boolean
  trialExpired: boolean
  needsCheckout: boolean
  plan: OrganizationPlan | null
}

function getTrialExpired(trialEndsAt: string | null, now: Date) {
  if (!trialEndsAt) {
    return true
  }

  const trialEndDate = new Date(trialEndsAt)

  if (Number.isNaN(trialEndDate.getTime())) {
    return true
  }

  return trialEndDate.getTime() <= now.getTime()
}

export function getOrganizationBillingAccess(
  organization: OrganizationBillingFields,
  now = new Date(),
): OrganizationBillingAccess {
  const status = organization.subscription_status?.toLowerCase() ?? null
  const isActive = status === 'active'
  const isTrialing = status === 'trialing'
  const trialExpired = getTrialExpired(organization.trial_ends_at, now)
  const hasValidTrial = isTrialing && !trialExpired
  const plan = normalizeBillingPlan(organization.plan)

  if (isActive) {
    return {
      hasAccess: true,
      reason: 'active_subscription',
      isTrialing,
      trialExpired: false,
      needsCheckout: false,
      plan,
    }
  }

  if (hasValidTrial) {
    return {
      hasAccess: true,
      reason: 'trial_valid',
      isTrialing,
      trialExpired: false,
      needsCheckout: true,
      plan,
    }
  }

  return {
    hasAccess: false,
    reason: isTrialing ? 'trial_expired' : 'subscription_inactive',
    isTrialing,
    trialExpired: true,
    needsCheckout: true,
    plan,
  }
}

function getBillingOrganization(
  profileOrOrganization: OrganizationBillingFields | { organization: OrganizationBillingFields },
) {
  return 'organization' in profileOrOrganization
    ? profileOrOrganization.organization
    : profileOrOrganization
}

export function requireActiveBillingAccess(
  profileOrOrganization: OrganizationBillingFields | { organization: OrganizationBillingFields },
  now = new Date(),
) {
  const access = getOrganizationBillingAccess(
    getBillingOrganization(profileOrOrganization),
    now,
  )

  return access.hasAccess
    ? { ok: true as const, access }
    : { ok: false as const, access, message: getBillingAccessErrorMessage() }
}

export function getBillingAccessErrorMessage() {
  return 'Your trial has ended. Subscribe to continue.'
}
