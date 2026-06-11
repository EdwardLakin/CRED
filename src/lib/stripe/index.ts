import { createHmac, timingSafeEqual } from 'crypto'

export type BillingPlan = 'starter' | 'pro' | 'business'

export const BILLING_PLANS: Record<
  BillingPlan,
  { name: string; price: string; envKey: 'STRIPE_PRICE_STARTER' | 'STRIPE_PRICE_PRO' | 'STRIPE_PRICE_BUSINESS' }
> = {
  starter: { name: 'Starter', price: '$49/month', envKey: 'STRIPE_PRICE_STARTER' },
  pro: { name: 'Pro', price: '$99/month', envKey: 'STRIPE_PRICE_PRO' },
  business: { name: 'Business', price: '$199/month', envKey: 'STRIPE_PRICE_BUSINESS' },
}

interface StripeCustomer {
  id: string
}

export interface StripeCheckoutSession {
  id: string
  url: string | null
  customer: string | StripeCustomer | null
  subscription: string | StripeSubscription | null
  metadata?: Record<string, string> | null
}

export interface StripeSubscription {
  id: string
  customer: string | StripeCustomer
  status: string
  current_period_end?: number | null
  metadata?: Record<string, string> | null
}

export interface StripeInvoice {
  customer: string | StripeCustomer | null
  subscription?: string | StripeSubscription | null
}

export interface StripeEvent {
  id: string
  type: string
  data: {
    object: StripeCheckoutSession | StripeSubscription | StripeInvoice
  }
}

export function isBillingPlan(value: unknown): value is BillingPlan {
  return value === 'starter' || value === 'pro' || value === 'business'
}

export function getStripeSecretKey() {
  const value = process.env.STRIPE_SECRET_KEY

  if (!value) {
    throw new Error('Missing STRIPE_SECRET_KEY')
  }

  return value
}

export function getStripeWebhookSecret() {
  const value = process.env.STRIPE_WEBHOOK_SECRET

  if (!value) {
    throw new Error('Missing STRIPE_WEBHOOK_SECRET')
  }

  return value
}

export function getStripePriceId(plan: BillingPlan) {
  const value = process.env[BILLING_PLANS[plan].envKey]

  if (!value) {
    throw new Error(`Missing ${BILLING_PLANS[plan].envKey}`)
  }

  return value
}

export function getStripeId(value: string | { id: string } | null | undefined) {
  if (!value) {
    return null
  }

  return typeof value === 'string' ? value : value.id
}

function stripeFormBody(values: Record<string, string | number | boolean | null | undefined>) {
  const body = new URLSearchParams()

  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      body.append(key, String(value))
    }
  })

  return body
}

async function stripeRequest<T>(path: string, values: Record<string, string | number | boolean | null | undefined>) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: stripeFormBody(values),
  })

  const payload = (await response.json()) as T & { error?: { message?: string } }

  if (!response.ok) {
    throw new Error(payload.error?.message ?? 'Stripe request failed')
  }

  return payload
}

export async function createStripeCustomer(input: { email?: string; name?: string; organizationId: string }) {
  return stripeRequest<StripeCustomer>('customers', {
    email: input.email,
    name: input.name,
    'metadata[organization_id]': input.organizationId,
  })
}

export async function createSubscriptionCheckoutSession(input: {
  customerId: string
  organizationId: string
  plan: BillingPlan
  successUrl: string
  cancelUrl: string
}) {
  return stripeRequest<StripeCheckoutSession>('checkout/sessions', {
    mode: 'subscription',
    customer: input.customerId,
    'line_items[0][price]': getStripePriceId(input.plan),
    'line_items[0][quantity]': 1,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    'metadata[organization_id]': input.organizationId,
    'metadata[plan]': input.plan,
    'subscription_data[metadata][organization_id]': input.organizationId,
    'subscription_data[metadata][plan]': input.plan,
  })
}

export function verifyStripeWebhookPayload(payload: string, signatureHeader: string | null) {
  if (!signatureHeader) {
    throw new Error('Missing Stripe-Signature header')
  }

  const timestamp = signatureHeader
    .split(',')
    .find((part) => part.startsWith('t='))
    ?.slice(2)
  const signatures = signatureHeader
    .split(',')
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3))

  if (!timestamp || signatures.length === 0) {
    throw new Error('Invalid Stripe-Signature header')
  }

  const signedPayload = `${timestamp}.${payload}`
  const expectedSignature = createHmac('sha256', getStripeWebhookSecret()).update(signedPayload).digest('hex')
  const expected = Buffer.from(expectedSignature, 'hex')

  const hasMatch = signatures.some((signature) => {
    const actual = Buffer.from(signature, 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  })

  if (!hasMatch) {
    throw new Error('Stripe webhook signature verification failed')
  }

  return JSON.parse(payload) as StripeEvent
}
