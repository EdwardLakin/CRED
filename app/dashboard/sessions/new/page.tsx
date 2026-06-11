import Link from 'next/link'

import { ThemeToggle } from '@/components/theme'
import { createDocumentationSession } from '@/features/sessions/actions'
import { SESSION_TYPES } from '@/features/sessions'
import { requireSessionWorkspace } from '@/features/sessions/data'

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const { supabase, profile } = await requireSessionWorkspace()
  const { data: templates } = await supabase
    .from('documentation_workflow_templates')
    .select('id, name, template_type')
    .eq('organization_id', profile.organization_id)
    .eq('status', 'active')
    .order('name', { ascending: true })

  const workflowTemplates = templates ?? []

  return (
    <main className="page-shell form-page-shell">
      <div className="section-header page-header">
        <Link href="/dashboard" className="secondary-link touch-target">
          ← Back to dashboard
        </Link>
        <ThemeToggle />
      </div>
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
              <option key={sessionType.value} value={sessionType.value}>
                {sessionType.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field-stack">
          <label htmlFor="workflow_template_id" className="label">
            Template
          </label>
          <select id="workflow_template_id" name="workflow_template_id" defaultValue="" className="select">
            <option value="">No template / standard workflow</option>
            {workflowTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.template_type})
              </option>
            ))}
          </select>
          <p className="muted">Templates define required evidence, signatures, and report structure.</p>
        </div>

        <button className="button button-primary touch-target">Create Session</button>
      </form>
    </main>
  )
}
