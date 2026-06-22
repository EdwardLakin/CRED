import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SessionStatusBadge, formatDateTime } from '@/features/sessions'
import { archiveDocumentationSession, restoreDocumentationSession } from '@/features/sessions/actions'
import { getSessionWorkflowStatus } from '@/features/sessions/status'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { EvidenceWorkspaceNav } from '@/features/evidence/components/EvidenceWorkspaceNav'

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
    .is('deleted_at', null)
    .single()

  if (sessionError || !session) {
    notFound()
  }

  const [
    { count: evidenceCount },
    { count: timelineEventsCount },
    { count: entitiesCount },
    { count: factualObservationsCount },
    { count: relationshipsCount },
  ] = await Promise.all([
    supabase.from('capture_items').select('id', { count: 'exact', head: true }).eq('documentation_session_id', session.id).eq('organization_id', profile.organization_id).is('deleted_at', null),
    supabase.from('timeline_events').select('id', { count: 'exact', head: true }).eq('documentation_session_id', session.id).eq('organization_id', profile.organization_id).is('deleted_at', null),
    supabase.from('evidence_entities').select('id', { count: 'exact', head: true }).eq('documentation_session_id', session.id).eq('organization_id', profile.organization_id).is('deleted_at', null),
    supabase.from('evidence_assertions').select('id', { count: 'exact', head: true }).eq('documentation_session_id', session.id).eq('organization_id', profile.organization_id).is('deleted_at', null),
    supabase.from('evidence_relationships').select('id', { count: 'exact', head: true }).eq('documentation_session_id', session.id).eq('organization_id', profile.organization_id).is('deleted_at', null),
  ])

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
            <SessionStatusBadge status={getSessionWorkflowStatus(session)} />
          </div>
          <p className="muted">Created {formatDateTime(session.created_at, profile.timezone)} · Updated {formatDateTime(session.updated_at ?? session.created_at, profile.timezone)} · {evidenceCount ?? 0} saved</p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {saved ? <p className="success">Saved.</p> : null}

      <EvidenceWorkspaceNav sessionId={session.id} counts={{ evidenceItems: evidenceCount ?? 0, timelineEvents: timelineEventsCount ?? 0, entities: entitiesCount ?? 0, factualObservations: factualObservationsCount ?? 0, relationships: relationshipsCount ?? 0 }} />

      <section className="card detail-card form-stack">
        <div>
          <p className="eyebrow">Session</p>
          <h2>What do you want to do?</h2>
          <p className="muted">Capture evidence, review the report CRED generated, or export when approved.</p>
        </div>
        <div className="form-actions">
          <Link href={`/dashboard/sessions/${session.id}/capture`} className="button button-primary touch-target">
            Capture
          </Link>
          <Link href={`/dashboard/sessions/${session.id}/report`} className="button button-primary touch-target">
            Review
          </Link>
          <Link href={`/dashboard/sessions/${session.id}/evidence`} className="button button-secondary touch-target">
            Evidence Library
          </Link>
          <Link href={`/dashboard/sessions/${session.id}/timeline`} className="button button-secondary touch-target">
            Timeline
          </Link>
          <Link href={`/dashboard/sessions/${session.id}/entities`} className="button button-secondary touch-target">
            Entities
          </Link>
          <Link href={`/dashboard/sessions/${session.id}/assertions`} className="button button-secondary touch-target">
            Factual Observations
          </Link>
          <Link href={`/dashboard/sessions/${session.id}/relationships`} className="button button-secondary touch-target">
            Relationship Explorer
          </Link>
          <Link href={`/dashboard/sessions/${session.id}/deliverables`} className="button button-secondary touch-target">
            Deliverables
          </Link>
        </div>
        <details className="session-card-manage">
          <summary className="secondary-link touch-target">More session tools</summary>
          <div className="form-actions">
            <Link href={`/dashboard/sessions/${session.id}/diagnostic-procedure`} className="button button-secondary touch-target">
              Procedure notes
            </Link>
            <form action={isArchived ? restoreAction : archiveAction}>
              <button className="button button-secondary touch-target">
                {isArchived ? 'Restore Session' : 'Archive Session'}
              </button>
            </form>
          </div>
        </details>
      </section>
    </main>
  )
}
