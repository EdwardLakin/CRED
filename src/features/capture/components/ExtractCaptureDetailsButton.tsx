'use client'

import { useActionState } from 'react'

import { extractCaptureDetails, type CaptureExtractionActionState } from '../actions'

const INITIAL_STATE: CaptureExtractionActionState = {}

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button type="submit" className="button button-secondary touch-target" disabled={pending}>
      {pending ? 'Preparing your report…' : 'Prepare report'}
    </button>
  )
}

export function ExtractCaptureDetailsButton({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState(extractCaptureDetails, INITIAL_STATE)

  return (
    <form action={formAction} className="classification-action-form">
      <input type="hidden" name="session_id" value={sessionId} />
      <SubmitButton pending={pending} />
      {state.message ? <p className={state.ok ? 'success classification-action-message' : 'error classification-action-message'}>{state.message}</p> : null}
    </form>
  )
}
