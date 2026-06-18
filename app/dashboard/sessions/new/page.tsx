import Link from 'next/link'

import { createDocumentationSession } from '@/features/sessions/actions'
import { DEFAULT_SESSION_TYPE, SESSION_TYPES } from '@/features/sessions/types'

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
        <label className="field-stack"><span className="label">Report type</span><select className="input" name="session_type" defaultValue={DEFAULT_SESSION_TYPE}>{SESSION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
        <div className="report-field-grid">
          <label className="field-stack"><span className="label">Report title</span><input className="input" name="report_title" placeholder="General Evidence Report" /></label>
          <label className="field-stack"><span className="label">Subject name</span><input className="input" name="subject_name" /></label>
          <label className="field-stack"><span className="label">Customer / Client</span><input className="input" name="customer_client" /></label>
          <label className="field-stack"><span className="label">Asset / Equipment</span><input className="input" name="asset_equipment" /></label>
          <label className="field-stack"><span className="label">Location / Address</span><input className="input" name="location_address" /></label>
          <label className="field-stack"><span className="label">Reference Number</span><input className="input" name="reference_number" /></label>
        </div>
        <div className="form-actions"><button className="button button-primary touch-target">Start Capture</button></div>
      </form>
    </main>
  )
}
