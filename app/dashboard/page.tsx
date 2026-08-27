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

function getItemCounts(items: Array<{ documentation_session_id: string }> | null) {
  const itemCountBySession = new Map<string, number>()

  for (const item of items ?? []) {
    itemCountBySession.set(
      item.documentation_session_id,
      (itemCountBySession.get(item.documentation_session_id) ?? 0) + 1,
    )
  }

  return itemCountBySession
}

function getContinueSession(sessions: Parameters<typeof getSessionWorkflowState>[0][]) {
  return sessions.find((session) => getSessionWorkflowState(session) === 'capturing') ?? sessions[0]
}

function getDashboardAction(session: Parameters<typeof getSessionWorkflowState>[0] | undefined) {
  if (!session) {
    return { label: 'No Active Session', title: 'Start New Session', description: 'Create a clean workspace for photos, notes, forms, and documents.', href: null }
  }

  const state = getSessionWorkflowState(session)
  if (state === 'ready') return { label: 'Ready', title: 'Export Report', description: 'Your approved report is ready to download or share.', href: `/dashboard/sessions/${session.id}/export` }
  if (state === 'review_required') return { label: 'Review Required', title: 'Resume Review', description: 'Resolve review items and move the report toward delivery.', href: `/dashboard/sessions/${session.id}/report` }
  return { label: 'In Progress', title: 'Continue Current Session', description: 'Keep adding items to the active report.', href: `/dashboard/sessions/${session.id}/capture` }
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
  const dashboardAction = getDashboardAction(continueSession)
  const sessionIds = recentSessions.map((session) => session.id)
  const { data: items } = sessionIds.length > 0
    ? await supabase
        .from('documentation_items')
        .select('documentation_session_id')
        .eq('organization_id', profile.organization_id)
        .in('documentation_session_id', sessionIds)
        .eq('item_kind', 'observation')
        .is('deleted_at', null)
    : { data: null }

  const itemCountBySession = getItemCounts(items)
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
          <p className="eyebrow">Field documentation workspace</p>
          <h1>{dashboardAction.title}</h1>
          <p className="hero-copy">{dashboardAction.description}</p>
        </div>
        <div className="primary-action-panel" aria-label="Start or continue work">
          {dashboardAction.href ? (
            <Link href={dashboardAction.href} className="start-option-card action-card-primary touch-target">
              <span className="action-kicker">{dashboardAction.label}</span>
              <strong>{dashboardAction.title}</strong>
              <span>{dashboardAction.description}</span>
              <div className="workflow-mini" aria-label="Workflow"><span>Capture</span><span>Review</span><span>Approve</span><span>Export</span></div>
            </Link>
          ) : (
            <form action={createQuickCaptureSession}>
              <button className="start-option-card action-card-primary touch-target start-option-button">
                <span className="action-kicker">No Active Session</span>
                <strong>Start New Session</strong>
                <span>Capture items, review the report, approve it, and export.</span>
              </button>
            </form>
          )}
          <form action={createQuickCaptureSession}>
            <button className="start-option-card action-card-secondary touch-target start-option-button">
              <strong>New Session</strong>
              <span>Start a separate inspection record.</span>
            </button>
          </form>
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
                evidenceCount={itemCountBySession.get(session.id) ?? 0}
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
              <p className="muted">Press New Session and begin adding items. No setup required.</p>
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
