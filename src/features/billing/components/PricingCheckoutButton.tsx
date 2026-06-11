'use client'

import { useRouter } from 'next/navigation'
import { type ReactNode } from 'react'

import type { BillingPlan } from '@/features/billing'
import { BillingCheckoutButton } from './BillingCheckoutButton'

interface PricingCheckoutButtonProps {
  plan: BillingPlan
  isAuthenticated: boolean
  children: ReactNode
}

export function PricingCheckoutButton({ plan, isAuthenticated, children }: PricingCheckoutButtonProps) {
  const router = useRouter()

  if (!isAuthenticated) {
    return (
      <div className="pricing-action-stack">
        <button
          type="button"
          className="button button-primary pricing-button"
          onClick={() => router.push(`/sign-up?plan=${plan}`)}
        >
          {children}
        </button>
      </div>
    )
  }

  return (
    <BillingCheckoutButton plan={plan} className="button button-primary pricing-button">
      {children}
    </BillingCheckoutButton>
  )
}
