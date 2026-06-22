'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useFormStatus } from 'react-dom'

type PendingButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingLabel: string
  children: React.ReactNode
}

export function PendingActionButton({ pendingLabel, children, disabled, className, ...props }: PendingButtonProps) {
  const { pending } = useFormStatus()
  return (
    <button {...props} className={className} disabled={disabled || pending} aria-busy={pending || undefined}>
      {pending ? <span className="button-spinner" aria-hidden="true" /> : null}
      {pending ? pendingLabel : children}
    </button>
  )
}

type PendingLinkProps = {
  href: string
  className?: string
  target?: string
  idleLabel: string
  pendingLabel: string
}

export function PendingNavigationLink({ href, className, target, idleLabel, pendingLabel }: PendingLinkProps) {
  const [pending, startTransition] = useTransition()
  return (
    <Link
      href={href}
      className={className}
      target={target}
      aria-busy={pending || undefined}
      onClick={() => startTransition(() => undefined)}
    >
      {pending ? <span className="button-spinner" aria-hidden="true" /> : null}
      {pending ? pendingLabel : idleLabel}
    </Link>
  )
}
