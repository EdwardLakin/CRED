import Link from 'next/link'

import { EmptyState, SessionCard } from '@/features/sessions'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { loadCurrentReportDraftsBySession } from '@/features/sessions/report-title-data'

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

export default async function ArchivedSessionsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const searchTerm = q?.trim() ?? ''
  const querySearchTerm = searchTerm.replace(/[%,]/g, ' ').trim()
  const { supabase, profile } = await requireSessionWorkspace()

  let query = supabase
    .from('documentation_sessions')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .not('archived_at', 'is', null)
    .order('created_at', { ascending: false })

  if (querySearchTerm) {
    query = query.or(`title.ilike.%${querySearchTerm}%,display_id.ilike.%${querySearchTerm}%,customer_name.ilike.%${querySearchTerm}%,asset_label.ilike.%${querySearchTerm}%,unit_number.ilike.%${querySearchTerm}%,vin.ilike.%${querySearchTerm}%`)
  }

  const { data: sessions, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  const archivedSessions = sessions ?? []
  const sessionIds = archivedSessions.map((session) => session.id)
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
      <div className="section-header page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Archived Sessions</h1>
          <p className="muted">Review, restore, or safely delete archived sessions for your current organization.</p>
        </div>
        <Link href="/dashboard/settings" className="button button-secondary touch-target">Settings</Link>
      </div>

      <form action="/dashboard/settings/archived-sessions" className="search-card">
        <label className="label" htmlFor="q">Search archived sessions</label>
        <div className="search-row">
          <input id="q" name="q" type="search" defaultValue={searchTerm} placeholder="Search by Report ID, title, customer, asset, VIN, or unit" className="input" />
          <button className="button button-primary touch-target">Search</button>
        </div>
      </form>

      {archivedSessions.length > 0 ? (
        <div className="session-list-grid">
          {archivedSessions.map((session) => (
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
        <EmptyState
          title={searchTerm ? 'No matching archived sessions' : 'No archived sessions'}
          description={searchTerm ? 'Try a different search term.' : 'Archive a session from a session card to see it here.'}
          actionHref="/dashboard/settings"
          actionLabel="Back to Settings"
        />
      )}
    </main>
  )
}
