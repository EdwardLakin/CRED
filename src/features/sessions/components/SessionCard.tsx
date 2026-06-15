import Link from 'next/link'

import type { DocumentationSession } from '../types'
import { formatDate, formatDateTime } from '../utils'
import { SessionStatusBadge } from './SessionStatusBadge'

function getOperationalAction(session: DocumentationSession) {
  if (session.status === 'finalized') {
    return { href: `/dashboard/sessions/${session.id}/report`, label: 'Open Report' }
  }

  if (session.status === 'review') {
    return { href: `/dashboard/sessions/${session.id}/report`, label: 'Review Report' }
  }

  return { href: `/dashboard/sessions/${session.id}/capture`, label: 'Continue Capture' }
}

export function SessionCard({
  session,
  dateMode = 'updated',
  evidenceCount,
  showOperationalAction = false,
  timeZone,
}: {
  session: DocumentationSession
  dateMode?: 'created' | 'updated'
  evidenceCount?: number
  showOperationalAction?: boolean
  timeZone?: string | null
}) {
  const action = showOperationalAction ? getOperationalAction(session) : null
  const href = action?.href ?? `/dashboard/sessions/${session.id}`
  const dateLabel = dateMode === 'created' ? 'Created' : 'Last updated'
  const dateValue =
    dateMode === 'created' ? formatDate(session.created_at, timeZone) : formatDateTime(session.updated_at ?? session.created_at, timeZone)
  const evidenceLabel = evidenceCount === undefined ? 'Not available' : `${evidenceCount} item${evidenceCount === 1 ? '' : 's'}`

  return (
    <Link href={href} className="session-card">
      <div className="session-card-header">
        <div className="session-card-title-block">
          <h3>{session.title}</h3>
          <p className="muted">{session.asset_label || session.unit_number || 'Evidence session'}</p>
        </div>
        <SessionStatusBadge status={session.status} />
      </div>
      <dl className="session-meta-grid">
        <div>
          <dt>{showOperationalAction ? 'Updated' : dateLabel}</dt>
          <dd>{showOperationalAction ? formatDateTime(session.updated_at ?? session.created_at, timeZone) : dateValue}</dd>
        </div>
        {showOperationalAction ? (
          <>
            <div>
              <dt>Evidence</dt>
              <dd>{evidenceLabel}</dd>
            </div>
            <div>
              <dt>Action</dt>
              <dd className="session-card-action">{action?.label}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt>Evidence</dt>
            <dd>{evidenceLabel}</dd>
          </div>
        )}
      </dl>
    </Link>
  )
}
