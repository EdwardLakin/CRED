import Link from 'next/link'

import { ThemeToggle } from '@/components/theme'
import { formatDateTime } from '@/features/sessions'
import { requireInternalAdminWorkspace } from '@/features/sessions/data'
import { SYSTEM_TEMPLATES } from '@/features/templates'
import { archiveTemplate, deleteTemplate, duplicateOrganizationTemplate, duplicateSystemTemplate, importTemplate, saveTemplate } from '@/features/templates/actions'
import type { Json } from '@/lib/supabase/database.types'

function jsonList(value: Json) {
  if (!Array.isArray(value)) return ''
  return value.map((item) => {
    if (typeof item === 'string') return item
    if (item && typeof item === 'object' && 'label' in item && typeof item.label === 'string') return item.label
    return ''
  }).filter(Boolean).join('\n')
}

export default async function TemplatesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; deleted?: string; duplicated?: string; error?: string; imported?: string; saved?: string }>
}) {
  const params = await searchParams
  const { supabase, profile } = await requireInternalAdminWorkspace()
  const { data: templates, error } = await supabase
    .from('documentation_workflow_templates')
    .select('*, profiles(full_name)')
    .eq('organization_id', profile.organization_id)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  const organizationTemplates = templates ?? []

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <Link href="/dashboard" className="secondary-link touch-target">← Dashboard</Link>
          <p className="eyebrow">Internal / Admin</p>
          <h1>Report context library</h1>
          <p className="muted">Admin-only compatibility tools for reusable report context. Normal users can start capturing evidence without choosing or managing any setup.</p>
        </div>
        <div className="page-actions">
          <ThemeToggle />
          <Link href="/dashboard/sessions/new" className="button button-secondary touch-target">New Session</Link>
        </div>
      </div>

      {params.error ? <p className="error">{params.error}</p> : null}
      {params.imported ? <p className="success">Report context imported. Draft is ready for admin review.</p> : null}
      {params.saved ? <p className="success">Report context saved.</p> : null}
      {params.duplicated ? <p className="success">Report context duplicated.</p> : null}
      {params.archived ? <p className="success">Report context archived.</p> : null}
      {params.deleted ? <p className="success">Report context deleted.</p> : null}

      <section className="card detail-card form-stack">
        <div>
          <p className="eyebrow">Internal import</p>
          <h2>Upload paper, PDF, DOCX, or image forms</h2>
          <p className="muted">Admin-only import for reusable report context. This compatibility area is not part of the normal capture flow.</p>
        </div>
        <form action={importTemplate} className="field-grid" encType="multipart/form-data">
          <div className="field-stack field-wide">
            <label htmlFor="template_file" className="label">Report context file</label>
            <input id="template_file" name="template_file" className="input" type="file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*" required />
            <p className="muted">Supported uploads: PDF, DOCX, image, or photo of a paper form. Stored in documentation-templates.</p>
          </div>
          <div className="form-actions field-wide">
            <button className="button button-primary touch-target">Import report context</button>
          </div>
        </form>
      </section>

      <section className="card detail-card form-stack">
        <div>
          <p className="eyebrow">Internal library</p>
          <h2>System report contexts</h2>
          <p className="muted">Ready-to-duplicate CRED report contexts for admin compatibility and migration work.</p>
        </div>
        <div className="template-library-list">
          {SYSTEM_TEMPLATES.map((template, index) => (
            <article className="template-library-item" key={template.name}>
              <div>
                <h3>{template.name}</h3>
                <p className="muted">{template.description}</p>
                <p className="muted">Type: System report context · Coverage hints: {template.requiredEvidence.map((item) => item.label).join(', ') || 'None'}</p>
              </div>
              <form action={duplicateSystemTemplate.bind(null, index)}>
                <button className="button button-secondary touch-target">Duplicate</button>
              </form>
            </article>
          ))}
        </div>
      </section>

      <section className="card detail-card form-stack">
        <div>
          <h2>Organization report contexts</h2>
          <p className="muted">Admin-created and imported report contexts retained for backend compatibility. They are not required before capture.</p>
        </div>
        {organizationTemplates.length > 0 ? (
          <div className="template-library-list">
            {organizationTemplates.map((template) => {
              const saveAction = saveTemplate.bind(null, template.id)
              return (
                <article className="template-library-item template-editor" key={template.id}>
                  <form action={saveAction} className="form-stack">
                    <div className="section-header">
                      <div>
                        <p className="eyebrow">{template.template_type === 'organization' ? 'Organization report context' : template.template_type}</p>
                        <h3>{template.name}</h3>
                        <p className="muted">Created By: {template.profiles?.full_name ?? 'CRED AI'} · Last Updated: {formatDateTime(template.updated_at ?? template.created_at)}</p>
                      </div>
                      <span className="ai-status-pill">{template.status}</span>
                    </div>
                    <div className="field-grid">
                      <div className="field-stack field-wide"><label className="label" htmlFor={`name-${template.id}`}>Report context name</label><input id={`name-${template.id}`} name="name" className="input" defaultValue={template.name} /></div>
                      <div className="field-stack field-wide"><label className="label" htmlFor={`description-${template.id}`}>Description</label><textarea id={`description-${template.id}`} name="description" className="input text-area" defaultValue={template.description ?? ''} /></div>
                      <div className="field-stack"><label className="label" htmlFor={`sections-${template.id}`}>Sections</label><textarea id={`sections-${template.id}`} name="sections" className="input text-area" defaultValue={jsonList(template.sections)} /></div>
                      <div className="field-stack"><label className="label" htmlFor={`fields-${template.id}`}>Fields</label><textarea id={`fields-${template.id}`} name="fields" className="input text-area" defaultValue={jsonList(template.fields)} /></div>
                      <div className="field-stack"><label className="label" htmlFor={`required-${template.id}`}>Coverage hints</label><textarea id={`required-${template.id}`} name="required_evidence" className="input text-area" defaultValue={jsonList(template.required_evidence)} /></div>
                      <div className="field-stack"><label className="label" htmlFor={`recommended-${template.id}`}>Recommended Coverage</label><textarea id={`recommended-${template.id}`} name="recommended_evidence" className="input text-area" defaultValue={jsonList(template.recommended_evidence)} /></div>
                      <div className="field-stack field-wide"><label className="label" htmlFor={`signatures-${template.id}`}>Signature Requirements</label><textarea id={`signatures-${template.id}`} name="signature_requirements" className="input text-area" defaultValue={jsonList(template.signature_requirements)} /></div>
                    </div>
                    <div className="form-actions">
                      <button className="button button-primary touch-target">Save report context</button>
                    </div>
                  </form>
                  <div className="template-row-actions">
                    <form action={duplicateOrganizationTemplate.bind(null, template.id)}><button className="button button-secondary touch-target">Duplicate</button></form>
                    <form action={archiveTemplate.bind(null, template.id)}><button className="button button-secondary touch-target">Archive</button></form>
                    <form action={deleteTemplate.bind(null, template.id)}><button className="button button-secondary touch-target">Delete</button></form>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <p className="muted">No organization report contexts yet. Import a form or duplicate a system report context.</p>
        )}
      </section>
    </main>
  )
}
