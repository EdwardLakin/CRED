'use client'

import { useActionState } from 'react'

import { processPendingCaptures, type CaptureExtractionActionState } from '../actions'

const INITIAL_STATE: CaptureExtractionActionState = {}

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button type="submit" className="button button-secondary touch-target" disabled={pending}>
      {pending ? 'Processing evidence…' : 'Process pending evidence'}
    </button>
  )
}

export function ProcessPendingEvidenceButton({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState(processPendingCaptures, INITIAL_STATE)

  return (
    <form action={formAction} className="classification-action-form">
      <input type="hidden" name="session_id" value={sessionId} />
      <SubmitButton pending={pending} />
      {state.message ? <p className={state.ok ? 'success classification-action-message' : 'error classification-action-message'}>{state.message}</p> : null}
    </form>
  )
}
