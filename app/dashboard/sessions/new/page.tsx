import Link from 'next/link'

import { createQuickCaptureSession } from '@/features/sessions/actions'

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams

  return (
    <main className="page-shell form-page-shell">
      <div className="section-header page-header">
        <Link href="/dashboard" className="secondary-link touch-target">
          ← Back to dashboard
        </Link>
      </div>
      <section className="card form-card form-stack">
        <div>
          <p className="eyebrow">New Session</p>
          <h1>Start capturing evidence.</h1>
          <p className="muted">No setup is required. CRED creates the session and opens capture.</p>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <form action={createQuickCaptureSession}>
          <button className="button button-primary touch-target">Open Capture</button>
        </form>
      </section>
    </main>
  )
}
