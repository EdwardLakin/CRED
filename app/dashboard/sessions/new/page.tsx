import Link from 'next/link'

import { createDocumentationSession } from '@/features/sessions/actions'
import { DEFAULT_REPORT_TYPE, REPORT_TYPES, SESSION_METADATA_FIELDS } from '@/features/sessions/report-types'

export default function NewSessionPage() {
  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <Link href="/dashboard" className="secondary-link touch-target">← Dashboard</Link>
          <h1>Set up session</h1>
          <p className="muted">Choose the report type before capturing evidence. This selection is used as the report source of truth.</p>
        </div>
      </div>
      <form action={createDocumentationSession} className="card form-stack">
        <label className="field-stack"><span className="label">Session title</span><input className="input" name="title" placeholder="Optional; defaults to a new session title" /></label>
        <label className="field-stack"><span className="label">Report Type <span aria-hidden="true">*</span></span><select className="input" name="session_type" defaultValue={DEFAULT_REPORT_TYPE} required>{REPORT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
        <div className="report-field-grid">
          {SESSION_METADATA_FIELDS.map((field) => (
            <label className="field-stack" key={field.name}>
              <span className="label">{field.label}</span>
              <input className="input" name={field.name} maxLength={field.maxLength} />
            </label>
          ))}
        </div>
        <div className="form-actions"><button className="button button-primary touch-target">Start Capture</button></div>
      </form>
    </main>
  )
}
