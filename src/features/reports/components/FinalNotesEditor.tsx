'use client'

import { useRef, useState } from 'react'
import { PendingActionButton } from '@/features/reports/review/PendingActionButton'

type Props = {
  defaultValue: string
  editedByUser: boolean
  includeInExport: boolean
  generateAction: (formData: FormData) => void | Promise<void>
  saveAction: (formData: FormData) => void | Promise<void>
}

export function FinalNotesEditor({ defaultValue, editedByUser, includeInExport, generateAction, saveAction }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [message, setMessage] = useState('')

  async function copyNotes() {
    const value = textareaRef.current?.value ?? ''
    await navigator.clipboard.writeText(value)
    setMessage('Copied final summary.')
  }

  function confirmPrepareAgain(event: React.FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    if (!(submitter instanceof HTMLButtonElement) || submitter.value !== 'regenerate') return
    const value = textareaRef.current?.value.trim() ?? ''
    if ((editedByUser || value) && !window.confirm('Generate this closing section again? Existing text will be replaced.')) {
      event.preventDefault()
    }
  }

  function clearNotes() {
    if (textareaRef.current) textareaRef.current.value = ''
  }

  return (
    <details className="card detail-card report-command-card form-stack final-notes-card" open>
      <summary className="report-section-heading generated-report-heading">
        <div>
          <p className="eyebrow">Closing section</p>
          <h2>Final summary / report notes</h2>
          <p className="muted">
            Prints at the end of the report under this heading. The report
            overview, which opens the report, is edited in Report details above.
          </p>
        </div>
      </summary>
      <form action={saveAction} className="form-stack">
        <label className="field-stack">
          <span className="label">Final summary / report notes</span>
          <textarea ref={textareaRef} className="input text-area" name="final_notes" rows={10} defaultValue={defaultValue} />
        </label>
        <label className="checkline neutral acknowledgement-row">
          <input type="checkbox" name="include_final_notes_in_export" defaultChecked={includeInExport} />
          Include this closing section in the exported report
        </label>
        <div className="form-actions report-inline-actions">
          <PendingActionButton className="button button-primary touch-target" pendingLabel="Saving…">Save closing section</PendingActionButton>
          <button type="button" className="button button-secondary touch-target" onClick={copyNotes}>Copy</button>
          <button type="button" className="button button-secondary touch-target" onClick={clearNotes}>Clear</button>
        </div>
      </form>
      <form action={generateAction} onSubmit={confirmPrepareAgain} className="form-actions report-inline-actions">
        <PendingActionButton className="button button-secondary touch-target" name="final_notes_action" value="generate" pendingLabel="Preparing report…">Generate</PendingActionButton>
        <PendingActionButton className="button button-secondary touch-target" name="final_notes_action" value="regenerate" pendingLabel="Regenerating…">Generate again</PendingActionButton>
      </form>
      {message ? <p className="success compact-success">{message}</p> : null}
    </details>
  )
}
