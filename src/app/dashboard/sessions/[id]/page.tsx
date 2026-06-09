import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SESSION_STATUSES, SessionStatusBadge, formatDateTime } from '@/features/sessions'
import {
  archiveDocumentationSession,
  restoreDocumentationSession,
  updateDocumentationSession,
} from '@/features/sessions/actions'
import { requireSessionWorkspace } from '@/features/sessions/data'

function DetailField({
  id,
  label,
  defaultValue,
  placeholder,
}: {
  id: string
  label: string
  defaultValue: string | null
  placeholder?: string
}) {
  return (
    <div className="field-stack">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} name={id} defaultValue={defaultValue ?? ''} placeholder={placeholder} className="input" />
    </div>
  )
}

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const { id } = await params
  const { error, saved } = await searchParams
  const { supabase, profile } = await requireSessionWorkspace()
  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('*')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) {
    notFound()
  }

  const saveAction = updateDocumentationSession.bind(null, session.id)
  const archiveAction = archiveDocumentationSession.bind(null, session.id)
  const restoreAction = restoreDocumentationSession.bind(null, session.id)
  const isArchived = session.status === 'archived'

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <Link href="/dashboard/sessions" className="secondary-link touch-target">
            ← All sessions
          </Link>
          <div className="title-row">
            <h1>{session.title}</h1>
            <SessionStatusBadge status={session.status} />
          </div>
          <p className="muted">
            {session.session_type} · Updated {formatDateTime(session.updated_at ?? session.created_at)}
          </p>
        </div>
        <form action={isArchived ? restoreAction : archiveAction}>
          <button className="button button-secondary touch-target">
            {isArchived ? 'Restore Archived Session' : 'Archive Session'}
          </button>
        </form>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {saved ? <p className="success">Session saved.</p> : null}

      <form action={saveAction} className="card detail-card form-stack">
        <section className="form-stack">
          <div>
            <h2>Session Details</h2>
            <p className="muted">
              Rename the session, update its workflow status, and maintain asset and customer reference details.
            </p>
          </div>

          <div className="field-grid">
            <div className="field-stack field-wide">
              <label htmlFor="title" className="label">
                Title / Rename
              </label>
              <input id="title" name="title" required minLength={2} defaultValue={session.title} className="input" />
            </div>

            <div className="field-stack">
              <label htmlFor="session_type_display" className="label">
                Session Type
              </label>
              <input id="session_type_display" value={session.session_type} readOnly className="input readonly-input" />
            </div>

            <div className="field-stack">
              <label htmlFor="status" className="label">
                Status
              </label>
              <select id="status" name="status" defaultValue={session.status} className="select">
                {SESSION_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="form-stack">
          <h2>Asset Details</h2>
          <div className="field-grid">
            <DetailField
              id="asset_label"
              label="Asset Label"
              defaultValue={session.asset_label}
              placeholder="Equipment, vehicle, or property label"
            />
            <DetailField id="vin" label="VIN" defaultValue={session.vin} placeholder="Vehicle identification number" />
            <DetailField id="odometer" label="Odometer" defaultValue={session.odometer} placeholder="Mileage or hours" />
            <DetailField
              id="unit_number"
              label="Unit Number"
              defaultValue={session.unit_number}
              placeholder="Internal unit number"
            />
            <div className="field-wide">
              <DetailField
                id="customer_name"
                label="Customer Name"
                defaultValue={session.customer_name}
                placeholder="Customer or account name"
              />
            </div>
          </div>
        </section>

        <div className="form-actions">
          <Link href="/dashboard/sessions" className="button button-secondary touch-target">
            Cancel
          </Link>
          <button className="button button-primary touch-target">Save Changes</button>
        </div>
      </form>
    </main>
  )
}
