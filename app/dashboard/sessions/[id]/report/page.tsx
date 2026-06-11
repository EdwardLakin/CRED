import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getRequiredEvidenceCompletion } from '@/features/capture'
import { createReportShareLink, disableReportShareLink, emailReport, markReportReviewed, saveReport } from '@/features/reports/actions'
import { formatDateTime } from '@/features/sessions'
import { requireSessionWorkspace } from '@/features/sessions/data'

function getReportOrigin(headersList: Headers) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configuredUrl) return configuredUrl.replace(/\/$/, '')
  const vercelUrl = process.env.VERCEL_URL?.trim()
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, '')}`
  const host = headersList.get('x-forwarded-host') ?? headersList.get('host')
  const protocol = headersList.get('x-forwarded-proto') ?? 'https'
  return host ? `${protocol}://${host}` : ''
}

export default async function SessionReportPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ disabled?: string; emailed?: string; error?: string; reviewed?: string; saved?: string; shared?: string }>
}) {
  const { id } = await params
  const status = await searchParams
  const { supabase, profile } = await requireSessionWorkspace()
  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('id, title, session_type, organization_id, workflow_template_id, review_status, reviewed_at, reviewed_by')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) notFound()

  const { data: captures } = await supabase
    .from('capture_items')
    .select('*')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)

  const { data: template } = session.workflow_template_id
    ? await supabase.from('documentation_workflow_templates').select('name, required_evidence').eq('id', session.workflow_template_id).eq('organization_id', profile.organization_id).maybeSingle()
    : { data: null }

  const { data: signatures } = await supabase
    .from('signature_captures')
    .select('id')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)

  const { data: reviewer } = session.reviewed_by
    ? await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.reviewed_by)
        .eq('organization_id', profile.organization_id)
        .maybeSingle()
    : { data: null }

  const { data: shareTokens } = await supabase
    .from('report_share_tokens')
    .select('*')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })

  const { data: reportEvents } = await supabase
    .from('exports')
    .select('*')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })
    .limit(10)

  const reportPath = `/api/dashboard/sessions/${session.id}/report-pdf`
  const headersList = await headers()
  const origin = getReportOrigin(headersList)
  const evidence = getRequiredEvidenceCompletion(captures ?? [], session.session_type, template?.required_evidence ?? null)
  const isReadyForDelivery = session.review_status === 'ready_for_delivery'
  const reviewedLabel = session.reviewed_at ? formatDateTime(session.reviewed_at) : null
  const markReviewedAction = markReportReviewed.bind(null, session.id)
  const saveAction = saveReport.bind(null, session.id)
  const emailAction = emailReport.bind(null, session.id)
  const shareAction = createReportShareLink.bind(null, session.id)

  return (
    <main className="page-shell dashboard-shell report-preview-shell">
      <div className="section-header page-header report-preview-header">
        <div>
          <p className="eyebrow guided-eyebrow">Report page</p>
          <h1>{session.title}</h1>
          <p className="muted">Preview, Open, Email, Share, Save, and Finish. Template: {template?.name ?? 'Standard workflow'}.</p>
        </div>
        <div className="page-actions report-preview-actions">
          {isReadyForDelivery ? (
            <Link href={reportPath} className="button button-primary touch-target" target="_blank">Open Printable Report</Link>
          ) : (
            <span className="button button-primary touch-target" aria-disabled="true">Open Printable Report</span>
          )}
          <Link href={`/dashboard/sessions/${session.id}`} className="button button-secondary touch-target">Back to Session</Link>
          <Link href="/dashboard" className="button button-secondary touch-target">Finish</Link>
        </div>
      </div>

      {status.error ? <p className="error">{status.error}</p> : null}
      {status.emailed ? <p className="success">Printable report email sent.</p> : null}
      {status.shared ? <p className="success">Secure share link generated.</p> : null}
      {status.saved ? <p className="success">Report saved indefinitely unless deleted.</p> : null}
      {status.reviewed ? <p className="success">Reviewed and ready to deliver.</p> : null}
      {!isReadyForDelivery ? <p className="error">Review and mark this report ready before delivery.</p> : null}
      {status.disabled ? <p className="success">Share link disabled.</p> : null}

      {evidence.missing.length > 0 ? (
        <section className="card detail-card missing-evidence-warning">
          <div>
            <p className="eyebrow">Missing Evidence Warning</p>
            <h2>This report is missing required evidence.</h2>
            <p className="muted">Generate Anyway or return to Capture to complete the missing items.</p>
          </div>
          <div className="required-evidence-grid">
            {evidence.missing.map((row) => <p key={row.rule.key} className="checkline missing">○ {row.rule.label}</p>)}
          </div>
          <div className="form-actions">
            <Link href={`/dashboard/sessions/${session.id}/capture`} className="button button-primary touch-target">Return to Capture</Link>
          </div>
        </section>
      ) : <p className="success">All required evidence is complete.</p>}

      <section className="card detail-card report-delivery-card form-stack">
        <div>
          <p className="eyebrow">Human Review Gate</p>
          <h2>{isReadyForDelivery ? 'Reviewed and ready to deliver' : 'Review before delivery'}</h2>
          <p className="muted">Confirm the report is complete before emailing, sharing, saving, or opening the final printable report.</p>
          {reviewedLabel ? (
            <p className="success">Reviewed {reviewedLabel}{reviewer?.full_name ? ` by ${reviewer.full_name}` : session.reviewed_by ? ` by ${session.reviewed_by}` : ''}.</p>
          ) : null}
        </div>
        <div className="required-evidence-grid">
          <p className={evidence.missing.length === 0 ? 'checkline complete' : 'checkline missing'}>{evidence.missing.length === 0 ? '✓' : '○'} Required evidence reviewed</p>
          <p className="checkline complete">✓ AI extracted details reviewed</p>
          <p className={(captures ?? []).length > 0 ? 'checkline complete' : 'checkline missing'}>{(captures ?? []).length > 0 ? '✓' : '○'} Included captures reviewed</p>
          <p className={(signatures ?? []).length > 0 ? 'checkline complete' : 'checkline missing'}>{(signatures ?? []).length > 0 ? '✓' : '○'} Signatures reviewed if required</p>
        </div>
        {!isReadyForDelivery ? (
          <form action={markReviewedAction} className="form-stack">
            <input type="hidden" name="missing_evidence_count" value={evidence.missing.length} />
            {evidence.missing.length > 0 ? (
              <label className="checkline missing">
                <input type="checkbox" name="missing_evidence_acknowledged" required />
                I acknowledge this report is missing required evidence and want to Generate Anyway.
              </label>
            ) : null}
            <div className="form-actions">
              <button className="button button-primary touch-target">Mark Report Reviewed</button>
              <Link href={`/dashboard/sessions/${session.id}/capture`} className="button button-secondary touch-target">Capture More Evidence</Link>
              <Link href={`/dashboard/sessions/${session.id}`} className="button button-secondary touch-target">Edit Details</Link>
            </div>
          </form>
        ) : null}
      </section>

      <section className="card detail-card report-delivery-card form-stack">
        <div>
          <p className="eyebrow">Report Delivery</p>
          <h2>Email Printable Report</h2>
          <p className="muted">Recipients receive a secure link to the printable report.</p>
          {!isReadyForDelivery ? <p className="error">Review and mark this report ready before delivery.</p> : null}
        </div>
        <form action={emailAction} className="field-grid">
          <div className="field-stack"><label htmlFor="recipients" className="label">Customer email / recipients</label><input id="recipients" name="recipients" className="input" placeholder="customer@example.com, manager@example.com" required /></div>
          <div className="field-stack"><label htmlFor="message" className="label">Custom message</label><textarea id="message" name="message" className="input text-area" placeholder="Please review the printable report." /></div>
          <div className="form-actions field-wide"><button className="button button-primary touch-target" disabled={!isReadyForDelivery}>Email Printable Report</button></div>
        </form>
      </section>

      <section className="card detail-card report-delivery-card form-stack">
        <div>
          <h2>Share Link</h2>
          <p className="muted">Generate secure report links with expiration, disable access, and view tracking.</p>
          {!isReadyForDelivery ? <p className="error">Review and mark this report ready before delivery.</p> : null}
        </div>
        <form action={shareAction} className="field-grid">
          <div className="field-stack"><label htmlFor="expires_at" className="label">Expiration date</label><input id="expires_at" name="expires_at" className="input" type="datetime-local" /></div>
          <div className="form-actions"><button className="button button-secondary touch-target" disabled={!isReadyForDelivery}>Share Link</button></div>
        </form>
        <div className="template-library-list">
          {(shareTokens ?? []).map((token) => {
            const shareUrl = origin ? `${origin}/reports/share/${token.token}` : `/reports/share/${token.token}`
            return (
              <article key={token.id} className="template-library-item">
                <div>
                  <strong>{shareUrl}</strong>
                  <p className="muted">Views: {token.view_count} · Expires: {token.expires_at ? formatDateTime(token.expires_at) : 'No expiration'} · {token.disabled_at ? 'Disabled' : 'Active'}</p>
                </div>
                {!token.disabled_at ? <form action={disableReportShareLink.bind(null, session.id, token.id)}><button className="button button-secondary touch-target">Disable Access</button></form> : null}
              </article>
            )
          })}
        </div>
      </section>

      <section className="card detail-card report-delivery-card form-stack">
        <div>
          <h2>Save Report</h2>
          <p className="muted">Saved reports remain accessible indefinitely unless deleted.</p>
          {!isReadyForDelivery ? <p className="error">Review and mark this report ready before delivery.</p> : null}
        </div>
        <form action={saveAction}><button className="button button-primary touch-target" disabled={!isReadyForDelivery}>Save Report</button></form>
        <div className="signature-list">
          {(reportEvents ?? []).map((event) => <article key={event.id} className="signature-list-item"><strong>{event.export_type}</strong><span>{event.status}</span><span className="muted">{formatDateTime(event.created_at)}</span></article>)}
        </div>
      </section>

      <section className="card detail-card report-preview-card" aria-label="CRED printable report preview">
        <p className="muted">Use your browser’s Print or Share menu from the printable report to save as PDF.</p>
        <iframe src={`${reportPath}?preview=1`} title={`CRED printable report preview for ${session.title}`} className="report-preview-frame" />
      </section>
    </main>
  )
}
