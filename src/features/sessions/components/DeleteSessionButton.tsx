'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'

import { deleteDocumentationSession } from '../actions'

export function DeleteSessionButton({
  sessionId,
  sessionTitle,
}: {
  sessionId: string
  sessionTitle: string
}) {
  const router = useRouter()
  const deleteButtonRef = useRef<HTMLButtonElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (isConfirming) cancelButtonRef.current?.focus()
  }, [isConfirming])

  function confirmDelete() {
    const sessionCard = deleteButtonRef.current?.closest('.session-card')

    setError(null)
    setIsConfirming(false)
    if (sessionCard instanceof HTMLElement) sessionCard.style.display = 'none'

    startTransition(async () => {
      try {
        const result = await deleteDocumentationSession(sessionId)

        if (!result.ok) {
          if (sessionCard instanceof HTMLElement) sessionCard.style.display = ''
          setError(result.error)
          return
        }

        router.refresh()
      } catch {
        if (sessionCard instanceof HTMLElement) sessionCard.style.display = ''
        setError('Unable to delete the session. Check your connection and try again.')
      }
    })
  }

  return (
    <>
      <button
        ref={deleteButtonRef}
        type="button"
        className="button button-secondary touch-target danger-action"
        disabled={isPending}
        onClick={() => {
          setError(null)
          setIsConfirming(true)
        }}
      >
        Delete
      </button>
      {error && !isConfirming ? <p className="form-error" role="alert">{error}</p> : null}
      {isConfirming ? createPortal(
        <div className="modal-backdrop" role="presentation">
          <div
            className="confirmation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-session-title-${sessionId}`}
            aria-describedby={`delete-session-description-${sessionId}`}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !isPending) setIsConfirming(false)
            }}
          >
            <h2 id={`delete-session-title-${sessionId}`}>Delete this session?</h2>
            <p id={`delete-session-description-${sessionId}`}>
              <strong>{sessionTitle}</strong> will be removed from your active, completed, and archived session lists. Its capture files will remain safely stored.
            </p>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <div className="confirmation-modal-actions">
              <button
                ref={cancelButtonRef}
                type="button"
                className="button button-secondary touch-target"
                disabled={isPending}
                onClick={() => setIsConfirming(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button touch-target danger-button"
                disabled={isPending}
                aria-busy={isPending || undefined}
                onClick={confirmDelete}
              >
                {isPending ? 'Deleting…' : 'Delete session'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  )
}
