import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getPlanLimits, parseBillingPlan } from '@/features/billing'
import { AddCaptureForm } from '@/features/capture'
import { updateDiagnosticStep, uploadAndExtractDiagnosticProcedure } from '@/features/diagnostic-procedures/actions'
import { requireSessionWorkspace } from '@/features/sessions/data'
import type { Database } from '@/lib/supabase/database.types'

type AiReportDraft = Database['public']['Tables']['ai_report_drafts']['Row']
type AiReportDraftSection = Database['public']['Tables']['ai_report_draft_sections']['Row']
type CaptureItem = Database['public']['Tables']['capture_items']['Row']

type DiagnosticBranchMetadata = {
  branch_id?: string
  condition_label?: string
  condition_type?: string
  condition_text?: string
  target_step_id?: string | null
  target_step_number?: string | null
  reference_text?: string | null
  is_terminal?: boolean
  terminal_outcome?: string | null
}

type StepMetadata = {
  section_type?: string
  step_id?: string
  step_number?: string | null
  step_key?: string
  title?: string | null
  instruction?: string
  notes_preconditions?: string[]
  technician_actions?: string[]
  required_measurements?: Array<{ key?: string; label?: string; measurement_point?: string | null; unit?: string | null; expected_text?: string | null; expected_min?: string | null; expected_max?: string | null }>
  required_evidence?: Array<{ label?: string; evidence_type?: string }>
  decision_question?: string | null
  branches?: DiagnosticBranchMetadata[]
  dtc_branches?: DiagnosticBranchMetadata[]
  external_references?: Array<{ label?: string; reference_text?: string }>
  terminal_outcomes?: Array<{ label?: string; outcome_text?: string }>
  selected_branch_id?: string | null
  selected_branch_label?: string | null
  oem_flow_text?: string | null
  extraction_warnings?: string[]
  technician_status?: string
  technician_readings?: Array<{ key?: string; label?: string; value?: string; unit?: string | null }>
  technician_notes?: string | null
  technician_conclusion?: string | null
  attached_capture_ids?: string[]
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
  }
}


function getBranchLabel(branch: DiagnosticBranchMetadata) {
  const target = branch.target_step_number || branch.target_step_id
  const destination = target
    ? `Go to ${target}`
    : branch.reference_text
      ? branch.reference_text
      : branch.is_terminal && branch.terminal_outcome
        ? branch.terminal_outcome
        : 'OEM reference'
  return `${branch.condition_label || branch.condition_text || 'Branch'} → ${destination}`
}

function getAllBranches(metadata: StepMetadata) {
  return [...(metadata.branches ?? []), ...(metadata.dtc_branches ?? [])]
}

function captureHasStep(capture: CaptureItem, stepId: string) {
  if (!isRecord(capture.extracted_data) || !isRecord(capture.extracted_data.diagnostic_step)) return false
  return capture.extracted_data.diagnostic_step.step_id === stepId
}

function getCaptureLabel(capture: CaptureItem) {
  if (capture.type === 'text_note' || capture.media_kind === 'note') return 'Text note'
  if (capture.media_kind === 'document') return 'File/document'
  if (capture.media_kind === 'video') return 'Video'
  if (capture.media_kind === 'audio') return 'Voice note'
  return 'Photo/evidence'
}

