'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { removeCaptureItem } from '@/features/capture/actions'

export function DeleteEvidenceButton({
  captureId,
  className = 'secondary-link danger-link',
  label = 'Delete Evidence',
  onDeleted,
}: {
  captureId: string
  className?: string
  label?: string
  onDeleted?: () => void
}) {
  const router = useRouter()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isDeleted, setIsDeleted] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (isDeleted) return null

  function confirmDelete() {
    const formData = new FormData()
    formData.set('capture_id', captureId)

    setIsDeleted(true)
    setIsConfirming(false)
    buttonRef.current?.closest('[data-evidence-card]')?.remove()
    onDeleted?.()

    startTransition(async () => {
      await removeCaptureItem(formData)
      router.refresh()
    })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className}
        disabled={isPending}
        onClick={() => setIsConfirming(true)}
      >
        {isPending ? 'Deleting…' : label}
      </button>
      {isConfirming ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="confirmation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-evidence-title-${captureId}`}
            aria-describedby={`delete-evidence-description-${captureId}`}
          >
            <h2 id={`delete-evidence-title-${captureId}`}>Delete this evidence item?</h2>
            <p id={`delete-evidence-description-${captureId}`}>This action cannot be undone.</p>
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
