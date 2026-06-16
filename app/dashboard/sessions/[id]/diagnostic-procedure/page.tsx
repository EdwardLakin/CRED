import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getPlanLimits, parseBillingPlan } from '@/features/billing'
import { AddCaptureForm } from '@/features/capture'
import { approveDiagnosticProcedureStructure, updateDiagnosticProcedureStepExtraction, updateDiagnosticStep, uploadAndExtractDiagnosticProcedure } from '@/features/diagnostic-procedures/actions'
import { getDiagnosticProcedureProgress, getDiagnosticStepCompleteness } from '@/features/diagnostic-procedures/progress'
import { requireSessionWorkspace } from '@/features/sessions/data'
import type { Database } from '@/lib/supabase/database.types'

type AiReportDraft = Database['public']['Tables']['ai_report_drafts']['Row']
type AiReportDraftSection = Database['public']['Tables']['ai_report_draft_sections']['Row']
type CaptureItem = Database['public']['Tables']['capture_items']['Row']

type StepMetadata = {
  section_type?: string
  step_id?: string
  step_number?: string | null
  step_key?: string
  title?: string | null
  instruction?: string
  required_measurements?: Array<{ key?: string; label?: string; unit?: string | null; expected_text?: string | null }>
  required_evidence?: Array<{ label?: string; evidence_type?: string }>
  oem_flow_text?: string | null
  oem_branches?: Array<{ label?: string; text?: string; target_step_id?: string; target_step_number?: string }>
  external_references?: Array<{ label?: string; text?: string; url?: string }>
  visible?: boolean
  extraction_review_status?: string
  source_page_start?: number | null
  source_page_end?: number | null
  extraction_confidence?: number | null
  extraction_warnings?: string[]
  technician_status?: string
  technician_readings?: Array<{ key?: string; label?: string; value?: string; unit?: string | null }>
  technician_notes?: string | null
  technician_conclusion?: string | null
  attached_capture_ids?: string[]
  technician_selected_branch?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getMetadata(section: AiReportDraftSection): StepMetadata {
  return isRecord(section.metadata) ? section.metadata as StepMetadata : {}
}

function getProcedureInfo(draft: AiReportDraft | null) {
  if (!draft || !isRecord(draft.report_structure) || !isRecord(draft.report_structure.procedure)) {
    return null
  }
  const procedure = draft.report_structure.procedure
  return {
    title: typeof procedure.title === 'string' ? procedure.title : draft.title ?? 'Diagnostic Procedure Workspace',
    manufacturer: typeof procedure.manufacturer === 'string' ? procedure.manufacturer : null,
    documentType: typeof procedure.document_type === 'string' ? procedure.document_type.replace(/_/g, ' ') : null,
    sourceFile: typeof procedure.source_file_name === 'string' ? procedure.source_file_name : null,
    status: typeof draft.report_structure.procedure_status === 'string' ? draft.report_structure.procedure_status : 'technician_review_required',
  }
}

function captureHasStep(capture: CaptureItem, stepId: string) {
  if (!isRecord(capture.extracted_data) || !isRecord(capture.extracted_data.diagnostic_step)) return false
  return capture.extracted_data.diagnostic_step.step_id === stepId
}

function formatEvidenceRole(capture: CaptureItem) {
  if (!isRecord(capture.extracted_data) || !isRecord(capture.extracted_data.diagnostic_step)) return null
  const role = capture.extracted_data.diagnostic_step.evidence_role
  return typeof role === 'string' ? role.replace(/_/g, ' ') : null
}

function formatSourcePage(metadata: StepMetadata) {
  if (!metadata.source_page_start) return null
  return metadata.source_page_end && metadata.source_page_end !== metadata.source_page_start
    ? `Source pages ${metadata.source_page_start}-${metadata.source_page_end}`
    : `Source page ${metadata.source_page_start}`
}

function getCaptureLabel(capture: CaptureItem) {
  if (capture.type === 'text_note' || capture.media_kind === 'note') return 'Text note'
  if (capture.media_kind === 'document') return 'File/document'
  if (capture.media_kind === 'video') return 'Video'
  if (capture.media_kind === 'audio') return 'Voice note'
  return 'Photo/evidence'
}

function StepCard({
  allSections,
  section,
  captures,
  sessionId,
  organizationId,
  maxCaptureFileSizeBytes,
  maxVideoFileSizeBytes,
}: {
  allSections: AiReportDraftSection[]
  section: AiReportDraftSection
  captures: CaptureItem[]
  sessionId: string
  organizationId: string
  maxCaptureFileSizeBytes: number
  maxVideoFileSizeBytes: number
}) {
  const metadata = getMetadata(section)
  const stepId = metadata.step_id ?? section.section_key
  const readings = metadata.technician_readings ?? []
  const requiredMeasurements = metadata.required_measurements ?? []
  const stepCaptures = captures.filter((capture) => captureHasStep(capture, stepId))
  const extractionUpdateAction = async (formData: FormData) => {
    'use server'
    await updateDiagnosticProcedureStepExtraction(section.id, formData)
  }
  const updateAction = async (formData: FormData) => {
    'use server'
    await updateDiagnosticStep(section.id, formData)
  }
  const title = `${metadata.step_number ? `${metadata.step_number}: ` : ''}${metadata.title ?? section.title}`
  const branches = metadata.oem_branches ?? []
  const externalReferences = metadata.external_references ?? []
  const completeness = getDiagnosticStepCompleteness(section, captures)

  return (
    <article className="card detail-card form-stack" id={`step-${stepId}`}>
      <div className="captures-section-header">
        <div>
          <p className="eyebrow">OEM procedure step</p>
          <h2>{title}</h2>
          <p className="muted">Documentation support only. Follow OEM procedure. Technician owns all conclusions.</p>
          {formatSourcePage(metadata) ? <p className="muted">{formatSourcePage(metadata)}{typeof metadata.extraction_confidence === 'number' ? ` · Extraction confidence ${Math.round(metadata.extraction_confidence * 100)}%` : ''}</p> : null}
        </div>
        <div className="page-actions">
          {completeness.badges.map((badge) => <span key={badge} className={badge === 'Complete' ? 'status-pill success' : badge === 'Blocked' || badge === 'Review warning' ? 'status-pill attention' : 'status-pill neutral'}>{badge}</span>)}
          <span className="status-pill neutral">{metadata.technician_status?.replace(/_/g, ' ') ?? 'not tested'}</span>
        </div>
      </div>

      <form action={extractionUpdateAction} className="form-stack notice warning">
        <strong>Technician extraction review required</strong>
        {metadata.extraction_warnings && metadata.extraction_warnings.length > 0 ? <ul>{metadata.extraction_warnings.map((warning, index) => <li key={`${stepId}-warning-${index}`}>{warning}</li>)}</ul> : null}
        <p>Correct OEM text only. Do not add diagnosis, repair recommendations, or inferred next steps.</p>
        <label className="field-stack"><span className="label">Visible in procedure/report</span><input type="checkbox" name="visible" defaultChecked={metadata.visible !== false} /></label>
        <div className="inspection-metric-grid">
          <label className="field-stack"><span className="label">Step number</span><input className="input" name="step_number" defaultValue={metadata.step_number ?? ''} /></label>
          <label className="field-stack"><span className="label">Sort order</span><input className="input" name="sort_order" type="number" min="1" defaultValue={section.sort_order ?? 1} /></label>
        </div>
        <label className="field-stack"><span className="label">Step title</span><input className="input" name="title" defaultValue={metadata.title ?? section.title} /></label>
        <label className="field-stack"><span className="label">OEM instruction</span><textarea className="input note-textarea" name="instruction" rows={4} defaultValue={metadata.instruction ?? section.body ?? ''} /></label>
        <label className="field-stack"><span className="label">Measurement labels/ranges (JSON array)</span><textarea className="input note-textarea" name="required_measurements" rows={3} defaultValue={JSON.stringify(requiredMeasurements, null, 2)} /></label>
        <label className="field-stack"><span className="label">OEM flow text</span><textarea className="input note-textarea" name="oem_flow_text" rows={3} defaultValue={metadata.oem_flow_text ?? ''} /></label>
        <label className="field-stack"><span className="label">OEM branch text (JSON array with optional target_step_id/target_step_number)</span><textarea className="input note-textarea" name="oem_branches" rows={3} defaultValue={JSON.stringify(branches, null, 2)} /></label>
        <label className="field-stack"><span className="label">External references (JSON array)</span><textarea className="input note-textarea" name="external_references" rows={3} defaultValue={JSON.stringify(externalReferences, null, 2)} /></label>
        <button className="button button-secondary touch-target">Save extraction corrections</button>
      </form>

      <section className="notice info">
        <strong>OEM instruction text</strong>
        <p>{metadata.instruction ?? section.body}</p>
        {metadata.oem_flow_text ? (
          <p><strong>OEM flow text:</strong> {metadata.oem_flow_text}</p>
        ) : null}
      </section>

      {requiredMeasurements.length > 0 ? (
        <div className="field-stack">
          <h3>Required technician-entered measurements</h3>
          <ul className="muted">
            {requiredMeasurements.map((measurement, index) => (
              <li key={`${measurement.key ?? index}`}>{measurement.label}{measurement.unit ? ` (${measurement.unit})` : ''}{measurement.expected_text ? ` — OEM reference: ${measurement.expected_text}` : ''}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {branches.length > 0 ? (
        <div className="field-stack"><h3>Technician-selected OEM branch navigation</h3>{branches.map((branch, index) => {
          const target = allSections.find((candidate) => { const candidateMetadata = getMetadata(candidate); return (branch.target_step_id && candidateMetadata.step_id === branch.target_step_id) || (branch.target_step_number && candidateMetadata.step_number === branch.target_step_number) })
          return <details key={`${branch.label ?? index}`}><summary>{branch.label ?? branch.text ?? `Branch ${index + 1}`}</summary><p className="muted">{branch.text ?? branch.label}</p>{target ? <Link className="secondary-link touch-target" href={`/dashboard/sessions/${sessionId}/diagnostic-procedure?step=${target.id}#step-${getMetadata(target).step_id ?? target.section_key}`}>Open referenced OEM step</Link> : null}</details>
        })}</div>
      ) : null}

      {externalReferences.length > 0 ? <div className="field-stack"><h3>External references</h3><ul className="muted">{externalReferences.map((ref, index) => <li key={`${ref.label ?? index}`}>{ref.url ? <a href={ref.url}>{ref.label ?? ref.url}</a> : (ref.label ?? ref.text ?? 'Reference')}{ref.text ? ` — ${ref.text}` : ''}</li>)}</ul></div> : null}

      {metadata.required_evidence && metadata.required_evidence.length > 0 ? (
        <div className="field-stack">
          <h3>Requested documentation prompts</h3>
          <ul className="muted">
            {metadata.required_evidence.map((evidence, index) => <li key={`${evidence.label ?? index}`}>{evidence.label ?? 'Evidence'}{evidence.evidence_type ? ` (${evidence.evidence_type.replace(/_/g, ' ')})` : ''}</li>)}
          </ul>
        </div>
      ) : null}

      <form action={updateAction} className="form-stack">
        <label className="field-stack">
          <span className="label">Technician status</span>
          <select name="technician_status" className="input" defaultValue={metadata.technician_status ?? 'not_tested'}>
            <option value="not_tested">Not tested</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
            <option value="blocked">Blocked</option>
            <option value="not_applicable">Not applicable</option>
          </select>
        </label>

        <input type="hidden" name="reading_count" value={Math.max(requiredMeasurements.length, readings.length, 1)} />
        <div className="field-stack">
          <h3>Technician readings</h3>
          {Array.from({ length: Math.max(requiredMeasurements.length, readings.length, 1) }).map((_, index) => {
            const measurement = requiredMeasurements[index]
            const reading = readings[index]
            const label = reading?.label ?? measurement?.label ?? `Reading ${index + 1}`
            return (
              <div key={`${label}-${index}`} className="inspection-metric-grid">
                <input type="hidden" name={`reading_key_${index}`} value={reading?.key ?? measurement?.key ?? `reading_${index + 1}`} />
                <input type="hidden" name={`reading_label_${index}`} value={label} />
                <input type="hidden" name={`reading_unit_${index}`} value={reading?.unit ?? measurement?.unit ?? ''} />
                <label className="field-stack">
                  <span className="label">{label}{measurement?.unit ? ` (${measurement.unit})` : ''}</span>
                  <input className="input" name={`reading_value_${index}`} defaultValue={reading?.value ?? ''} placeholder="Technician-entered value" />
                </label>
              </div>
            )
          })}
        </div>


        {branches.length > 0 ? (
          <label className="field-stack">
            <span className="label">Technician-selected OEM branch documented</span>
            <select name="technician_selected_branch" className="input" defaultValue={metadata.technician_selected_branch ?? ''}>
              <option value="">Select branch documented</option>
              {branches.map((branch, index) => <option key={`${branch.label ?? index}-select`} value={branch.label ?? branch.text ?? `Branch ${index + 1}`}>{branch.label ?? branch.text ?? `Branch ${index + 1}`}</option>)}
            </select>
          </label>
        ) : null}

        <label className="field-stack">
          <span className="label">Technician notes</span>
          <textarea className="input note-textarea" name="technician_notes" rows={4} defaultValue={metadata.technician_notes ?? ''} placeholder="Document observations, readings context, or why this step is blocked. Do not rely on AI for diagnosis." />
        </label>

        <label className="field-stack">
          <span className="label">Technician conclusion for this step</span>
          <textarea className="input note-textarea" name="technician_conclusion" rows={3} defaultValue={metadata.technician_conclusion ?? ''} placeholder="Optional technician-owned conclusion. AI does not determine root cause or repair." />
        </label>

        <button className="button button-primary touch-target">Save step documentation</button>
      </form>

      <section className="field-stack">
        <h3>Attached step evidence</h3>
        {stepCaptures.length > 0 ? (
          <ul className="muted">
            {stepCaptures.map((capture) => <li key={capture.id}>{formatEvidenceRole(capture) ? `${formatEvidenceRole(capture)} · ` : ''}{getCaptureLabel(capture)} · {capture.technician_note || capture.ai_summary || 'Saved evidence'}</li>)}
          </ul>
        ) : <p className="muted">No evidence attached to this step yet.</p>}
        <AddCaptureForm
          sessionId={sessionId}
          organizationId={organizationId}
          workflow="diagnostic_procedure"
          guidedStep={stepId}
          guidedLabel={title}
          returnPath={`/dashboard/sessions/${sessionId}/diagnostic-procedure#step-${stepId}`}
          maxCaptureFileSizeBytes={maxCaptureFileSizeBytes}
          maxVideoFileSizeBytes={maxVideoFileSizeBytes}
          maxFileSizeLabel="your plan limit"
        />
      </section>
    </article>
  )
}

export default async function DiagnosticProcedurePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; extracted?: string; captureSaved?: string; step?: string }>
}) {
  const { id } = await params
  const { error, extracted, captureSaved, step } = await searchParams
  const { supabase, profile } = await requireSessionWorkspace()
  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('*')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) notFound()

  const { data: drafts } = await supabase
    .from('ai_report_drafts')
    .select('*')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .not('status', 'eq', 'superseded')
    .order('generated_at', { ascending: false })
    .order('created_at', { ascending: false })

  const diagnosticDraft = (drafts ?? []).find((draft) => isRecord(draft.report_structure) && draft.report_structure.mode === 'diagnostic_procedure') ?? null
  const { data: sections } = diagnosticDraft
    ? await supabase
        .from('ai_report_draft_sections')
        .select('*')
        .eq('ai_report_draft_id', diagnosticDraft.id)
        .eq('documentation_session_id', session.id)
        .eq('organization_id', profile.organization_id)
        .order('sort_order', { ascending: true })
    : { data: [] }

  const { data: captures } = await supabase
    .from('capture_items')
    .select('*')
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .order('captured_at', { ascending: false })

  const planLimits = getPlanLimits(parseBillingPlan(profile.organization.plan))
  const uploadAction = uploadAndExtractDiagnosticProcedure.bind(null, session.id)
  const procedureInfo = getProcedureInfo(diagnosticDraft)
  const allStepSections = (sections ?? []).filter((section) => getMetadata(section).section_type === 'diagnostic_procedure_step')
  const procedureProgress = getDiagnosticProcedureProgress(allStepSections, captures ?? [])
  const stepSections = allStepSections.filter((section) => getMetadata(section).visible !== false)
  const singleStepSection = stepSections.find((section) => section.id === step || getMetadata(section).step_id === step)
  const visibleStepSections = singleStepSection ? [singleStepSection] : stepSections
  const approveAction = async () => {
    'use server'
    if (diagnosticDraft) await approveDiagnosticProcedureStructure(diagnosticDraft.id)
  }

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <Link href={`/dashboard/sessions/${session.id}`} className="secondary-link touch-target">← Session</Link>
          <h1>Diagnostic Procedure Workspace</h1>
          <p className="muted">{session.title}</p>
          <p className="notice info"><strong>Documentation support only.</strong> Follow OEM procedure. Technician owns all findings, conclusions, and recommendations. AI does not diagnose or determine repair.</p>
        </div>
        <Link href={`/dashboard/sessions/${session.id}/report`} className="button button-secondary touch-target">Review documentation report</Link>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {extracted ? <p className="success">Diagnostic procedure structure extracted for technician review.</p> : null}
      {captureSaved ? <p className="success">Step evidence saved.</p> : null}

      {!diagnosticDraft ? (
        <section className="card detail-card form-stack">
          <div>
            <p className="eyebrow">Upload OEM procedure</p>
            <h2>Create procedure workspace</h2>
            <p className="muted">Upload a Ford pinpoint test, OEM service procedure, TSB, wiring test, warranty diagnostic checklist, or scan-tool test procedure. AI extracts structure only; it does not diagnose.</p>
          </div>
          <form action={uploadAction} className="form-stack">
            <label className="field-stack">
              <span className="label">Diagnostic procedure PDF or image</span>
              <input className="input file-input" type="file" name="procedure_file" accept="application/pdf,image/*" required />
            </label>
            <button className="button button-primary touch-target">Upload and extract procedure</button>
          </form>
        </section>
      ) : (
        <>
          <section className="card detail-card form-stack">
            <div>
              <p className="eyebrow">Extracted procedure</p>
              <h2>{procedureInfo?.title ?? diagnosticDraft.title ?? 'Diagnostic Procedure'}</h2>
              <p className="muted">{[procedureInfo?.manufacturer, procedureInfo?.documentType, procedureInfo?.sourceFile].filter(Boolean).join(' · ')}</p>
              <p className="muted">Status: {(procedureInfo?.status ?? 'technician_review_required').replace(/_/g, ' ')}</p><form action={approveAction}><button className="button button-primary touch-target">Approve corrected structure for use</button></form><p className="notice info"><strong>Guardrail:</strong> OEM flow text is shown for reference only. The technician decides what was tested and documents the result.</p>
            </div>
          </section>

          <section className="card detail-card form-stack">
            <div className="report-section-heading generated-report-heading">
              <div><p className="eyebrow">Documentation progress</p><h2>{procedureProgress.percentComplete}% complete</h2><p className="muted">Documentation ready only when required technician-entered readings, branch selections, and evidence roles are complete.</p></div>
              <span className={procedureProgress.reportReady ? 'status-pill success' : 'status-pill attention'}>{procedureProgress.reportReady ? 'Documentation ready' : 'Documentation incomplete'}</span>
            </div>
            <div className="inspection-metric-grid">
              <div><span>Visible steps</span><strong>{procedureProgress.totalVisibleSteps}</strong></div>
              <div><span>Incomplete steps</span><strong>{procedureProgress.incompleteSteps}</strong></div>
              <div><span>Blocked</span><strong>{procedureProgress.blockedSteps}</strong></div>
              <div><span>Warnings</span><strong>{procedureProgress.warningCount}</strong></div>
              <div><span>Missing required documentation</span><strong>{procedureProgress.missingRequiredDocumentationCount}</strong></div>
            </div>
            {procedureProgress.nextIncompleteStepId ? <Link className="button button-secondary touch-target" href={`/dashboard/sessions/${session.id}/diagnostic-procedure#step-${procedureProgress.nextIncompleteStepId}`}>Open next incomplete documentation item.</Link> : null}
          </section>
          <div className="page-actions"><Link className="button button-secondary touch-target" href={`/dashboard/sessions/${session.id}/diagnostic-procedure`}>Full procedure view</Link>{stepSections.map((section) => <Link key={section.id} className="button button-secondary touch-target" href={`/dashboard/sessions/${session.id}/diagnostic-procedure?step=${section.id}#step-${getMetadata(section).step_id ?? section.section_key}`}>{getMetadata(section).step_number ?? 'Step'}</Link>)}</div>
          {visibleStepSections.map((section) => (
            <StepCard
              key={section.id}
              allSections={stepSections}
              section={section}
              captures={captures ?? []}
              sessionId={session.id}
              organizationId={session.organization_id}
              maxCaptureFileSizeBytes={planLimits.maxCaptureFileSizeBytes}
              maxVideoFileSizeBytes={planLimits.maxVideoFileSizeBytes}
            />
          ))}
        </>
      )}
    </main>
  )
}
