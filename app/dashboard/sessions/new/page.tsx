import Link from 'next/link'

import { createDocumentationSession } from '@/features/sessions/actions'
import { REPORT_TYPES } from '@/features/sessions/report-types'

export default async function NewSessionPage() {
  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <Link href="/dashboard/sessions" className="secondary-link touch-target">← Sessions</Link>
          <p className="eyebrow">Session Setup</p>
          <h1>Start Capture</h1>
          <p className="muted">Choose the report type once. CRED uses it as the source of truth for review and export.</p>
        </div>
      </div>

      <form action={createDocumentationSession} className="card detail-card form-stack">
        <label className="field-stack">
          <span className="label">Report Type</span>
          <select name="session_type" className="select" defaultValue="General Evidence Report" required>
            {REPORT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <details className="report-subsection">
          <summary><strong>Optional metadata</strong> <span className="muted">(can be edited later)</span></summary>
          <div className="report-field-grid">
            <label className="field-stack"><span className="label">Customer / Client</span><input className="input" name="customer_client" /></label>
            <label className="field-stack"><span className="label">Asset / Equipment</span><input className="input" name="asset_equipment" /></label>
            <label className="field-stack"><span className="label">Reference Number</span><input className="input" name="reference_number" /></label>
            <label className="field-stack"><span className="label">Location</span><input className="input" name="location" /></label>
            <label className="field-stack"><span className="label">Subject Name</span><input className="input" name="subject_name" /></label>
          </div>
        </details>
        <div className="form-actions">
          <button className="button button-primary touch-target">Start Capture</button>
        </div>
      </form>
    </main>
  )
}
