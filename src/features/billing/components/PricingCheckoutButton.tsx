'use client'

import { useRouter } from 'next/navigation'
import { type ReactNode, useState } from 'react'

import type { BillingPlan } from '@/features/billing'

interface PricingCheckoutButtonProps {
  plan: BillingPlan
  isAuthenticated: boolean
  children: ReactNode
}

export function PricingCheckoutButton({ plan, isAuthenticated, children }: PricingCheckoutButtonProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function startCheckout() {
    setError(null)

    if (!isAuthenticated) {
      router.push(`/sign-up?plan=${plan}`)
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const payload = (await response.json()) as { url?: string; error?: string }

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? 'Unable to start checkout.')
      }

      window.location.href = payload.url
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to start checkout.')
      setIsLoading(false)
    }
  }

  return (
    <div className="pricing-action-stack">
      <button type="button" className="button button-primary pricing-button" onClick={startCheckout} disabled={isLoading}>
        {isLoading ? 'Opening checkout…' : children}
      </button>
      {error ? <p className="error pricing-error">{error}</p> : null}
    </div>
  )
}
