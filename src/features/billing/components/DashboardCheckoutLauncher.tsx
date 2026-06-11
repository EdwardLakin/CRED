'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { BillingPlan } from '@/features/billing'

interface DashboardCheckoutLauncherProps {
  plan?: BillingPlan
}

export function DashboardCheckoutLauncher({ plan }: DashboardCheckoutLauncherProps) {
  const router = useRouter()
  const hasStarted = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!plan || hasStarted.current) {
      return
    }

    hasStarted.current = true

    async function startCheckout() {
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
        router.replace('/dashboard')
      }
    }

    void startCheckout()
  }, [plan, router])

  if (!plan) {
    return null
  }

  return (
    <div className="success billing-launcher" role="status">
      {error ?? `Preparing ${plan} checkout…`}
    </div>
  )
}