function StepCard({
  section,
  captures,
  sessionId,
  organizationId,
  maxCaptureFileSizeBytes,
  maxVideoFileSizeBytes,
}: {
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
  const branches = getAllBranches(metadata)
  const stepCaptures = captures.filter((capture) => captureHasStep(capture, stepId))
  const updateAction = async (formData: FormData) => {
    'use server'
    await updateDiagnosticStep(section.id, formData)
  }
  const title = `${metadata.step_number ? `${metadata.step_number}: ` : ''}${metadata.title ?? section.title}`

  return (
    <article className="card detail-card form-stack" id={`step-${stepId}`}>
      <div className="captures-section-header">
        <div>
          <p className="eyebrow">OEM procedure step</p>
          <h2>{title}</h2>
          <p className="muted">Documentation support only. Follow OEM procedure. Technician owns all conclusions.</p>
        </div>
        <span className="status-pill neutral">{metadata.technician_status?.replace(/_/g, ' ') ?? 'not tested'}</span>
      </div>

      <section className="notice info">
        <strong>OEM instruction text</strong>
        <p>{metadata.instruction ?? section.body}</p>
        {metadata.oem_flow_text ? (
          <p><strong>OEM flow text:</strong> {metadata.oem_flow_text}</p>
        ) : null}
      </section>

      {metadata.notes_preconditions && metadata.notes_preconditions.length > 0 ? (
        <div className="field-stack">
          <h3>Notes / preconditions</h3>
          <ul className="muted">{metadata.notes_preconditions.map((note, index) => <li key={`${stepId}-note-${index}`}>{note}</li>)}</ul>
        </div>
      ) : null}

      {metadata.technician_actions && metadata.technician_actions.length > 0 ? (
        <div className="field-stack">
          <h3>Technician actions from OEM procedure</h3>
          <ul className="muted">{metadata.technician_actions.map((action, index) => <li key={`${stepId}-action-${index}`}>{action}</li>)}</ul>
        </div>
      ) : null}

      {requiredMeasurements.length > 0 ? (
        <div className="field-stack">
          <h3>Required technician-entered measurements</h3>
          <ul className="muted">
            {requiredMeasurements.map((measurement, index) => (
              <li key={`${measurement.key ?? index}`}>{measurement.label}{measurement.measurement_point ? ` at ${measurement.measurement_point}` : ''}{measurement.unit ? ` (${measurement.unit})` : ''}{measurement.expected_text ? ` — Expected: ${measurement.expected_text}` : ''}{measurement.expected_min || measurement.expected_max ? ` — Range: ${measurement.expected_min ?? 'min not shown'} to ${measurement.expected_max ?? 'max not shown'}` : ''}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {metadata.required_evidence && metadata.required_evidence.length > 0 ? (
        <div className="field-stack">
          <h3>Requested documentation prompts</h3>
          <ul className="muted">
            {metadata.required_evidence.map((evidence, index) => <li key={`${evidence.label ?? index}`}>{evidence.label ?? 'Evidence'}{evidence.evidence_type ? ` (${evidence.evidence_type.replace(/_/g, ' ')})` : ''}</li>)}
          </ul>
        </div>
      ) : null}

      {(metadata.decision_question || branches.length > 0 || (metadata.external_references && metadata.external_references.length > 0) || (metadata.terminal_outcomes && metadata.terminal_outcomes.length > 0)) ? (
        <section className="notice info">
          <strong>OEM branch references</strong>
          <p>Technician must select the result/branch. AI does not choose the next step.</p>
          {metadata.decision_question ? <p><strong>Decision question:</strong> {metadata.decision_question}</p> : null}
          {branches.length > 0 ? (
            <ul>
              {branches.map((branch, index) => (
                <li key={branch.branch_id ?? `${stepId}-branch-${index}`}>
                  OEM branch: {getBranchLabel(branch)}{branch.condition_text ? ` — ${branch.condition_text}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
          {metadata.external_references && metadata.external_references.length > 0 ? (
            <ul>
              {metadata.external_references.map((reference, index) => <li key={`${stepId}-reference-${index}`}>OEM procedure reference: {reference.reference_text ?? reference.label}</li>)}
            </ul>
          ) : null}
          {metadata.terminal_outcomes && metadata.terminal_outcomes.length > 0 ? (
            <ul>
              {metadata.terminal_outcomes.map((outcome, index) => <li key={`${stepId}-outcome-${index}`}>Terminal outcome: {outcome.outcome_text ?? outcome.label}</li>)}
            </ul>
          ) : null}
        </section>
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

        {branches.length > 0 ? (
          <label className="field-stack">
            <span className="label">Technician-selected OEM branch/result</span>
            <select name="selected_branch_id" className="input" defaultValue={metadata.selected_branch_id ?? ''}>
              <option value="">No branch selected</option>
              {branches.map((branch, index) => {
                const label = getBranchLabel(branch)
                return <option key={branch.branch_id ?? `${stepId}-branch-option-${index}`} value={branch.branch_id ?? label}>{label}</option>
              })}
            </select>
            <p className="muted">Select only after performing the OEM step. This records the technician-selected branch; AI does not choose it.</p>
          </label>
        ) : null}

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
            {stepCaptures.map((capture) => <li key={capture.id}>{getCaptureLabel(capture)} · {capture.technician_note || capture.ai_summary || 'Saved evidence'}</li>)}
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
  searchParams: Promise<{ error?: string; extracted?: string; captureSaved?: string }>
}) {
  const { id } = await params
  const { error, extracted, captureSaved } = await searchParams
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
  const stepSections = (sections ?? []).filter((section) => getMetadata(section).section_type === 'diagnostic_procedure_step')

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
              <p className="notice info"><strong>Guardrail:</strong> OEM flow text is shown for reference only. The technician decides what was tested and documents the result.</p>
            </div>
          </section>
          {stepSections.map((section) => (
            <StepCard
              key={section.id}
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
