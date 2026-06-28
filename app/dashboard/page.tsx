import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Card } from '@/components/ui'
import { SessionCard } from '@/features/sessions'
import { getSessionWorkflowState } from '@/features/sessions/status'
import { createQuickCaptureSession } from '@/features/sessions/actions'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { loadCurrentReportDraftsBySession } from '@/features/sessions/report-title-data'

interface DashboardPageProps {
  searchParams: Promise<{ billing?: string; checkout?: string; error?: string; notice?: string }>
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

function getContinueSession(sessions: Parameters<typeof getSessionWorkflowState>[0][]) {
  return sessions.find((session) => getSessionWorkflowState(session) === 'capturing') ?? sessions[0]
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { billing, checkout, error: dashboardError, notice } = await searchParams

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
    .is('deleted_at', null)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(6)

  if (error) {
    throw new Error(error.message)
  }

  const recentSessions = sessions ?? []
  const continueSession = getContinueSession(recentSessions)
  const sessionIds = recentSessions.map((session) => session.id)
  const { data: captures } = sessionIds.length > 0
    ? await supabase
        .from('capture_items')
        .select('documentation_session_id')
        .eq('organization_id', profile.organization_id)
        .in('documentation_session_id', sessionIds)
        .is('deleted_at', null)
    : { data: null }

  const captureCountBySession = getCaptureCounts(captures)
  const reportDraftBySession = await loadCurrentReportDraftsBySession(
    (organizationId, ids) =>
      supabase
        .from('ai_report_drafts')
        .select('id, documentation_session_id, title, header_fields, generated_at, created_at')
        .eq('organization_id', organizationId)
        .in('documentation_session_id', ids)
        .order('generated_at', { ascending: false }),
    profile.organization_id,
    sessionIds,
  )

  return (
    <main className="page-shell dashboard-shell">
      {dashboardError ? <p className="error">{dashboardError}</p> : null}
      {notice === 'internal-admin-only' ? (
        <p className="success">That internal admin area is hidden from normal capture work. Start or continue a session below.</p>
      ) : null}

      <section className="hero-card operational-hero">
        <div>
          <h1>What do you want to work on?</h1>
        </div>
        <div className="start-option-grid" aria-label="Start or continue work">
          <form action={createQuickCaptureSession}>
            <button className="start-option-card touch-target start-option-button">
              <strong>New Session</strong>
              <span>Start capturing now.</span>
            </button>
          </form>
          {continueSession ? (
            <Link href={`/dashboard/sessions/${continueSession.id}/capture`} className="start-option-card touch-target">
              <strong>Continue Session</strong>
              <span>Keep adding evidence.</span>
            </Link>
          ) : null}
        </div>
      </section>


      <section className="card stack" aria-label="Offline Home Screen setup">
        <div className="section-header">
          <div>
            <h2>Offline Home Screen app</h2>
            <p className="muted">On iPhone or iPad, add CRED to the Home Screen from the dedicated Offline Install page—not from Dashboard or the root page—so Airplane Mode launches the cached offline shell.</p>
          </div>
          <Link href="/offline.html" className="button button-primary touch-target">
            Set up offline Home Screen app
          </Link>
        </div>
      </section>

      <section className="stack" aria-label="Recent sessions">
        <div className="section-header">
          <div>
            <h2>Recent Sessions</h2>
            <p className="muted">Open the most recent work or start fresh.</p>
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
                showOperationalAction
                showArchiveAction
                showManagementActions
                timeZone={profile.timezone}
                currentReport={reportDraftBySession.get(session.id)}
              />
            ))}
          </div>
        ) : (
          <Card className="dashboard-card dashboard-empty-card">
            <div className="empty-state session-empty-state">
              <div className="empty-icon" aria-hidden="true">
                📄
              </div>
              <h2>Start your first session.</h2>
              <p className="muted">Press New Session and begin capturing evidence. No setup required.</p>
            </div>
            <form action={createQuickCaptureSession} className="empty-start-actions" aria-label="Start your first session">
              <button className="button button-primary touch-target">New Session</button>
            </form>
          </Card>
        )}
      </section>
    </main>
  )
}
