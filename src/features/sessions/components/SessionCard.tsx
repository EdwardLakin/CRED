import Link from 'next/link'

import { getSessionTypeLabel, type DocumentationSession } from '../types'
import { formatDate, formatDateTime } from '../utils'
import { SessionStatusBadge } from './SessionStatusBadge'

export function SessionCard({
  session,
  dateMode = 'updated',
}: {
  session: DocumentationSession
  dateMode?: 'created' | 'updated'
}) {
  const dateLabel = dateMode === 'created' ? 'Created' : 'Last updated'
  const dateValue =
    dateMode === 'created' ? formatDate(session.created_at) : formatDateTime(session.updated_at ?? session.created_at)

  return (
    <Link href={`/dashboard/sessions/${session.id}`} className="session-card">
      <div className="session-card-header">
        <div className="session-card-title-block">
          <h3>{session.title}</h3>
          <p className="muted">{getSessionTypeLabel(session.session_type)}</p>
        </div>
        <SessionStatusBadge status={session.status} />
      </div>
      <dl className="session-meta-grid">
        <div>
          <dt>{dateLabel}</dt>
          <dd>{dateValue}</dd>
        </div>
        <div>
          <dt>Asset</dt>
          <dd>{session.asset_label || session.unit_number || 'Not assigned'}</dd>
        </div>
      </dl>
    </Link>
  )
}
