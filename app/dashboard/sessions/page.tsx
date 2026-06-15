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

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const searchTerm = q?.trim() ?? ''
  const { supabase, profile } = await requireSessionWorkspace()

  let query = supabase
    .from('documentation_sessions')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .order('updated_at', { ascending: false })

  if (searchTerm) {
    query = query.ilike('title', `%${searchTerm}%`)
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

      <form action="/dashboard/sessions" className="search-card">
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
              timeZone={profile.timezone}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title={searchTerm ? 'No matching sessions' : 'No sessions yet'}
          description={searchTerm ? 'Try a different search or start a new session.' : 'Press New Session and start capturing evidence.'}
          actionHref="/dashboard/sessions/new"
          actionLabel="New Session"
        />
      )}
    </main>
  )
}
