import { NextResponse } from 'next/server'

import { getCurrentProfile, getCurrentUser } from '@/features/auth/server'
import {
  createStripeCustomer,
  createSubscriptionCheckoutSession,
  isBillingPlan,
} from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

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

  if (!isBillingPlan(body?.plan)) {
    return NextResponse.json({ error: 'Invalid billing plan.' }, { status: 400 })
  }

  const origin = request.headers.get('origin') ?? new URL(request.url).origin
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
      plan: body.plan,
      successUrl: `${origin}/dashboard?billing=success`,
      cancelUrl: `${origin}/?billing=cancelled`,
    })

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL.')
    }

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe checkout failed', error)
    return NextResponse.json({ error: 'Unable to start checkout.' }, { status: 500 })
  }
}
