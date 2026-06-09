import { getSessionStatusLabel } from '../types'

export function SessionStatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-badge-${status}`}>{getSessionStatusLabel(status)}</span>
}
