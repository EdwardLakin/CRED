import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  CaptureList,
  ClassifyPendingCapturesButton,
  EvidenceChecklistSummary,
  ExtractCaptureDetailsButton,
  ExtractedEvidencePanel,
  ProcessPendingEvidenceButton,
  RecentCapturesList,
  getCaptureProcessingStatus,
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
import { formatReportEventLabel } from '@/features/reports/labels'

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSourceDocumentCapture(capture: { extracted_data: unknown }) {
  return isRecord(capture.extracted_data) && isRecord(capture.extracted_data.source_document)
}

function formatWorkflowStatus(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatAiDraftStatus(status: string | null) {
  if (!status) return 'Not started'
  if (status === 'approved') return 'Approved'
  return formatWorkflowStatus(status)
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

  const { data: aiDrafts } = await supabase
    .from('ai_report_drafts')
    .select('id, status, generated_at, approved_at')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .order('generated_at', { ascending: false })
    .order('created_at', { ascending: false })

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
  const processingCounts = visibleCaptures.reduce(
    (counts, capture) => {
      const status = getCaptureProcessingStatus(capture)
      if (status === 'extracted') counts.ready += 1
      if (status === 'processing' || status === 'pending' || status === 'ready_for_review') counts.processing += 1
      if (status === 'needs_review' || status === 'failed' || status === 'blocked_by_limit') counts.needsReview += 1
      return counts
    },
    { ready: 0, processing: 0, needsReview: 0 },
  )
  const needsReviewCount = processingCounts.needsReview
  const extractedCaptureCount = processingCounts.ready
  const sourceDocumentCount = visibleCaptures.filter(isSourceDocumentCapture).length
  const recentPreviewCaptures = visibleCaptures.slice(0, 4)
  const currentAiDraft = (aiDrafts ?? []).find((draft) => draft.status === 'approved') ?? (aiDrafts ?? []).find((draft) => draft.status !== 'superseded') ?? aiDrafts?.[0] ?? null
  const aiDraftStatus = formatAiDraftStatus(currentAiDraft?.status ?? null)
  const reportStatus = session.review_status === 'ready_for_delivery' ? 'Ready' : currentAiDraft ? 'Awaiting review' : 'Draft'

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <Link href="/dashboard/sessions" className="secondary-link touch-target">
            ← Back to Sessions
          </Link>
          <div className="title-row">
            <h1>{session.title}</h1>
            <SessionStatusBadge status={session.status} />
          </div>
          <p className="muted">
            {getSessionTypeLabel(session.session_type)} · Created {formatDateTime(session.created_at)} · Updated {formatDateTime(session.updated_at ?? session.created_at)}
          </p>
        </div>
        <div className="page-actions">
          <ThemeToggle />
          <Link href="/dashboard/sessions" className="button button-secondary touch-target">
            Back to Sessions
          </Link>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {captureError ? <p className="error">{captureError}</p> : null}
      {saved ? <p className="success">{appliedField ? `Applied ${appliedField.replace(/_/g, ' ')} to Session Details.` : 'Session saved.'}</p> : null}
      {captureSaved ? <p className="success">Capture added.</p> : null}

      <section className="card detail-card form-stack">
        <div>
          <p className="eyebrow">Job Summary</p>
          <h2>{session.title}</h2>
          <p className="muted">This page is the lightweight job folder. Capture work happens on the Capture page, and draft review/delivery happens on the Report page.</p>
        </div>
        <div className="required-evidence-grid">
          <p className="status-pill neutral">Status: {formatWorkflowStatus(session.status)}</p>
          <p className="status-pill neutral">Form Profile: {workflowTemplate?.name ?? 'No Form Profile / Evidence Package'}</p>
          <p className="status-pill neutral">Vehicle / Asset: {session.unit_number || session.asset_label || session.vin || 'Not set'}</p>
          <p className="status-pill neutral">Customer: {session.customer_name || 'Not set'}</p>
          <p className="status-pill info">Evidence: {processingCounts.ready} ready</p>
          <p className={processingCounts.needsReview > 0 ? 'status-pill attention' : 'status-pill neutral'}>Evidence processing: {processingCounts.ready} ready, {processingCounts.processing} processing, {processingCounts.needsReview} needs review</p>
          <p className="status-pill neutral">Source documents: {sourceDocumentCount}</p>
          <p className="status-pill info">AI Draft: {aiDraftStatus}</p>
          <p className={session.review_status === 'ready_for_delivery' ? 'status-pill success' : 'status-pill neutral'}>Report: {reportStatus}</p>
        </div>
      </section>

      <section className="card detail-card form-stack">
        <div>
          <p className="eyebrow">Actions</p>
          <h2>Next steps</h2>
          <p className="muted">Choose the workspace you need. The session page stays focused on job status and navigation.</p>
        </div>
        <div className="form-actions">
          <Link href={`/dashboard/sessions/${session.id}/capture`} className="button button-primary touch-target">
            Capture Evidence
          </Link>
          <Link href={`/dashboard/sessions/${session.id}/report`} className="button button-primary touch-target">
            Generate / Review AI Draft
          </Link>
          {session.review_status === 'ready_for_delivery' ? (
            <Link href={`/api/dashboard/sessions/${session.id}/report-pdf`} className="button button-secondary touch-target" target="_blank">
              Open Report
            </Link>
          ) : null}
          <form action={isArchived ? restoreAction : archiveAction}>
            <button className="button button-secondary touch-target">
              {isArchived ? 'Restore Archived Session' : 'Archive Session'}
            </button>
          </form>
        </div>
      </section>

      <section className="card detail-card form-stack">
        <div>
          <p className="eyebrow">Progress / Status</p>
          <h2>Evidence and report readiness</h2>
          <p className="muted">
            {visibleCaptures.length} saved captures · {includedCaptureCount} included · {sourceDocumentCount} source documents · {needsReviewCount} need AI review · {extractedCaptureCount} AI completed
          </p>
        </div>
        <div className="required-evidence-grid">
          <p className={(visibleCaptures.length > 0) ? 'checkline complete' : 'checkline neutral'}>{visibleCaptures.length > 0 ? '✓' : '○'} Evidence captured</p>
          <p className={currentAiDraft ? 'checkline complete' : 'checkline neutral'}>{currentAiDraft ? '✓' : '○'} AI Draft {currentAiDraft ? aiDraftStatus.toLowerCase() : 'not started'}</p>
          <p className={session.review_status === 'ready_for_delivery' ? 'checkline complete' : 'checkline neutral'}>{session.review_status === 'ready_for_delivery' ? '✓' : '○'} Report {reportStatus.toLowerCase()}</p>
        </div>
      </section>

      <section className="card detail-card recent-captures-card">
        <div className="captures-section-header">
          <div>
            <p className="eyebrow">Recent Evidence</p>
            <h2>Latest captures</h2>
            <p className="muted">A quick preview only. Use Capture for technician work and Report for detailed review.</p>
          </div>
          <Link href={`/dashboard/sessions/${session.id}/capture`} className="button button-secondary touch-target">
            Open Capture
          </Link>
        </div>
        <RecentCapturesList captures={recentPreviewCaptures} signedUrls={signedUrls} />
      </section>

      <section className="card detail-card form-stack">
        <details>
          <summary className="secondary-link touch-target">Advanced Details</summary>
          <div className="form-stack">
            <form action={saveAction} className="form-stack">
              <section className="form-stack">
                <div>
                  <h2>Session Details</h2>
                  <p className="muted">Edit job folder identity fields. Detailed report review lives on the Report page.</p>
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
                      {SESSION_STATUSES.map((statusOption) => (
                        <option key={statusOption.value} value={statusOption.value}>
                          {statusOption.label}
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
                <button className="button button-primary touch-target">Save Changes</button>
              </div>
            </form>

            <EvidenceChecklistSummary captures={visibleCaptures} sessionType={session.session_type} />

            <section className="form-stack">
              <div>
                <p className="eyebrow">Digital Signatures</p>
                <h2>Signature Capture</h2>
                <p className="muted">Signature capture remains available here for existing workflows, but report review happens on the Report page.</p>
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

            <section className="capture-card form-stack">
              <div className="captures-section-header">
                <div>
                  <h2>Full Evidence Gallery</h2>
                  <p className="muted">
                    {visibleCaptures.length} saved captures · {includedCaptureCount} included · {needsReviewCount} need AI review · {extractedCaptureCount} AI completed
                  </p>
                </div>
                <div className="capture-ai-actions">
                  <ProcessPendingEvidenceButton sessionId={session.id} />
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

            <section className="form-stack">
              <div>
                <h2>Report Events</h2>
                <p className="muted">Opened, emailed, shared, and saved report actions for this session.</p>
              </div>
              <div className="signature-list">
                {(reportEvents ?? []).length > 0 ? (reportEvents ?? []).map((event) => (
                  <article key={event.id} className="signature-list-item">
                    <strong>{formatReportEventLabel(event.export_type, event.status)}</strong>
                    <span>{event.status}</span>
                    <span className="muted">{formatDateTime(event.created_at)}</span>
                  </article>
                )) : <p className="muted">No report actions yet.</p>}
              </div>
            </section>
          </div>
        </details>
      </section>
    </main>
  )
}
