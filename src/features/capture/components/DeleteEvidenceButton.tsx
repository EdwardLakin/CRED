'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import {
  removeCaptureItem,
  removeDocumentationItem,
} from '@/features/capture/actions'

export function DeleteEvidenceButton({
  captureId,
  documentationItemId,
  sessionId,
  className = 'secondary-link danger-link',
  label = 'Delete item',
  onDeleted,
}: {
  captureId: string
  documentationItemId?: string | null
  sessionId?: string
  className?: string
  label?: string
  onDeleted?: () => void
}) {
  const router = useRouter()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isDeleted, setIsDeleted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function confirmDelete() {
    const formData = new FormData()
    formData.set('capture_id', captureId)
    if (documentationItemId && sessionId) {
      formData.set('documentation_item_id', documentationItemId)
      formData.set('session_id', sessionId)
    }

    setIsDeleted(true)
    setIsConfirming(false)
    setError(null)
    const card = buttonRef.current?.closest(
      '[data-item-card], [data-evidence-card]',
    )
    if (card instanceof HTMLElement) card.style.display = 'none'
    onDeleted?.()

    startTransition(async () => {
      const result =
        documentationItemId && sessionId
          ? await removeDocumentationItem(formData)
          : await removeCaptureItem(formData)
      if (!result.ok) {
        setIsDeleted(false)
        setError(result.error ?? 'Unable to delete item.')
        if (card instanceof HTMLElement) card.style.display = ''
        return
      }
      router.refresh()
    })
  }

  return (
    <>
      <button
        style={isDeleted ? { display: 'none' } : undefined}
        ref={buttonRef}
        type="button"
        className={className}
        disabled={isPending}
        onClick={() => setIsConfirming(true)}
      >
        {isPending ? 'Deleting…' : label}
      </button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {isConfirming ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="confirmation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-item-title-${captureId}`}
            aria-describedby={`delete-item-description-${captureId}`}
          >
            <h2 id={`delete-item-title-${captureId}`}>Delete this item?</h2>
            <p id={`delete-item-description-${captureId}`}>
              {documentationItemId
                ? 'Every photo and attachment in this item will be deleted.'
                : 'This file will be deleted.'}{' '}
              This action cannot be undone.
            </p>
            <div className="confirmation-modal-actions">
              <button type="button" className="button button-secondary touch-target" onClick={() => setIsConfirming(false)}>
                Cancel
              </button>
              <button type="button" className="button touch-target danger-button" onClick={confirmDelete}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
