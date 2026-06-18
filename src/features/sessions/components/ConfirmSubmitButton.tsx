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
      type="submit"
      className={className}
      onClick={(event) => {
        event.stopPropagation()

        if (!window.confirm(message)) {
          event.preventDefault()
        }
      }}
    >
      {children}
    </button>
  )
}
