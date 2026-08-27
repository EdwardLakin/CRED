import Link from 'next/link'

import type { DocumentationSession } from '../types'
import { formatDateTime } from '../utils'
import { archiveDocumentationSession, deleteDocumentationSession, restoreDocumentationSession } from '../actions'
import { SessionStatusBadge } from './SessionStatusBadge'
import { getSessionOperationalAction, getSessionWorkflowStatus } from '../status'
import { getSessionPrimaryTitle, getSessionSecondarySummary, type SessionCardTitleDraft } from '../display'
import { ConfirmSubmitButton } from './ConfirmSubmitButton'

function canArchiveFromCard(session: DocumentationSession) {
  return !session.archived_at
}

export function SessionCard({
  session,
  evidenceCount,
  showOperationalAction = false,
  showArchiveAction = false,
  showManagementActions = false,
  timeZone,
  currentReport,
}: {
  session: DocumentationSession
  evidenceCount?: number
  showOperationalAction?: boolean
  showArchiveAction?: boolean
  showManagementActions?: boolean
  timeZone?: string | null
  currentReport?: SessionCardTitleDraft
}) {
  const action = showOperationalAction ? getSessionOperationalAction(session) : null
  const href = action?.href ?? `/dashboard/sessions/${session.id}`
  const createdValue = formatDateTime(session.created_at, timeZone)
  const updatedValue = formatDateTime(session.updated_at ?? session.created_at, timeZone)
  const evidenceLabel = evidenceCount === undefined ? 'Not available' : `${evidenceCount} item${evidenceCount === 1 ? '' : 's'}`
  const isArchived = Boolean(session.archived_at)
  const archiveAction = archiveDocumentationSession.bind(null, session.id)
  const restoreAction = restoreDocumentationSession.bind(null, session.id)
  const deleteAction = deleteDocumentationSession.bind(null, session.id)
  const primaryTitle = getSessionPrimaryTitle(session, currentReport)
  const secondarySummary = getSessionSecondarySummary(session, evidenceCount, timeZone)
  const renderArchiveAction = showArchiveAction && (isArchived || canArchiveFromCard(session))

  return (
    <article className="session-card session-card-shell">
      <Link href={href} className="session-card-link">
        <div className="session-card-header">
          <div className="session-card-title-block">
            <h3>{primaryTitle}</h3>
            <p className="muted">{secondarySummary}</p>
          </div>
          <SessionStatusBadge status={getSessionWorkflowStatus(session)} />
        </div>
        <dl className="session-meta-grid">
          <div>
            <dt>Created</dt>
            <dd>{createdValue}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{updatedValue}</dd>
          </div>
          <div>
            <dt>Items</dt>
            <dd>{evidenceLabel}</dd>
          </div>
          {showOperationalAction ? (
            <div>
              <dt>Action</dt>
              <dd className="session-card-action">{action?.label}</dd>
            </div>
          ) : null}
        </dl>
      </Link>
      {showManagementActions ? (
        <details className="session-card-manage">
          <summary className="secondary-link touch-target">Manage</summary>
          <div className="session-card-actions">
            {renderArchiveAction ? (
              <form action={isArchived ? restoreAction : archiveAction} className="session-card-inline-action">
                <button className="button button-secondary touch-target">{isArchived ? 'Restore' : 'Archive'}</button>
              </form>
            ) : null}
            <form action={deleteAction} className="session-card-inline-action">
              <ConfirmSubmitButton className="button button-secondary touch-target danger-action" message={`Delete ${primaryTitle}? This safely removes the session from normal and archived lists without deleting capture files.`}>
                Delete
              </ConfirmSubmitButton>
            </form>
          </div>
        </details>
      ) : null}
    </article>
  )
}
