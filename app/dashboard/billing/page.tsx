import { Card } from '@/components/ui'
import { BILLING_PLANS, getOrganizationBillingAccess, getPlanDisplayName, parseBillingPlan } from '@/features/billing'
import { BillingCheckoutButton } from '@/features/billing/components/BillingCheckoutButton'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { UsageSummaryCard } from '@/features/usage'

interface BillingPageProps {
  searchParams: Promise<{ billing?: string; checkout?: string; error?: string }>
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = await searchParams
  const checkoutPlan = parseBillingPlan(params.checkout) ?? undefined
  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = getOrganizationBillingAccess(profile.organization)
  const billingPlan = parseBillingPlan(billingAccess.plan) ?? 'individual'
  const currentPlan = getPlanDisplayName(profile.organization.plan) ?? 'Individual'
  const subscriptionStatus = profile.organization.subscription_status ?? 'not started'
  const selectedCheckoutPlan = checkoutPlan ?? billingPlan
  const billingButtonLabel = subscriptionStatus === 'active' ? 'Manage Billing' : 'Subscribe Now'
  const dateFormatter = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' })
  const trialEndsAt = profile.organization.trial_ends_at
    ? dateFormatter.format(new Date(profile.organization.trial_ends_at))
    : 'Expired'

  return (
    <main className="page-shell dashboard-shell">
      {params.billing === 'success' ? <div className="success">Billing checkout completed. Your subscription is being synced.</div> : null}
      {params.billing === 'cancelled' ? <div className="success">Checkout was cancelled. You can start again when you are ready.</div> : null}
      {params.error ? <p className="error">{params.error}</p> : null}
      {checkoutPlan ? (
        <Card className="dashboard-card billing-checkout-callout">
          <div className="section-header">
            <div>
              <strong>Ready to subscribe to {getPlanDisplayName(checkoutPlan)}?</strong>
              <p className="muted">Start checkout when you are ready. Your workspace remains available during the trial.</p>
            </div>
            <BillingCheckoutButton plan={checkoutPlan} className="button button-primary billing-manage-button">
              Start Checkout
            </BillingCheckoutButton>
          </div>
        </Card>
      ) : null}

      <div className="section-header page-header">
        <div>
          <p className="eyebrow">Billing</p>
          <h1>Plan and subscription</h1>
          <p className="muted">Manage plan visibility, trial status, usage, and checkout access from one dashboard page.</p>
        </div>
      </div>

      <Card className="dashboard-card workspace-card billing-state-card">
        <div className="dashboard-grid">
          <div>
            <strong>Current Plan</strong>
            <p className="muted plan-name">{currentPlan}</p>
          </div>
          <div>
            <strong>Subscription Status</strong>
            <p className="muted">{subscriptionStatus}</p>
          </div>
          <div>
            <strong>Trial ends date</strong>
            <p className="muted">{trialEndsAt}</p>
          </div>
          <div>
            <strong>Access</strong>
            <p className="muted">{billingAccess.hasAccess ? 'Active' : 'Checkout required'}</p>
          </div>
          <div className="workspace-actions">
            {subscriptionStatus === 'active' ? (
              <button type="button" className="button button-secondary billing-manage-button" disabled>
                {billingButtonLabel}
              </button>
            ) : (
              <BillingCheckoutButton plan={selectedCheckoutPlan} className="button button-secondary billing-manage-button">
                {billingButtonLabel}
              </BillingCheckoutButton>
            )}
          </div>
        </div>
      </Card>

      <UsageSummaryCard organizationId={profile.organization_id} plan={billingPlan} supabase={supabase} />

      {billingAccess.trialExpired ? (
        <p className="error">Your trial has ended. Subscribe to continue.</p>
      ) : null}

      <section className="billing-plan-grid" aria-label="Billing plans">
        {Object.entries(BILLING_PLANS).map(([plan, details]) => (
          <Card className="dashboard-card billing-plan-card" key={plan}>
            <div>
              <p className="eyebrow">{plan === billingPlan ? 'Current selection' : 'Available plan'}</p>
              <h2>{details.name}</h2>
              <p className="plan-price">{details.price}</p>
              <p className="muted">Start checkout for the {details.name} plan when your organization is ready.</p>
            </div>
            {subscriptionStatus === 'active' && plan === billingPlan ? (
              <button type="button" className="button button-secondary touch-target" disabled>
                Active Plan
              </button>
            ) : (
              <BillingCheckoutButton plan={parseBillingPlan(plan) ?? 'individual'} className="button button-primary touch-target">
                Choose {details.name}
              </BillingCheckoutButton>
            )}
          </Card>
        ))}
      </section>
    </main>
  )
}
