import { formatRelationshipReviewStatus } from '@/features/evidence/relationships/validation'

export function RelationshipBadge({ status }: { status: string | null | undefined }) {
  return <span className="status-badge">{formatRelationshipReviewStatus(status)}</span>
}
