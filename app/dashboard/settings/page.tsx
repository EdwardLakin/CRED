import Link from 'next/link'

import { ThemeToggle } from '@/components/theme'
import { Card } from '@/components/ui'
import { getPlanDisplayName } from '@/features/billing'
import { requireSessionWorkspace } from '@/features/sessions/data'

export default async function SettingsPage() {
  const { profile } = await requireSessionWorkspace()
  const organization = profile.organization
  const industry = organization.industry || 'Not set'
  const plan = getPlanDisplayName(organization.plan) ?? 'Individual'

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Workspace settings</h1>
          <p className="muted">Manage organization defaults, templates, billing, and your workspace experience.</p>
        </div>
        <div className="page-actions">
          <ThemeToggle />
        </div>
      </div>

      <Card className="dashboard-card workspace-card">
        <div className="dashboard-grid settings-summary-grid">
          <div>
            <strong>Organization</strong>
            <p className="muted">{organization.name}</p>
          </div>
          <div>
            <strong>Industry</strong>
            <p className="muted">{industry}</p>
          </div>
          <div>
            <strong>Plan</strong>
            <p className="muted plan-name">{plan}</p>
          </div>
          <div>
            <strong>Signed in as</strong>
            <p className="muted">{profile.full_name}</p>
          </div>
        </div>
      </Card>

      <section className="settings-link-grid" aria-label="Settings areas">
        <Link href="/dashboard/templates" className="card settings-link-card touch-target">
          <span className="eyebrow">Templates</span>
          <h2>Template management</h2>
          <p className="muted">Import, edit, duplicate, archive, and delete reusable documentation workflow templates.</p>
        </Link>
        <Link href="/dashboard/billing" className="card settings-link-card touch-target">
          <span className="eyebrow">Billing</span>
          <h2>Plan and subscription</h2>
          <p className="muted">Review current billing status and choose the plan that fits your organization.</p>
        </Link>
      </section>
    </main>
  )
}
