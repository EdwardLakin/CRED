import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Card } from '@/components/ui'
import { SessionCard } from '@/features/sessions'
import { requireSessionWorkspace } from '@/features/sessions/data'

interface DashboardPageProps {
  searchParams: Promise<{ billing?: string; checkout?: string; error?: string }>
}

const startOptions = [
  { href: '/dashboard/sessions/new?type=inspection', label: 'New Inspection', description: 'Start from an inspection context.' },
  { href: '/dashboard/sessions/new?type=field_service_report', label: 'New Service Report', description: 'Start from a service report context.' },
  { href: '/dashboard/sessions/new', label: 'New Documentation Session', description: 'Start with general evidence documentation.' },
]

function getLatestDraftStatuses(
  drafts: Array<{ documentation_session_id: string; status: string; updated_at: string }> | null,
) {
  const latestDraftStatusBySession = new Map<string, string>()

  for (const draft of drafts ?? []) {
    if (!latestDraftStatusBySession.has(draft.documentation_session_id)) {
      latestDraftStatusBySession.set(draft.documentation_session_id, draft.status)
    }
  }

  return latestDraftStatusBySession
}

function getCaptureCounts(captures: Array<{ documentation_session_id: string }> | null) {
  const captureCountBySession = new Map<string, number>()

  for (const capture of captures ?? []) {
    captureCountBySession.set(
      capture.documentation_session_id,
      (captureCountBySession.get(capture.documentation_session_id) ?? 0) + 1,
    )
  }

  return captureCountBySession
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { billing, checkout, error: dashboardError } = await searchParams

  if (billing || checkout) {
    const params = new URLSearchParams()
    if (billing) params.set('billing', billing)
    if (checkout) params.set('checkout', checkout)
    redirect(`/dashboard/billing?${params.toString()}`)
  }

  const { supabase, profile } = await requireSessionWorkspace()
  const { data: sessions, error } = await supabase
    .from('documentation_sessions')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .order('updated_at', { ascending: false })
    .limit(5)

  if (error) {
    throw new Error(error.message)
  }

  const recentSessions = sessions ?? []
  const sessionIds = recentSessions.map((session) => session.id)
  const [{ data: captures }, { data: drafts }] = sessionIds.length > 0
    ? await Promise.all([
        supabase
          .from('capture_items')
          .select('documentation_session_id')
          .eq('organization_id', profile.organization_id)
          .in('documentation_session_id', sessionIds)
          .is('deleted_at', null),
        supabase
          .from('ai_report_drafts')
          .select('documentation_session_id, status, updated_at')
          .eq('organization_id', profile.organization_id)
          .in('documentation_session_id', sessionIds)
          .order('updated_at', { ascending: false }),
      ])
    : [{ data: null }, { data: null }]

  const captureCountBySession = getCaptureCounts(captures)
  const latestDraftStatusBySession = getLatestDraftStatuses(drafts)

  return (
    <main className="page-shell dashboard-shell">
      {dashboardError ? <p className="error">{dashboardError}</p> : null}

      <section className="hero-card operational-hero">
        <div>
          <p className="eyebrow">Evidence documentation</p>
          <h1>Start documentation faster.</h1>
          <p className="hero-copy">
            Capture evidence, add notes, and let CRED organize the report draft after the work is done.
          </p>
          <p className="hero-copy hero-copy-guardrail">Choose a starting point. You can still capture evidence in any order.</p>
        </div>
        <div className="start-option-grid" aria-label="Start a documentation session">
          {startOptions.map((option) => (
            <Link key={option.href} href={option.href} className="start-option-card touch-target">
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="stack" aria-label="Recent sessions">
        <div className="section-header">
          <div>
            <h2>Recent Sessions</h2>
            <p className="muted">Resume capture work or review the latest report drafts for your organization.</p>
          </div>
          <Link href="/dashboard/sessions" className="secondary-link touch-target">
            View all
          </Link>
        </div>

        {recentSessions.length > 0 ? (
          <div className="session-list-grid">
            {recentSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                evidenceCount={captureCountBySession.get(session.id)}
                aiDraftStatus={latestDraftStatusBySession.get(session.id)}
                showOperationalAction
              />
            ))}
          </div>
        ) : (
          <Card className="dashboard-card dashboard-empty-card">
            <div className="empty-state session-empty-state">
              <div className="empty-icon" aria-hidden="true">
                📋
              </div>
              <h2>Start your first documentation session.</h2>
              <p className="muted">Choose a starting point now, then capture evidence naturally and add report context when it helps.</p>
            </div>
            <div className="empty-start-actions" aria-label="Start your first documentation session">
              {startOptions.map((option) => (
                <Link key={option.href} href={option.href} className="button button-primary touch-target">
                  {option.label}
                </Link>
              ))}
            </div>
            <Link href="/dashboard/templates" className="secondary-link touch-target empty-secondary-link">
              Manage Form Profiles
            </Link>
          </Card>
        )}
      </section>
    </main>
  )
}
