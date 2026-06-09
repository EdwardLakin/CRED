import Link from 'next/link'

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string
  description: string
  actionHref: string
  actionLabel: string
}) {
  return (
    <div className="empty-state session-empty-state">
      <div className="empty-icon" aria-hidden="true">
        📋
      </div>
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      <Link href={actionHref} className="button button-primary touch-target">
        {actionLabel}
      </Link>
    </div>
  )
}
