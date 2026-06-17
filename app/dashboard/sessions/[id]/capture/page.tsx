import { notFound } from 'next/navigation'

import { getPlanLimits, parseBillingPlan } from '@/features/billing'
import { AddCaptureForm, RecentCapturesList } from '@/features/capture'
import { getDisplayReportTitle } from '@/features/reports/report-title'
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
    .is('deleted_at', null)
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

  const planLimits = getPlanLimits(parseBillingPlan(profile.organization.plan))
  const displaySessionTitle = getDisplayReportTitle(null, session)
  return (
    <main className="page-shell dashboard-shell focused-capture-shell">
      <div className="section-header page-header focused-capture-header">
        <div>
          <h1>Capture Evidence</h1>
          <p className="muted">{displaySessionTitle}</p>
          <p className="muted">If you have a paper form, capture it first.</p>
          <p className="status-pill neutral">AI Assist: {profile.organization.image_ai_assist_enabled ? 'On' : 'Off'}</p>
        </div>
      </div>

      {captureSaved ? <p className="success">Saved. Keep capturing or tap Done.</p> : null}

      <section className="card detail-card focused-capture-card" id="main-capture-card">
        <AddCaptureForm
          sessionId={session.id}
          organizationId={session.organization_id}
          sessionType={session.session_type}
          returnPath={`/dashboard/sessions/${session.id}/capture#main-capture-card`}
          captureButtonLabel="Camera"
          helperText="Capture photos or choose media from your gallery."
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
        <RecentCapturesList captures={captureItems} signedUrls={signedUrls} timeZone={profile.timezone} />
      </section>
    </main>
  )
}
