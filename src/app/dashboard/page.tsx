import { Button, Card } from '@/components/ui'
import { requireProfile } from '@/features/auth/server'

import { signOut } from './actions'

export default async function DashboardPage() {
  const profile = await requireProfile()
  const industry = profile.company_profile?.industry ?? 'Not set'

  return (
    <main className="page-shell">
      <Card className="dashboard-card">
        <div className="stack">
          <div className="header-row">
            <div>
              <h1>Dashboard</h1>
              <p className="muted">Welcome back, {profile.full_name}.</p>
            </div>
            <form action={signOut}>
              <Button type="submit" variant="secondary">
                Sign out
              </Button>
            </form>
          </div>

          <section className="stack" aria-label="Workspace details">
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
          </section>

          <div className="empty-state">Ready to create your first documentation session.</div>
        </div>
      </Card>
    </main>
  )
}
