import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SessionStatusBadge, formatDateTime } from '@/features/sessions'
import { archiveDocumentationSession, restoreDocumentationSession } from '@/features/sessions/actions'
import { requireSessionWorkspace } from '@/features/sessions/data'

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const { id } = await params
  const { error, saved } = await searchParams
  const { supabase, profile } = await requireSessionWorkspace()
  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('*')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) {
    notFound()
  }

  const { count: evidenceCount } = await supabase
    .from('capture_items')
    .select('id', { count: 'exact', head: true })
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)

  const isArchived = Boolean(session.archived_at)
  const archiveAction = archiveDocumentationSession.bind(null, session.id)
  const restoreAction = restoreDocumentationSession.bind(null, session.id)

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <Link href="/dashboard" className="secondary-link touch-target">
            ← Dashboard
          </Link>
          <div className="title-row">
            <h1>{session.title}</h1>
            <SessionStatusBadge status={isArchived ? 'archived' : session.status} />
          </div>
          <p className="muted">Updated {formatDateTime(session.updated_at ?? session.created_at, profile.timezone)} · {evidenceCount ?? 0} saved</p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {saved ? <p className="success">Saved.</p> : null}

      <section className="card detail-card form-stack">
        <div>
          <p className="eyebrow">Session</p>
          <h2>What do you want to do?</h2>
          <p className="muted">Capture evidence, review the report CRED generated, or export when approved.</p>
        </div>
        <div className="form-actions">
          <Link href={`/dashboard/sessions/${session.id}/capture`} className="button button-primary touch-target">
            Capture Evidence
          </Link>
          <Link href={`/dashboard/sessions/${session.id}/report`} className="button button-primary touch-target">
            Review Report
          </Link>
          <form action={isArchived ? restoreAction : archiveAction}>
            <button className="button button-secondary touch-target">
              {isArchived ? 'Restore Session' : 'Archive Session'}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
