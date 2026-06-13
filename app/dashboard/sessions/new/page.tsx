import Link from 'next/link'

import { ThemeToggle } from '@/components/theme'
import { createDocumentationSession } from '@/features/sessions/actions'
import { SESSION_TYPES } from '@/features/sessions'
import { requireSessionWorkspace } from '@/features/sessions/data'

function getDefaultSessionType(type: string | undefined) {
  if (type === 'inspection') return 'Inspection'
  if (type === 'field_service_report') return 'field_service_report'
  return 'General Documentation'
}

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ error?: string; type?: string }> }) {
  const { error, type } = await searchParams
  const defaultSessionType = getDefaultSessionType(type)
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
          Create an evidence package for field documentation. Capture evidence naturally, add context, and let CRED organize the
          report draft later. Choose a starting point. You can still capture evidence in any order.
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
          <select id="session_type" name="session_type" required defaultValue={defaultSessionType} className="select">
            {SESSION_TYPES.map((sessionType) => (
              <option key={sessionType.value} value={sessionType.value}>
                {sessionType.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field-stack">
          <label htmlFor="workflow_template_id" className="label">
            Form Profile
          </label>
          <select id="workflow_template_id" name="workflow_template_id" defaultValue="" className="select">
            <option value="">No Form Profile / Evidence Package</option>
            {workflowTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.template_type})
              </option>
            ))}
          </select>
          <p className="muted">A Form Profile helps CRED organize the final report. It does not control your capture order. You can still capture evidence without a profile.</p>
        </div>

        <button className="button button-primary touch-target">Create Session</button>
      </form>
    </main>
  )
}
