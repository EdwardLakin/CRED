import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getRequiredEvidenceCompletion } from '@/features/capture'
import { createReportShareLink, disableReportShareLink, emailReport, saveReport } from '@/features/reports/actions'
import { formatDateTime } from '@/features/sessions'
import { requireSessionWorkspace } from '@/features/sessions/data'

function getReportOrigin(headersList: Headers) {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
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
  searchParams: Promise<{ disabled?: string; emailed?: string; error?: string; saved?: string; shared?: string }>
}) {
  const { id } = await params
  const status = await searchParams
  const { supabase, profile } = await requireSessionWorkspace()
  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('id, title, session_type, organization_id, workflow_template_id')
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
          <Link href={reportPath} className="button button-primary touch-target" target="_blank">Open Printable Report</Link>
          <Link href={`/dashboard/sessions/${session.id}`} className="button button-secondary touch-target">Back to Session</Link>
          <Link href="/dashboard" className="button button-secondary touch-target">Finish</Link>
        </div>
      </div>

      {status.error ? <p className="error">{status.error}</p> : null}
      {status.emailed ? <p className="success">Report email recorded with organization profile branding.</p> : null}
      {status.shared ? <p className="success">Secure share link generated.</p> : null}
      {status.saved ? <p className="success">Report saved indefinitely unless deleted.</p> : null}
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
            <Link href={reportPath} target="_blank" className="button button-secondary touch-target">Open Report Anyway</Link>
            <Link href={`/dashboard/sessions/${session.id}/capture`} className="button button-primary touch-target">Return to Capture</Link>
          </div>
        </section>
      ) : <p className="success">All required evidence is complete.</p>}

      <section className="card detail-card report-delivery-card form-stack">
        <div>
          <p className="eyebrow">Report Delivery</p>
          <h2>Email Report</h2>
          <p className="muted">Uses organization profile branding. Subject example: Inspection Report - Unit 1234.</p>
        </div>
        <form action={emailAction} className="field-grid">
          <div className="field-stack"><label htmlFor="recipients" className="label">Customer email / recipients</label><input id="recipients" name="recipients" className="input" placeholder="customer@example.com; manager@example.com" required /></div>
          <div className="field-stack"><label htmlFor="message" className="label">Custom message</label><textarea id="message" name="message" className="input text-area" placeholder="Please review the attached report." /></div>
          <div className="form-actions field-wide"><button className="button button-primary touch-target">Email Report</button></div>
        </form>
      </section>

      <section className="card detail-card report-delivery-card form-stack">
        <div>
          <h2>Share Link</h2>
          <p className="muted">Generate secure report links with expiration, disable access, and view tracking.</p>
        </div>
        <form action={shareAction} className="field-grid">
          <div className="field-stack"><label htmlFor="expires_at" className="label">Expiration date</label><input id="expires_at" name="expires_at" className="input" type="datetime-local" /></div>
          <div className="form-actions"><button className="button button-secondary touch-target">Share Link</button></div>
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
        </div>
        <form action={saveAction}><button className="button button-primary touch-target">Save Report</button></form>
        <div className="signature-list">
          {(reportEvents ?? []).map((event) => <article key={event.id} className="signature-list-item"><strong>{event.export_type}</strong><span>{event.status}</span><span className="muted">{formatDateTime(event.created_at)}</span></article>)}
        </div>
      </section>

      <section className="card detail-card report-preview-card" aria-label="CRED printable report preview">
        <p className="muted">Use your browser’s Print or Share menu from the printable report to save as PDF.</p>
        <iframe src={reportPath} title={`CRED printable report preview for ${session.title}`} className="report-preview-frame" />
      </section>
    </main>
  )
}
