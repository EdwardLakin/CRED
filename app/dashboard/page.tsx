import Link from 'next/link'

import { signOut } from './actions'
import { Button, Card } from '@/components/ui'
import { EmptyState, SessionCard } from '@/features/sessions'
import { requireSessionWorkspace } from '@/features/sessions/data'

export default async function DashboardPage() {
  const { supabase, profile } = await requireSessionWorkspace()
  const industry = profile.company_profile?.industry ?? 'Not set'
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

  return (
    <main className="page-shell dashboard-shell">
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
          <form action={signOut} className="sign-out-form">
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
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
