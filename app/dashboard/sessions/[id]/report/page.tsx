import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getRequiredEvidenceCompletion } from '@/features/capture'
import { approveAiReportDraft, createReportShareLink, disableReportShareLink, emailReport, generateAiReportDraft, markReportReviewed, saveReport } from '@/features/reports/actions'
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
  searchParams: Promise<{ approved_draft?: string; disabled?: string; draft?: string; emailed?: string; error?: string; reviewed?: string; saved?: string; shared?: string }>
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

  const { data: aiDrafts } = await supabase
    .from('ai_report_drafts')
    .select('*')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .order('generated_at', { ascending: false })
    .order('created_at', { ascending: false })

  const currentAiDraft = (aiDrafts ?? []).find((draft) => draft.status === 'approved') ?? (aiDrafts ?? []).find((draft) => draft.status !== 'superseded') ?? aiDrafts?.[0] ?? null
  const { data: aiDraftSections } = currentAiDraft
    ? await supabase
        .from('ai_report_draft_sections')
        .select('*')
        .eq('ai_report_draft_id', currentAiDraft.id)
        .eq('organization_id', profile.organization_id)
        .order('sort_order', { ascending: true })
    : { data: [] }

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
  const generateDraftAction = generateAiReportDraft.bind(null, session.id)
  const approveDraftAction = currentAiDraft ? approveAiReportDraft.bind(null, currentAiDraft.id) : null

  return (
    <main className="page-shell dashboard-shell report-preview-shell">
      <div className="section-header page-header report-preview-header">
        <div>
          <p className="eyebrow guided-eyebrow">Report page</p>
          <h1>{session.title}</h1>
          <p className="muted">CRED prepares a report draft from your Evidence and selected Form Profile. Review before delivery. Form Profile: {template?.name ?? 'No Form Profile / Evidence Package'}.</p>
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
      {status.draft ? <p className="success">AI Draft generated. Human Review Required before delivery.</p> : null}
      {status.approved_draft ? <p className="success">AI Draft approved and ready for delivery.</p> : null}
      {!isReadyForDelivery ? <p className="error">Review and approve this report draft before delivery.</p> : null}
      {status.disabled ? <p className="success">Share link disabled.</p> : null}

      <section className="card detail-card report-delivery-card form-stack">
        <div>
          <p className="eyebrow">Review Draft</p>
          <h2>AI Draft</h2>
          <p className="muted">CRED will organize your captured evidence using the selected Form Profile as Report Context. Review before delivery.</p>
          <p className="muted"><strong>Human Review Required:</strong> AI Drafts are prepared from captured evidence and notes. Review before delivery.</p>
        </div>
        {!currentAiDraft ? (
          <form action={generateDraftAction} className="form-stack">
            <div className="required-evidence-grid">
              <p className="checkline complete">✓ Report Context: {template?.name ?? 'No Form Profile / Evidence Package'}</p>
              <p className={(captures ?? []).length > 0 ? 'checkline complete' : 'checkline missing'}>{(captures ?? []).length > 0 ? '✓' : '○'} Evidence captures available</p>
              <p className="checkline complete">✓ Source Documents and extracted details included when available</p>
            </div>
            <div className="form-actions">
              <button className="button button-primary touch-target">Generate AI Draft</button>
              <Link href={`/dashboard/sessions/${session.id}/capture`} className="button button-secondary touch-target">Capture More Evidence</Link>
            </div>
          </form>
        ) : (
          <div className="form-stack">
            <div className="template-library-item">
              <div>
                <p className="eyebrow">Status: {currentAiDraft.status}</p>
                <h3>{currentAiDraft.title ?? session.title}</h3>
                {currentAiDraft.summary ? <p className="muted">{currentAiDraft.summary}</p> : null}
                <p className="muted">Generated: {currentAiDraft.generated_at ? formatDateTime(currentAiDraft.generated_at) : 'Not recorded'} · Confidence: {typeof currentAiDraft.confidence === 'number' ? `${Math.round(currentAiDraft.confidence * 100)}%` : 'Not available'}</p>
                {currentAiDraft.status === 'approved' ? <p className="success">This is the approved AI Draft used for delivery.</p> : null}
              </div>
            </div>
            <div className="signature-list">
              {(aiDraftSections ?? []).map((section) => (
                <article key={section.id} className="signature-list-item">
                  <div className="form-stack">
                    <div>
                      <strong>{section.title}</strong>
                      {section.status ? <span className="status-badge">{section.status.replace('_', ' ')}</span> : null}
                      {typeof section.confidence === 'number' ? <span className="muted"> Confidence: {Math.round(section.confidence * 100)}%</span> : null}
                    </div>
                    {section.body ? <p className="muted">{section.body}</p> : null}
                    {section.source_capture_ids.length > 0 ? <p className="muted">Source capture references: {section.source_capture_ids.join(', ')}</p> : <p className="muted">Source capture references: none supplied; review before relying on this section.</p>}
                  </div>
                </article>
              ))}
            </div>
            {Array.isArray(currentAiDraft.unmapped_evidence) && currentAiDraft.unmapped_evidence.length > 0 ? (
              <div>
                <h3>Unmapped Evidence</h3>
                <pre className="muted">{JSON.stringify(currentAiDraft.unmapped_evidence, null, 2)}</pre>
              </div>
            ) : null}
            <p className="muted">TODO: Add inline edit, move, merge, and source-reference controls for future AI Draft review.</p>
            <div className="form-actions">
              <form action={generateDraftAction}><button className="button button-secondary touch-target">Generate new draft</button></form>
              {currentAiDraft.status !== 'approved' && approveDraftAction ? <form action={approveDraftAction}><button className="button button-primary touch-target">Approve Draft</button></form> : null}
            </div>
          </div>
        )}
      </section>

      {evidence.missing.length > 0 ? (
        <section className="card detail-card missing-evidence-warning">
          <div>
            <p className="eyebrow">Unresolved Coverage Suggestions</p>
            <h2>This report has unresolved coverage suggestions.</h2>
            <p className="muted">Approve with unresolved items or return to Capture to add more evidence. Suggestions are reminders only.</p>
          </div>
          <div className="required-evidence-grid">
            {evidence.missing.map((row) => <p key={row.rule.key} className="checkline missing">○ {row.rule.label}</p>)}
          </div>
          <div className="form-actions">
            <Link href={`/dashboard/sessions/${session.id}/capture`} className="button button-primary touch-target">Return to Capture</Link>
          </div>
        </section>
      ) : <p className="success">All coverage suggestions are resolved.</p>}

      <section className="card detail-card report-delivery-card form-stack">
        <div>
          <p className="eyebrow">Human Review Gate</p>
          <h2>{isReadyForDelivery ? 'Reviewed and ready to deliver' : 'Review before delivery'}</h2>
          <p className="muted">Confirm the draft report is ready before emailing, sharing, saving, or opening the final printable report.</p>
          {reviewedLabel ? (
            <p className="success">Reviewed {reviewedLabel}{reviewer?.full_name ? ` by ${reviewer.full_name}` : session.reviewed_by ? ` by ${session.reviewed_by}` : ''}.</p>
          ) : null}
        </div>
        <div className="required-evidence-grid">
          <p className={evidence.missing.length === 0 ? 'checkline complete' : 'checkline missing'}>{evidence.missing.length === 0 ? '✓' : '○'} Coverage suggestions reviewed</p>
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
                I acknowledge this report has unresolved coverage suggestions and approve with unresolved items.
              </label>
            ) : null}
            <div className="form-actions">
              <button className="button button-primary touch-target">{evidence.missing.length > 0 ? 'Approve with unresolved items' : 'Approve Report Draft'}</button>
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
          {!isReadyForDelivery ? <p className="error">Review and approve this report draft before delivery.</p> : null}
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
          {!isReadyForDelivery ? <p className="error">Review and approve this report draft before delivery.</p> : null}
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
          {!isReadyForDelivery ? <p className="error">Review and approve this report draft before delivery.</p> : null}
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
