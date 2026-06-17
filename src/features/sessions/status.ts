import type { DocumentationSession, SessionStatus } from './types'

export type SessionWorkflowState = 'capturing' | 'review_required' | 'ready' | 'archived'

export function getSessionWorkflowState(session: DocumentationSession): SessionWorkflowState {
  if (session.archived_at) return 'archived'
  if (session.review_status === 'ready_for_delivery' || session.status === 'finalized') return 'ready'
  if (session.status === 'review' || session.review_status === 'review_required') return 'review_required'
  return 'capturing'
}

export function getSessionWorkflowStatus(session: DocumentationSession): SessionStatus {
  const workflowState = getSessionWorkflowState(session)
  if (workflowState === 'archived') return 'archived'
  if (workflowState === 'ready') return 'finalized'
  if (workflowState === 'review_required') return 'review'
  return 'capturing'
}

export function getSessionOperationalAction(session: DocumentationSession) {
  const workflowState = getSessionWorkflowState(session)

  if (workflowState === 'ready') {
    return { href: `/dashboard/sessions/${session.id}/report`, label: 'Export / Open Report' }
  }

  if (workflowState === 'review_required') {
    return { href: `/dashboard/sessions/${session.id}/report`, label: 'Open Review' }
  }

  if (workflowState === 'archived') {
    return { href: `/dashboard/sessions/${session.id}`, label: 'Archived' }
  }

  return { href: `/dashboard/sessions/${session.id}/capture`, label: 'Continue Capture' }
}
