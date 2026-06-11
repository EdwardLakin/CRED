'use client'

import { type ReactNode, useState } from 'react'

import { getPlanDisplayName, type BillingPlan } from '@/features/billing'

const CHECKOUT_ERROR_MESSAGE = 'Checkout could not be started. Please check billing configuration.'

interface BillingCheckoutButtonProps {
  plan: BillingPlan
  children?: ReactNode
  className?: string
  loadingText?: string
}

export function BillingCheckoutButton({
  plan,
  children,
  className = 'button button-primary',
  loadingText,
}: BillingCheckoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function startCheckout() {
    setError(null)
    setIsLoading(true)

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null

      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error ?? CHECKOUT_ERROR_MESSAGE)
      }

      window.location.href = payload.url
    } catch (checkoutError) {
      console.error('Checkout start failed', checkoutError)
      setError(CHECKOUT_ERROR_MESSAGE)
      setIsLoading(false)
    }
  }

  const planName = getPlanDisplayName(plan) ?? plan

  return (
    <div className="billing-checkout-action-stack">
      <button type="button" className={className} onClick={startCheckout} disabled={isLoading}>
        {isLoading ? loadingText ?? `Opening ${planName} checkout…` : children ?? 'Subscribe Now'}
      </button>
      {error ? <p className="error billing-checkout-error">{error}</p> : null}
    </div>
  )
}
