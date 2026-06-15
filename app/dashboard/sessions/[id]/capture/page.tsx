import { notFound } from 'next/navigation'

import { getPlanLimits, parseBillingPlan } from '@/features/billing'
import { AddCaptureForm, RecentCapturesList, getInspectionProgress } from '@/features/capture'
import { completeCaptureAndPrepareReport } from '@/features/reports/actions'
import { requireSessionWorkspace } from '@/features/sessions/data'

export default async function GuidedCapturePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ captureSaved?: string }>
}) {
  const { id } = await params
  const { captureSaved } = await searchParams
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
    .is('deleted_at', null)
    .order('captured_at', { ascending: false })

  const captureItems = captures ?? []
  const signedUrls: Record<string, string> = {}
  await Promise.all(
    captureItems.map(async (capture) => {
      if (!capture.storage_path) return

      const { data } = await supabase.storage.from('documentation-captures').createSignedUrl(capture.storage_path, 60 * 10)

      if (data?.signedUrl) {
        signedUrls[capture.id] = data.signedUrl
      }
    }),
  )

  const { data: template } = session.workflow_template_id
    ? await supabase
        .from('documentation_workflow_templates')
        .select('name, required_evidence')
        .eq('id', session.workflow_template_id)
        .eq('organization_id', profile.organization_id)
        .maybeSingle()
    : { data: null }

  const { count: signatureCount } = await supabase
    .from('signature_captures')
    .select('id', { count: 'exact', head: true })
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)

  const progress = getInspectionProgress(captureItems, session.session_type, template?.required_evidence ?? null, signatureCount ?? 0)
  const planLimits = getPlanLimits(parseBillingPlan(profile.organization.plan))
  const doneAction = completeCaptureAndPrepareReport.bind(null, session.id)

  return (
    <main className="page-shell dashboard-shell focused-capture-shell">
      <div className="section-header page-header focused-capture-header">
        <div>
          <h1>Capture Evidence</h1>
          <p className="muted">{session.title}</p>
          <p className="muted">If you have a paper form, capture it first.</p>
        </div>
        <form action={doneAction}>
          <button className="button button-primary touch-target">Done</button>
        </form>
      </div>

      {captureSaved ? <p className="success">Saved. Keep capturing or tap Done.</p> : null}

      <section className="card detail-card form-stack" aria-labelledby="inspection-progress-heading">
        <div className="captures-section-header">
          <div>
            <p className="eyebrow">AI-guided inspection</p>
            <h2 id="inspection-progress-heading">Live inspection progress</h2>
            <p className="muted">CRED updates the draft report as evidence is captured. AI can suggest, extract, organize, and draft — technician approval is still required.</p>
          </div>
          <span className="status-pill neutral">{template?.name ?? 'Inspection Template'}</span>
        </div>
        <div className="inspection-metric-grid">
          <div><span>Inspection Complete</span><strong>{progress.inspectionComplete}%</strong></div>
          <div><span>Remaining Required Items</span><strong>{progress.remainingRequiredItems}</strong></div>
          <div><span>Critical Findings</span><strong>{progress.criticalFindings}</strong></div>
          <div><span>Missing Evidence</span><strong>{progress.missingEvidence}</strong></div>
        </div>
        <div className="inspection-metric-grid">
          <div><span>Evidence Completeness</span><strong>{progress.evidenceCompleteness}%</strong></div>
          <div><span>Finding Confidence</span><strong>{progress.findingConfidence}%</strong></div>
          <div><span>Report Readiness</span><strong>{progress.reportReadiness}%</strong></div>
        </div>
        <p className="notice info"><strong>Suggested Next Step:</strong> {progress.nextStep}</p>
        {progress.missingReadinessItems.length > 0 ? (
          <p className="muted">Missing: {progress.missingReadinessItems.join(', ')}</p>
        ) : null}
      </section>

      <section className="card detail-card focused-capture-card" id="main-capture-card">
        <AddCaptureForm
          sessionId={session.id}
          organizationId={session.organization_id}
          sessionType={session.session_type}
          returnPath={`/dashboard/sessions/${session.id}/capture#main-capture-card`}
          captureButtonLabel="Camera"
          helperText="Capture photos, choose from gallery, add a voice note, or type a note."
          commonCaptureText=""
          showSuggestedCaptureText={false}
          stickyDoneHref={`/dashboard/sessions/${session.id}/report`}
          maxCaptureFileSizeBytes={planLimits.maxCaptureFileSizeBytes}
          maxVideoFileSizeBytes={planLimits.maxVideoFileSizeBytes}
        />
      </section>

      <section className="card detail-card recent-captures-card">
        <div className="captures-section-header">
          <div>
            <h2>Recent Captures</h2>
            <p className="muted">Your latest evidence is saved here. Continue capturing until the job is done.</p>
          </div>
          <span className="status-pill neutral">{captureItems.length} saved</span>
        </div>
        <RecentCapturesList captures={captureItems} signedUrls={signedUrls} />
      </section>
    </main>
  )
}
