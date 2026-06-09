import Link from 'next/link'

import { EmptyState, SessionCard } from '@/features/sessions'
import { requireSessionWorkspace } from '@/features/sessions/data'

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const searchTerm = q?.trim() ?? ''
  const { supabase, profile } = await requireSessionWorkspace()

  let query = supabase
    .from('documentation_sessions')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })

  if (searchTerm) {
    query = query.ilike('title', `%${searchTerm}%`)
  }

  const { data: sessions, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  const sessionResults = sessions ?? []

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <h1>Documentation Sessions</h1>
          <p className="muted">Search and open every session for your organization.</p>
        </div>
        <Link href="/dashboard/sessions/new" className="button button-primary touch-target">
          New Documentation Session
        </Link>
      </div>

      <form action="/dashboard/sessions" className="search-card">
        <label className="label" htmlFor="q">
          Search by title
        </label>
        <div className="search-row">
          <input id="q" name="q" type="search" defaultValue={searchTerm} placeholder="Search sessions" className="input" />
          <button className="button button-primary touch-target">Search</button>
        </div>
      </form>

      {sessionResults.length > 0 ? (
        <div className="session-list-grid">
          {sessionResults.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={searchTerm ? 'No matching sessions' : 'No sessions yet'}
          description={
            searchTerm
              ? 'Try a different title search or start a new documentation session.'
              : 'Create a documentation session to begin recording field details.'
          }
          actionHref="/dashboard/sessions/new"
          actionLabel="New Documentation Session"
        />
      )}
    </main>
  )
}
