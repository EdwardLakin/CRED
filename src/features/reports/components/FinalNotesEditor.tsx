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
    setMessage('Copied work order notes.')
  }

  function confirmRegenerate(event: React.FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    if (!(submitter instanceof HTMLButtonElement) || submitter.value !== 'regenerate') return
    const value = textareaRef.current?.value.trim() ?? ''
    if ((editedByUser || value) && !window.confirm('Regenerate final notes? Existing final notes will be replaced.')) {
      event.preventDefault()
    }
  }

  function clearNotes() {
    if (textareaRef.current) textareaRef.current.value = ''
  }

  return (
    <section className="card detail-card report-command-card form-stack final-notes-card">
      <div className="report-section-heading generated-report-heading">
        <div>
          <p className="eyebrow">Final Notes</p>
          <h2>Final Notes / Work Order Notes</h2>
          <p className="muted">Copy/paste-ready technician summary for an outside work order system.</p>
        </div>
      </div>
      <form action={saveAction} className="form-stack">
        <label className="field-stack">
          <span className="label">Work order notes</span>
          <textarea ref={textareaRef} className="input text-area" name="final_notes" rows={10} defaultValue={defaultValue} />
        </label>
        <label className="checkline neutral acknowledgement-row">
          <input type="checkbox" name="include_final_notes_in_export" defaultChecked={includeInExport} />
          Include Final Notes in export
        </label>
        <div className="form-actions report-inline-actions">
          <button className="button button-primary touch-target">Save Notes</button>
          <button type="button" className="button button-secondary touch-target" onClick={copyNotes}>Copy Notes</button>
          <button type="button" className="button button-secondary touch-target" onClick={clearNotes}>Clear</button>
        </div>
      </form>
      <form action={generateAction} onSubmit={confirmRegenerate} className="form-actions report-inline-actions">
        <button className="button button-secondary touch-target" name="final_notes_action" value="generate">Generate Final Notes</button>
        <button className="button button-secondary touch-target" name="final_notes_action" value="regenerate">Regenerate</button>
      </form>
      {message ? <p className="success compact-success">{message}</p> : null}
    </section>
  )
}
