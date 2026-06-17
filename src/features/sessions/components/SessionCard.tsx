import Link from 'next/link'

import type { DocumentationSession } from '../types'
import { formatDate, formatDateTime } from '../utils'
import { archiveDocumentationSession, restoreDocumentationSession } from '../actions'
import { SessionStatusBadge } from './SessionStatusBadge'
import { getSessionOperationalAction, getSessionWorkflowStatus } from '../status'

function canArchiveFromCard(session: DocumentationSession) {
  const reviewableStatuses = new Set(['review', 'ready', 'finalized', 'completed'])
  const reviewableReviewStatuses = new Set(['review_required', 'ready_for_delivery', 'approved', 'completed', 'finalized'])
  const activelyCapturing = session.status === 'draft' || session.status === 'capturing' || session.status === 'active'
  return !session.archived_at && (!activelyCapturing || reviewableStatuses.has(session.status) || reviewableReviewStatuses.has(session.review_status ?? ''))
}

export function SessionCard({
  session,
  dateMode = 'updated',
  evidenceCount,
  showOperationalAction = false,
  showArchiveAction = false,
  timeZone,
}: {
  session: DocumentationSession
  dateMode?: 'created' | 'updated'
  evidenceCount?: number
  showOperationalAction?: boolean
  showArchiveAction?: boolean
  timeZone?: string | null
}) {
  const action = showOperationalAction ? getSessionOperationalAction(session) : null
  const href = action?.href ?? `/dashboard/sessions/${session.id}`
  const dateLabel = dateMode === 'created' ? 'Created' : 'Last updated'
  const dateValue =
    dateMode === 'created' ? formatDate(session.created_at, timeZone) : formatDateTime(session.updated_at ?? session.created_at, timeZone)
  const evidenceLabel = evidenceCount === undefined ? 'Not available' : `${evidenceCount} item${evidenceCount === 1 ? '' : 's'}`
  const isArchived = Boolean(session.archived_at)
  const archiveAction = archiveDocumentationSession.bind(null, session.id)
  const restoreAction = restoreDocumentationSession.bind(null, session.id)
  const renderArchiveAction = showArchiveAction && (isArchived || canArchiveFromCard(session))

  return (
    <article className="session-card session-card-shell">
      <Link href={href} className="session-card-link">
        <div className="session-card-header">
          <div className="session-card-title-block">
            <h3>{session.title}</h3>
            <p className="muted">{session.asset_label || session.unit_number || 'Evidence session'}</p>
          </div>
          <SessionStatusBadge status={getSessionWorkflowStatus(session)} />
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
      {renderArchiveAction ? (
        <form action={isArchived ? restoreAction : archiveAction} className="session-card-inline-action">
          <button className="button button-secondary touch-target">{isArchived ? 'Restore' : 'Archive'}</button>
        </form>
      ) : null}
    </article>
  )
}
