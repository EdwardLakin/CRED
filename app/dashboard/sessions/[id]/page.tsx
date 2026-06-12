import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  CaptureList,
  ClassifyPendingCapturesButton,
  EvidenceChecklistSummary,
  ExtractCaptureDetailsButton,
  ExtractedEvidencePanel,
} from '@/features/capture'
import { ThemeToggle } from '@/components/theme'
import { FieldServiceDetailsCard, isFieldServiceSessionType } from '@/features/field-service'
import { SESSION_STATUSES, SessionStatusBadge, formatDateTime, getSessionTypeLabel } from '@/features/sessions'
import {
  archiveDocumentationSession,
  restoreDocumentationSession,
  updateDocumentationSession,
} from '@/features/sessions/actions'
import { SignatureCaptureForm } from '@/features/signatures'
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
  searchParams: Promise<{ appliedField?: string; captureError?: string; captureSaved?: string; error?: string; saved?: string }>
}) {
  const { id } = await params
  const { appliedField, captureError, captureSaved, error, saved } = await searchParams
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

  const { data: captures } = await supabase
    .from('capture_items')
    .select('*')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .order('captured_at', { ascending: false })

  const visibleCaptures = (captures ?? []).filter((capture) => !capture.deleted_at)
  const signedUrls: Record<string, string> = {}
  await Promise.all(
    visibleCaptures.map(async (capture) => {
      const { data } = await supabase.storage.from('documentation-captures').createSignedUrl(capture.storage_path, 60 * 10)

      if (data?.signedUrl) {
        signedUrls[capture.id] = data.signedUrl
      }
    }),
  )

  const { data: workflowTemplate } = session.workflow_template_id
    ? await supabase
        .from('documentation_workflow_templates')
        .select('id, name, required_evidence, signature_requirements')
        .eq('id', session.workflow_template_id)
        .eq('organization_id', profile.organization_id)
        .maybeSingle()
    : { data: null }

  const { data: reportEvents } = await supabase
    .from('exports')
    .select('*')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })
    .limit(8)

  const { data: signatures } = await supabase
    .from('signature_captures')
    .select('*')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .order('signed_at', { ascending: false })

  const savedSignatures = signatures ?? []

  const saveAction = updateDocumentationSession.bind(null, session.id)
  const archiveAction = archiveDocumentationSession.bind(null, session.id)
  const restoreAction = restoreDocumentationSession.bind(null, session.id)
  const isArchived = session.status === 'archived'
  const includedCaptureCount = visibleCaptures.filter((capture) => capture.include_in_report).length
  const needsReviewCount = visibleCaptures.filter((capture) => capture.ai_status === 'needs_review').length
  const extractedCaptureCount = visibleCaptures.filter((capture) => capture.ai_status === 'completed').length

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
            Unit {session.unit_number || session.asset_label || 'Unassigned'} · Customer {session.customer_name || 'Not set'} · {getSessionTypeLabel(session.session_type)} · Created {formatDateTime(session.created_at)}
          </p>
          <p className="muted">Updated {formatDateTime(session.updated_at ?? session.created_at)}</p>
          <p className="muted">Form Profile: {workflowTemplate?.name ?? 'No Form Profile / Evidence Package'}</p>
        </div>
        <div className="page-actions">
          <ThemeToggle />
          <Link href={`/api/dashboard/sessions/${session.id}/report-pdf`} className="button button-primary touch-target" target="_blank">
            Open Printable Report
          </Link>
          <form action={isArchived ? restoreAction : archiveAction}>
            <button className="button button-secondary touch-target">
              {isArchived ? 'Restore Archived Session' : 'Archive Session'}
            </button>
          </form>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {captureError ? <p className="error">{captureError}</p> : null}
      {saved ? <p className="success">{appliedField ? `Applied ${appliedField.replace(/_/g, ' ')} to Session Details.` : 'Session saved.'}</p> : null}
      {captureSaved ? <p className="success">Capture added.</p> : null}

      <form action={saveAction} className="card detail-card form-stack">
        <section className="form-stack">
          <div>
            <h2>Session Details</h2>
            <p className="muted">
              Rename the session, update its documentation status, and maintain asset and customer reference details.
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
              <input id="session_type_display" value={getSessionTypeLabel(session.session_type)} readOnly className="input readonly-input" />
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

        {isFieldServiceSessionType(session.session_type) ? (
          <FieldServiceDetailsCard details={session.field_service_details} />
        ) : null}

        <div className="form-actions">
          <Link href="/dashboard/sessions" className="button button-secondary touch-target">
            Cancel
          </Link>
          <button className="button button-primary touch-target">Save Changes</button>
        </div>
      </form>

      <EvidenceChecklistSummary captures={visibleCaptures} sessionType={session.session_type} />


      <section className="card detail-card form-stack">
        <div>
          <p className="eyebrow">Digital Signatures</p>
          <h2>Signature Capture</h2>
          <p className="muted">Capture reusable technician, customer, inspector, or supervisor signatures with mouse, touch, or stylus. Signatures render inside the printable report output.</p>
        </div>
        <SignatureCaptureForm sessionId={session.id} />
        <div className="signature-list">
          {savedSignatures.length > 0 ? savedSignatures.map((signature) => (
            <article key={signature.id} className="signature-list-item">
              <strong>{signature.signature_type}</strong>
              <span>{signature.signer_name}</span>
              <span className="muted">Signed {formatDateTime(signature.signed_at)}</span>
            </article>
          )) : <p className="muted">No signatures captured yet.</p>}
        </div>
      </section>

      <section className="card detail-card capture-card form-stack">
        <div className="captures-section-header">
          <div>
            <h2>Evidence Gallery</h2>
            <p className="muted">
              {visibleCaptures.length} saved captures · {includedCaptureCount} included · {needsReviewCount} need AI review · {extractedCaptureCount} AI completed
            </p>
            <p className="next-ai-step">
              AI actions are managed here so Session Details remains the source of truth for review and reporting.
            </p>
          </div>
          <div className="capture-ai-actions">
            <Link href={`/dashboard/sessions/${session.id}/capture`} className="button button-primary touch-target">
              Capture Evidence
            </Link>
            <ClassifyPendingCapturesButton sessionId={session.id} />
            <ExtractCaptureDetailsButton sessionId={session.id} />
          </div>
        </div>
        <CaptureList captures={visibleCaptures} signedUrls={signedUrls} />
      </section>

      <div id="extracted-evidence">
        <ExtractedEvidencePanel
          captures={visibleCaptures}
          sessionId={session.id}
          sessionValues={{
            asset_label: session.asset_label,
            vin: session.vin,
            odometer: session.odometer,
            unit_number: session.unit_number,
            customer_name: session.customer_name,
          }}
          signedUrls={signedUrls}
        />
      </div>


      <section className="card detail-card form-stack">
        <div>
          <h2>Reports</h2>
          <p className="muted">Opened, emailed, shared, and saved report actions for this session.</p>
        </div>
        <div className="signature-list">
          {(reportEvents ?? []).length > 0 ? (reportEvents ?? []).map((event) => (
            <article key={event.id} className="signature-list-item">
              <strong>{event.export_type}</strong>
              <span>{event.status}</span>
              <span className="muted">{formatDateTime(event.created_at)}</span>
            </article>
          )) : <p className="muted">No report actions yet.</p>}
        </div>
      </section>

      <section className="card detail-card final-report-review-card">
        <div>
          <h2>Final Report Review</h2>
          <p className="muted">
            Confirm Session Details, evidence notes, included captures, and report organization before opening the final printable report.
          </p>
        </div>
        <Link href={`/dashboard/sessions/${session.id}/report`} className="button button-primary touch-target">
          Report Review
        </Link>
      </section>
    </main>
  )
}
