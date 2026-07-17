'use client'

import { type ReactNode, useState } from 'react'

export function BillingPortalButton({
  children = 'Manage Billing',
  className = 'button button-secondary',
}: {
  children?: ReactNode
  className?: string
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openPortal() {
    setError(null)
    setIsLoading(true)
    try {
      const response = await fetch('/api/billing/portal', { method: 'POST' })
      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null
      if (!response.ok || !payload?.url) throw new Error(payload?.error ?? 'Unable to open billing portal.')
      window.location.href = payload.url
    } catch (portalError) {
      console.error('Billing portal start failed', portalError)
      setError('Billing management could not be opened. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <div className="billing-checkout-action-stack">
      <button type="button" className={className} onClick={openPortal} disabled={isLoading}>
        {isLoading ? 'Opening billing…' : children}
      </button>
      {error ? <p className="error billing-checkout-error">{error}</p> : null}
    </div>
  )
}
