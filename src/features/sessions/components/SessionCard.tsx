import Link from 'next/link'

import { getSessionTypeLabel, type DocumentationSession } from '../types'
import { formatDate, formatDateTime } from '../utils'
import { SessionStatusBadge } from './SessionStatusBadge'

function formatAiDraftStatus(status: string | undefined) {
  if (!status) return 'Not started'
  if (status === 'approved') return 'Approved'
  return status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getOperationalAction(session: DocumentationSession) {
  if (session.status === 'finalized') {
    return { href: `/dashboard/sessions/${session.id}/report`, label: 'Open Report' }
  }

  if (session.status === 'review') {
    return { href: `/dashboard/sessions/${session.id}/report`, label: 'Review Draft' }
  }

  return { href: `/dashboard/sessions/${session.id}/capture`, label: 'Continue Capture' }
}

export function SessionCard({
  session,
  dateMode = 'updated',
  evidenceCount,
  aiDraftStatus,
  showOperationalAction = false,
}: {
  session: DocumentationSession
  dateMode?: 'created' | 'updated'
  evidenceCount?: number
  aiDraftStatus?: string
  showOperationalAction?: boolean
}) {
  const action = showOperationalAction ? getOperationalAction(session) : null
  const href = action?.href ?? `/dashboard/sessions/${session.id}`
  const dateLabel = dateMode === 'created' ? 'Created' : 'Last updated'
  const dateValue =
    dateMode === 'created' ? formatDate(session.created_at) : formatDateTime(session.updated_at ?? session.created_at)
  const evidenceLabel = evidenceCount === undefined ? 'Not available' : `${evidenceCount} item${evidenceCount === 1 ? '' : 's'}`

  return (
    <Link href={href} className="session-card">
      <div className="session-card-header">
        <div className="session-card-title-block">
          <h3>{session.title}</h3>
          <p className="muted">{getSessionTypeLabel(session.session_type)}</p>
        </div>
        <SessionStatusBadge status={session.status} />
      </div>
      <dl className="session-meta-grid">
        <div>
          <dt>{showOperationalAction ? 'Updated' : dateLabel}</dt>
          <dd>{showOperationalAction ? formatDateTime(session.updated_at ?? session.created_at) : dateValue}</dd>
        </div>
        {showOperationalAction ? (
          <>
            <div>
              <dt>Evidence</dt>
              <dd>{evidenceLabel}</dd>
            </div>
            <div>
              <dt>AI Draft</dt>
              <dd>{formatAiDraftStatus(aiDraftStatus)}</dd>
            </div>
            <div>
              <dt>Action</dt>
              <dd className="session-card-action">{action?.label}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt>Asset</dt>
            <dd>{session.asset_label || session.unit_number || 'Not assigned'}</dd>
          </div>
        )}
      </dl>
    </Link>
  )
}
