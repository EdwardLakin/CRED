import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AddCaptureForm, RecentCapturesList, WORKFLOW_LABELS, getWorkflow } from '@/features/capture'
import { formatDateTime } from '@/features/sessions'
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
      const { data } = await supabase.storage.from('documentation-captures').createSignedUrl(capture.storage_path, 60 * 10)

      if (data?.signedUrl) {
        signedUrls[capture.id] = data.signedUrl
      }
    }),
  )

  const workflow = getWorkflow(session.session_type)

  return (
    <main className="page-shell dashboard-shell focused-capture-shell">
      <div className="section-header page-header focused-capture-header">
        <div>
          <p className="eyebrow guided-eyebrow">Technician workspace</p>
          <h1>Capture Evidence</h1>
          <p className="muted">
            {session.title} · {WORKFLOW_LABELS[workflow]} · Updated {formatDateTime(session.updated_at ?? session.created_at)}
          </p>
        </div>
        <Link href={`/dashboard/sessions/${session.id}/report`} className="button button-secondary touch-target">
          Done
        </Link>
      </div>

      {captureSaved ? <p className="success">Capture saved. Continue gathering evidence or tap Done.</p> : null}

      <section className="card detail-card focused-capture-card" id="main-capture-card">
        <div>
          <p className="eyebrow guided-eyebrow">Photo · Video · Voice note</p>
          <h2>Capture Evidence</h2>
          <p className="muted">
            Use the large capture control for field evidence. Draft preview cards appear before saving, and recent captures stay below for quick confirmation.
          </p>
        </div>
        <AddCaptureForm
          sessionId={session.id}
          organizationId={session.organization_id}
          sessionType={session.session_type}
          workflow={workflow}
          returnPath={`/dashboard/sessions/${session.id}/capture#main-capture-card`}
          captureButtonLabel="Capture Evidence"
          helperText="Take a photo/video or select evidence, add a quick voice or typed note, then save."
          commonCaptureText="Supported workflows: photo, video, voice note, and combined photo/video plus voice or typed context."
          showSuggestedCaptureText={false}
          stickyDoneHref={`/dashboard/sessions/${session.id}/report`}
        />
      </section>

      <section className="card detail-card recent-captures-card">
        <div className="captures-section-header">
          <div>
            <h2>Recent Captures</h2>
            <p className="muted">Quick confirmation of the latest saved evidence. Full review, AI actions, checklist, and export live on Session Details.</p>
          </div>
          <span className="ai-status-pill">{captureItems.length} saved</span>
        </div>
        <RecentCapturesList captures={captureItems} signedUrls={signedUrls} />
      </section>

    </main>
  )
}
