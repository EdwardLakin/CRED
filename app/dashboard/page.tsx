import Link from 'next/link'

import { signOut } from './actions'
import { ThemeToggle } from '@/components/theme'
import { Button, Card } from '@/components/ui'
import { isBillingPlan } from '@/features/billing'
import { DashboardCheckoutLauncher } from '@/features/billing/components/DashboardCheckoutLauncher'
import { EmptyState, SessionCard } from '@/features/sessions'
import { requireSessionWorkspace } from '@/features/sessions/data'

interface DashboardPageProps {
  searchParams: Promise<{ billing?: string; checkout?: string }>
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { billing, checkout } = await searchParams
  const checkoutPlan = isBillingPlan(checkout) ? checkout : undefined
  const { supabase, profile } = await requireSessionWorkspace()
  const industry = profile.organization.industry || 'Not set'
  const { data: sessions, error } = await supabase
    .from('documentation_sessions')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    throw new Error(error.message)
  }

  const recentSessions = sessions ?? []
  const currentPlan = profile.organization.plan ?? 'Free trial'
  const subscriptionStatus = profile.organization.subscription_status ?? 'not started'
  const periodEnd = profile.organization.current_period_end
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
        new Date(profile.organization.current_period_end),
      )
    : null

  return (
    <main className="page-shell dashboard-shell">
      <DashboardCheckoutLauncher plan={checkoutPlan} />
      {billing === 'success' ? <div className="success">Billing checkout completed. Your subscription is being synced.</div> : null}
      <section className="hero-card">
        <div>
          <p className="eyebrow">Documentation workflow</p>
          <h1>Capture evidence and establish the timeline.</h1>
          <p className="hero-copy">
            Welcome back, {profile.full_name}. Start a documentation session, record field details, and keep
            work organized by status.
          </p>
        </div>
        <Link href="/dashboard/sessions/new" className="button button-primary touch-target hero-action">
          New Documentation Session
        </Link>
      </section>

      <Card className="dashboard-card workspace-card">
        <div className="dashboard-grid">
          <div>
            <strong>User</strong>
            <p className="muted">{profile.full_name}</p>
          </div>
          <div>
            <strong>Organization</strong>
            <p className="muted">{profile.organization.name}</p>
          </div>
          <div>
            <strong>Industry</strong>
            <p className="muted">{industry}</p>
          </div>
          <div className="workspace-actions">
            <ThemeToggle />
            <form action={signOut} className="sign-out-form">
              <Button type="submit" variant="secondary">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </Card>



      <Card className="dashboard-card workspace-card billing-state-card">
        <div className="dashboard-grid">
          <div>
            <strong>Current plan</strong>
            <p className="muted plan-name">{currentPlan}</p>
          </div>
          <div>
            <strong>Billing status</strong>
            <p className="muted">{subscriptionStatus}</p>
          </div>
          <div>
            <strong>Renews through</strong>
            <p className="muted">{periodEnd ?? 'Pending checkout'}</p>
          </div>
          <div className="workspace-actions">
            <Link href="/#pricing" className="button button-secondary billing-manage-button">
              Upgrade / Manage Billing
            </Link>
          </div>
        </div>
      </Card>

      <section className="stack" aria-label="Recent sessions">
        <div className="section-header">
          <div>
            <h2>Recent Sessions</h2>
            <p className="muted">Newest documentation sessions for your organization.</p>
          </div>
          <Link href="/dashboard/sessions" className="secondary-link touch-target">
            View all
          </Link>
        </div>

        {recentSessions.length > 0 ? (
          <div className="session-list-grid">
            {recentSessions.map((session) => (
              <SessionCard key={session.id} session={session} dateMode="created" />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Start your first documentation session"
            description="Create a session to capture asset details, observations, and status in one secure organization workspace."
            actionHref="/dashboard/sessions/new"
            actionLabel="New Documentation Session"
          />
        )}
      </section>
    </main>
  )
}
