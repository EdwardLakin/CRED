import { NextResponse } from 'next/server'

import { getCurrentProfile, getCurrentUser } from '@/features/auth/server'
import {
  createStripeCustomer,
  createSubscriptionCheckoutSession,
  parseBillingPlan,
  type BillingPlan,
} from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

const REQUIRED_CHECKOUT_ENV_VARS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_INDIVIDUAL',
  'STRIPE_PRICE_TEAM',
  'STRIPE_PRICE_SHOP',
  'NEXT_PUBLIC_APP_URL',
] as const

function validateCheckoutEnvironment(): { appUrl: string } | { error: string } {
  const missing = REQUIRED_CHECKOUT_ENV_VARS.filter((key) => !process.env[key])

  if (missing.length > 0) {
    return { error: `Missing billing configuration: ${missing.join(', ')}` }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL as string

  try {
    return { appUrl: new URL(appUrl).origin }
  } catch {
    return { error: 'Invalid billing configuration: NEXT_PUBLIC_APP_URL must be a valid URL' }
  }
}

function getCheckoutUrls(appUrl: string) {
  return {
    successUrl: `${appUrl}/dashboard?billing=success`,
    cancelUrl: `${appUrl}/dashboard?billing=cancelled`,
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown checkout error'
}

function logCheckoutError(message: string, input: { error?: unknown; organizationId?: string; plan?: BillingPlan }) {
  console.error('Stripe checkout failed', {
    message,
    organizationId: input.organizationId,
    plan: input.plan,
    error: input.error ? getErrorMessage(input.error) : undefined,
  })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }

  const profile = await getCurrentProfile()

  if (!profile) {
    return NextResponse.json({ error: 'Complete onboarding before starting checkout.' }, { status: 409 })
  }

  const body = (await request.json().catch(() => null)) as { plan?: unknown } | null

  const requestedPlan = parseBillingPlan(body?.plan)
  const plan = requestedPlan ?? parseBillingPlan(profile.organization.plan)

  if (!plan) {
    return NextResponse.json({ error: 'Choose a valid billing plan before checkout.' }, { status: 400 })
  }

  const environment = validateCheckoutEnvironment()

  if ('error' in environment) {
    logCheckoutError(environment.error, { organizationId: profile.organization_id, plan })
    return NextResponse.json({ error: 'Billing configuration is incomplete.' }, { status: 503 })
  }

  const { successUrl, cancelUrl } = getCheckoutUrls(environment.appUrl)
  const supabase = await createClient()
  let customerId = profile.organization.stripe_customer_id

  try {
    if (!customerId) {
      const customer = await createStripeCustomer({
        email: user.email,
        name: profile.company_profile?.company_name ?? profile.organization.name,
        organizationId: profile.organization_id,
      })
      customerId = customer.id

      const { error } = await supabase.rpc('set_organization_stripe_customer', {
        p_organization_id: profile.organization_id,
        p_stripe_customer_id: customerId,
      })

      if (error) {
        throw new Error(error.message)
      }
    }

    const session = await createSubscriptionCheckoutSession({
      customerId,
      organizationId: profile.organization_id,
      plan,
      successUrl,
      cancelUrl,
    })

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL.')
    }

    return NextResponse.json({ url: session.url })
  } catch (error) {
    logCheckoutError('Unable to create Stripe Checkout session.', {
      error,
      organizationId: profile.organization_id,
      plan,
    })
    return NextResponse.json({ error: 'Unable to create Stripe Checkout session.' }, { status: 502 })
  }
}
