'use client'

import { getPlanDisplayName, type BillingPlan } from '@/features/billing'
import { BillingCheckoutButton } from './BillingCheckoutButton'

interface DashboardCheckoutLauncherProps {
  plan?: BillingPlan
}

export function DashboardCheckoutLauncher({ plan }: DashboardCheckoutLauncherProps) {
  if (!plan) {
    return null
  }

  return (
    <div className="success billing-launcher" role="status">
      <span>Ready to start {getPlanDisplayName(plan) ?? plan} checkout.</span>
      <BillingCheckoutButton plan={plan} className="button button-primary billing-manage-button">
        Start Checkout
      </BillingCheckoutButton>
    </div>
  )
}
