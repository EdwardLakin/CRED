import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireSessionWorkspace } from '@/features/sessions/data'

function getReportOrigin(headersList: Headers) {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '')
  }

  const vercelUrl = process.env.VERCEL_URL?.trim()
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/\/$/, '')}`
  }

  const host = headersList.get('x-forwarded-host') ?? headersList.get('host')
  const protocol = headersList.get('x-forwarded-proto') ?? 'https'

  return host ? `${protocol}://${host}` : ''
}

export default async function SessionReportPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase, profile } = await requireSessionWorkspace()
  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('id, title, organization_id')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) {
    notFound()
  }

  const reportPath = `/api/dashboard/sessions/${session.id}/report-pdf`
  const headersList = await headers()
  const origin = getReportOrigin(headersList)
  const reportUrl = origin ? `${origin}${reportPath}` : reportPath
  const emailHref = `mailto:?subject=${encodeURIComponent(`CRED Report - ${session.title}`)}&body=${encodeURIComponent(`Review the CRED report here: ${reportUrl}`)}`

  return (
    <main className="page-shell dashboard-shell report-preview-shell">
      <div className="section-header page-header report-preview-header">
        <div>
          <p className="eyebrow guided-eyebrow">Report preview</p>
          <h1>{session.title}</h1>
          <p className="muted">
            Review the print-ready report, share a mailto draft, or finish back to the dashboard.
          </p>
        </div>
        <div className="page-actions report-preview-actions">
          <Link href={reportPath} className="button button-primary touch-target" target="_blank">
            Download / Print PDF
          </Link>
          <a href={emailHref} className="button button-secondary touch-target">
            Email Report
          </a>
          <Link href={`/dashboard/sessions/${session.id}`} className="button button-secondary touch-target">
            Back to Session
          </Link>
          <Link href="/dashboard" className="button button-secondary touch-target">
            Finish
          </Link>
        </div>
      </div>

      <section className="card detail-card report-preview-card" aria-label="CRED report PDF preview">
        <iframe src={reportPath} title={`CRED report preview for ${session.title}`} className="report-preview-frame" />
      </section>
    </main>
  )
}
