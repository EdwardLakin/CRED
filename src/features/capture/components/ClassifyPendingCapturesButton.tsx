'use client'

import { useActionState } from 'react'

import { classifyPendingCaptures, type CaptureClassificationActionState } from '../actions'

const INITIAL_STATE: CaptureClassificationActionState = {}

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button type="submit" className="button button-secondary touch-target" disabled={pending}>
      {pending ? 'Classifying captures…' : 'Classify pending captures'}
    </button>
  )
}

export function ClassifyPendingCapturesButton({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState(classifyPendingCaptures, INITIAL_STATE)

  return (
    <form action={formAction} className="classification-action-form">
      <input type="hidden" name="session_id" value={sessionId} />
      <SubmitButton pending={pending} />
      {state.message ? <p className={state.ok ? 'success classification-action-message' : 'error classification-action-message'}>{state.message}</p> : null}
    </form>
  )
}
