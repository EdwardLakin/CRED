import { NextResponse } from 'next/server'

import {
  getStripeId,
  parseBillingPlan,
  type StripeCheckoutSession,
  type StripeInvoice,
  type StripeSubscription,
  verifyStripeWebhookPayload,
} from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function unixToIso(value: number | null | undefined) {
  return value ? new Date(value * 1000).toISOString() : null
}

async function updateSubscription(input: {
  organizationId?: string | null
  customerId?: string | null
  subscriptionId?: string | null
  plan?: string | null
  status?: string | null
  currentPeriodEnd?: string | null
}) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('sync_organization_subscription', {
    p_organization_id: input.organizationId ?? null,
    p_stripe_customer_id: input.customerId ?? null,
    p_stripe_subscription_id: input.subscriptionId ?? null,
    p_plan: input.plan ?? null,
    p_subscription_status: input.status ?? null,
    p_current_period_end: input.currentPeriodEnd ?? null,
  })

  if (error) {
    throw new Error(error.message)
  }
}

async function handleCheckoutCompleted(session: StripeCheckoutSession) {
  const plan = parseBillingPlan(session.metadata?.plan)

  await updateSubscription({
    organizationId: session.metadata?.organization_id,
    customerId: getStripeId(session.customer),
    subscriptionId: getStripeId(session.subscription),
    plan,
    status: 'checkout_completed',
  })
}

async function handleSubscription(subscription: StripeSubscription) {
  const plan = parseBillingPlan(subscription.metadata?.plan)

  await updateSubscription({
    organizationId: subscription.metadata?.organization_id,
    customerId: getStripeId(subscription.customer),
    subscriptionId: subscription.id,
    plan,
    status: subscription.status,
    currentPeriodEnd: unixToIso(subscription.current_period_end),
  })
}

async function handlePaymentFailed(invoice: StripeInvoice) {
  await updateSubscription({
    customerId: getStripeId(invoice.customer),
    subscriptionId: getStripeId(invoice.subscription),
    status: 'past_due',
  })
}

export async function POST(request: Request) {
  const payload = await request.text()
  const signature = request.headers.get('stripe-signature')

  let event

  try {
    event = verifyStripeWebhookPayload(payload, signature)
  } catch (error) {
    console.error('Stripe webhook verification failed', error)
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as StripeCheckoutSession)
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscription(event.data.object as StripeSubscription)
        break
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as StripeInvoice)
        break
      default:
        break
    }
  } catch (error) {
    console.error('Stripe webhook handling failed', { eventId: event.id, type: event.type, error })
    return NextResponse.json({ error: 'Webhook handler failed.' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
