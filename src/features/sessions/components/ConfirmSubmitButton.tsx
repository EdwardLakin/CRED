'use client'

export function ConfirmSubmitButton({
  children,
  className,
  message,
}: {
  children: React.ReactNode
  className?: string
  message: string
}) {
  return (
    <button
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault()
        }
      }}
    >
      {children}
    </button>
  )
}
