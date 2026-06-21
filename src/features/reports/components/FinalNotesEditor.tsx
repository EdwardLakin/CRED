'use client'

import { useRef, useState } from 'react'

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
    setMessage('Copied executive summary.')
  }

  function confirmPrepareAgain(event: React.FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    if (!(submitter instanceof HTMLButtonElement) || submitter.value !== 'regenerate') return
    const value = textareaRef.current?.value.trim() ?? ''
    if ((editedByUser || value) && !window.confirm('Generate summary again? Existing summary text will be replaced.')) {
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
          <p className="eyebrow">Executive Summary</p>
          <h2>Executive Summary</h2>
          <p className="muted">Editable summary based on technician notes, captions, categories, and form fields.</p>
        </div>
      </summary>
      <form action={saveAction} className="form-stack">
        <label className="field-stack">
          <span className="label">Executive Summary</span>
          <textarea ref={textareaRef} className="input text-area" name="final_notes" rows={10} defaultValue={defaultValue} />
        </label>
        <label className="checkline neutral acknowledgement-row">
          <input type="checkbox" name="include_final_notes_in_export" defaultChecked={includeInExport} />
          Include executive summary in export
        </label>
        <div className="form-actions report-inline-actions">
          <button className="button button-primary touch-target">Save Summary</button>
          <button type="button" className="button button-secondary touch-target" onClick={copyNotes}>Copy Summary</button>
          <button type="button" className="button button-secondary touch-target" onClick={clearNotes}>Clear</button>
        </div>
      </form>
      <form action={generateAction} onSubmit={confirmPrepareAgain} className="form-actions report-inline-actions">
        <button className="button button-secondary touch-target" name="final_notes_action" value="generate">Generate Summary</button>
        <button className="button button-secondary touch-target" name="final_notes_action" value="regenerate">Generate Again</button>
      </form>
      {message ? <p className="success compact-success">{message}</p> : null}
    </details>
  )
}
