import Link from 'next/link'

import { signOut } from '../actions'
import { ThemeToggle } from '@/components/theme'
import { Button, Card } from '@/components/ui'
import { requireSessionWorkspace } from '@/features/sessions/data'

export default async function SettingsPage() {
  const { profile } = await requireSessionWorkspace()
  const organization = profile.organization
  const industry = organization.industry || 'Not set'

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Workspace settings</h1>
          <p className="muted">Manage account details, organization context, display preferences, and workspace controls.</p>
        </div>
      </div>

      <Card className="dashboard-card workspace-card">
        <div className="dashboard-grid settings-summary-grid">
          <div>
            <strong>User</strong>
            <p className="muted">{profile.full_name}</p>
          </div>
          <div>
            <strong>Organization</strong>
            <p className="muted">{organization.name}</p>
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

      <section className="settings-link-grid" aria-label="Settings areas">
        <Link href="/dashboard/templates" className="card settings-link-card touch-target">
          <span className="eyebrow">Form Profiles</span>
          <h2>Form Profile management</h2>
          <p className="muted">Import, edit, duplicate, archive, and delete reusable form profiles for report context.</p>
        </Link>
        <Link href="/dashboard/billing" className="card settings-link-card touch-target">
          <span className="eyebrow">Billing</span>
          <h2>Plan and subscription</h2>
          <p className="muted">Review current billing status, usage, storage, AI actions, email sends, and checkout access.</p>
        </Link>
      </section>
    </main>
  )
}
