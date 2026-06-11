import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/features/sessions'

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data: shareToken, error } = await supabase
    .from('report_share_tokens')
    .select('*, documentation_sessions(id, title, organization_id)')
    .eq('token', token)
    .maybeSingle()

  if (error || !shareToken || shareToken.disabled_at) notFound()
  if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) notFound()

  await supabase
    .from('report_share_tokens')
    .update({ view_count: (shareToken.view_count ?? 0) + 1, last_viewed_at: new Date().toISOString() })
    .eq('id', shareToken.id)

  const session = Array.isArray(shareToken.documentation_sessions) ? shareToken.documentation_sessions[0] : shareToken.documentation_sessions
  if (!session) notFound()

  return (
    <main className="page-shell dashboard-shell report-preview-shell">
      <div className="section-header page-header report-preview-header">
        <div>
          <p className="eyebrow">Secure report link</p>
          <h1>{session.title}</h1>
          <p className="muted">Shared report access expires {shareToken.expires_at ? formatDateTime(shareToken.expires_at) : 'when disabled by the organization'}.</p>
        </div>
      </div>
      <section className="card detail-card report-preview-card">
        <p className="muted">Open the report from the secure shared preview below.</p>
        <iframe src={`/api/dashboard/sessions/${session.id}/report-pdf`} title={`Shared report preview for ${session.title}`} className="report-preview-frame" />
      </section>
    </main>
  )
}
