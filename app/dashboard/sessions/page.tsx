import Link from 'next/link'

import { EmptyState, SessionCard } from '@/features/sessions'
import { createQuickCaptureSession } from '@/features/sessions/actions'
import { requireSessionWorkspace } from '@/features/sessions/data'

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

type SessionFilter = 'active' | 'completed' | 'archived'

function normalizeFilter(value: string | undefined): SessionFilter {
  return value === 'completed' || value === 'archived' ? value : 'active'
}

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const { q, filter } = await searchParams
  const sessionFilter = normalizeFilter(filter)
  const searchTerm = q?.trim() ?? ''
  const querySearchTerm = searchTerm.replace(/[%,]/g, ' ').trim()
  const { supabase, profile } = await requireSessionWorkspace()

  let query = supabase
    .from('documentation_sessions')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (sessionFilter === 'archived') {
    query = query.not('archived_at', 'is', null)
  } else {
    query = query.is('archived_at', null)
    if (sessionFilter === 'completed') {
      query = query.or('status.eq.finalized,review_status.eq.ready_for_delivery')
    } else {
      query = query.not('status', 'eq', 'finalized').not('review_status', 'eq', 'ready_for_delivery')
    }
  }

  if (querySearchTerm) {
    query = query.or(`title.ilike.%${querySearchTerm}%,display_id.ilike.%${querySearchTerm}%,customer_name.ilike.%${querySearchTerm}%,asset_label.ilike.%${querySearchTerm}%,unit_number.ilike.%${querySearchTerm}%,vin.ilike.%${querySearchTerm}%`)
  }

  const { data: sessions, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  const sessionResults = sessions ?? []
  const sessionIds = sessionResults.map((session) => session.id)
  const { data: captures } = sessionIds.length > 0
    ? await supabase
        .from('capture_items')
        .select('documentation_session_id')
        .eq('organization_id', profile.organization_id)
        .in('documentation_session_id', sessionIds)
        .is('deleted_at', null)
    : { data: null }
  const captureCountBySession = getCaptureCounts(captures)

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <h1>Recent Sessions</h1>
          <p className="muted">Open a session and keep moving: capture, review, export.</p>
        </div>
        <div className="page-actions">
          <form action={createQuickCaptureSession}>
            <button className="button button-primary touch-target">New Session</button>
          </form>
          <Link href="/dashboard" className="button button-secondary touch-target">
            Dashboard
          </Link>
        </div>
      </div>

      <nav className="tab-row" aria-label="Session filters">
        {[
          ['active', 'Active'],
          ['completed', 'Completed'],
          ['archived', 'Archived'],
        ].map(([value, label]) => (
          <Link key={value} href={`/dashboard/sessions?filter=${value}${searchTerm ? `&q=${encodeURIComponent(searchTerm)}` : ''}`} className={sessionFilter === value ? 'button button-primary touch-target' : 'button button-secondary touch-target'}>{label}</Link>
        ))}
      </nav>

      <form action="/dashboard/sessions" className="search-card">
        <input type="hidden" name="filter" value={sessionFilter} />
        <label className="label" htmlFor="q">
          Find a session
        </label>
        <div className="search-row">
          <input id="q" name="q" type="search" defaultValue={searchTerm} placeholder="Search sessions" className="input" />
          <button className="button button-primary touch-target">Search</button>
        </div>
      </form>

      {sessionResults.length > 0 ? (
        <div className="session-list-grid">
          {sessionResults.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              evidenceCount={captureCountBySession.get(session.id)}
              showOperationalAction
              showArchiveAction
              timeZone={profile.timezone}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title={searchTerm ? 'No matching sessions' : sessionFilter === 'archived' ? 'No archived sessions' : sessionFilter === 'completed' ? 'No completed sessions' : 'No active sessions yet'}
          description={searchTerm ? 'Try a different search or start a new session.' : sessionFilter === 'archived' ? 'Archived sessions will appear here.' : sessionFilter === 'completed' ? 'Approved and exported sessions will appear here.' : 'Press New Session and start capturing evidence.'}
          actionHref="/dashboard/sessions/new"
          actionLabel="New Session"
        />
      )}
    </main>
  )
}
