import Link from 'next/link'

import { createDocumentationSession } from '@/features/sessions/actions'
import { SESSION_TYPES } from '@/features/sessions'
import { requireSessionWorkspace } from '@/features/sessions/data'

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  await requireSessionWorkspace()

  return (
    <main className="page-shell form-page-shell">
      <Link href="/dashboard" className="secondary-link touch-target">
        ← Back to dashboard
      </Link>
      <div>
        <h1>New Documentation Session</h1>
        <p className="muted">
          Create the workflow container for field documentation. Evidence capture, uploads, voice notes, reports,
          billing, and AI are intentionally not part of this foundation.
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <form action={createDocumentationSession} className="card form-card form-stack">
        <div className="field-stack">
          <label htmlFor="title" className="label">
            Title
          </label>
          <input
            id="title"
            name="title"
            required
            minLength={2}
            placeholder="e.g. Unit 42 post-repair inspection"
            className="input"
          />
        </div>

        <div className="field-stack">
          <label htmlFor="session_type" className="label">
            Session Type
          </label>
          <select id="session_type" name="session_type" required defaultValue="Inspection" className="select">
            {SESSION_TYPES.map((sessionType) => (
              <option key={sessionType} value={sessionType}>
                {sessionType}
              </option>
            ))}
          </select>
        </div>

        <button className="button button-primary touch-target">Create Session</button>
      </form>
    </main>
  )
}
