import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  AddCaptureForm,
  CaptureList,
  ClassifyPendingCapturesButton,
  ExtractCaptureDetailsButton,
  type CaptureItem,
} from '@/features/capture'
import { ThemeToggle } from '@/components/theme'
import { formatDateTime } from '@/features/sessions'
import { requireSessionWorkspace } from '@/features/sessions/data'
import type { Json } from '@/lib/supabase/database.types'

const WORKFLOW_LABELS: Record<string, string> = {
  cvip: 'CVIP / Commercial Inspection',
  general_inspection: 'General Inspection',
  default: 'Field Evidence',
}

type GuidedEvidenceStep = {
  key: string
  label: string
  instruction: string
  examples: string[]
  acceptedTypes: string[]
}

type StepStatus = 'Missing' | 'Captured' | 'Needs review' | 'Extracted'

const CVIP_STEPS: GuidedEvidenceStep[] = [
  {
    key: 'registration',
    label: 'Registration',
    instruction: 'Capture the registration document or permit details for the vehicle record.',
    examples: ['registration card', 'permit document', 'owner/vehicle registration'],
    acceptedTypes: ['registration'],
  },
  {
    key: 'vin_plate',
    label: 'VIN plate',
    instruction: 'Get a clear close-up of the VIN label, plate, or stamped VIN.',
    examples: ['door jamb VIN label', 'frame VIN stamp', 'dash VIN plate'],
    acceptedTypes: ['vin_plate'],
  },
  {
    key: 'license_plate',
    label: 'Licence plate',
    instruction: 'Capture the exterior plate so the unit can be matched to the inspection file.',
    examples: ['front plate', 'rear plate', 'plate sticker'],
    acceptedTypes: ['license_plate'],
  },
  {
    key: 'unit_number',
    label: 'Unit number',
    instruction: 'Capture fleet, asset, or internal unit identifiers.',
    examples: ['cab decal', 'trailer unit number', 'asset label'],
    acceptedTypes: ['unit_number'],
  },
  {
    key: 'odometer_hour_meter',
    label: 'Odometer / hour meter',
    instruction: 'Capture mileage or equipment hours with the digits readable.',
    examples: ['dashboard odometer', 'hour meter display', 'cluster reading'],
    acceptedTypes: ['odometer', 'hour_meter'],
  },
  {
    key: 'inspection_sheet',
    label: 'Inspection sheet / CVIP form',
    instruction: 'Capture inspection forms, CVIP sheets, or shop work orders connected to the inspection.',
    examples: ['CVIP form', 'inspection checklist', 'work order'],
    acceptedTypes: ['inspection_sheet', 'work_order'],
  },
  {
    key: 'info_plate',
    label: 'Info/data/tire/compliance label',
    instruction: 'Capture manufacturer, compliance, tire/loading, rating, or data plates.',
    examples: ['manufacturer plate', 'tire/loading label', 'GVWR/GAWR data tag'],
    acceptedTypes: ['info_plate'],
  },
  {
    key: 'defect_repair_photos',
    label: 'Defect or repair photos',
    instruction: 'Capture visible defects, repair areas, failed parts, leaks, wear, or corrective work.',
    examples: ['damaged component', 'leak', 'repair before/after'],
    acceptedTypes: ['damage_or_defect'],
  },
  {
    key: 'supporting_evidence',
    label: 'General supporting evidence',
    instruction: 'Add context photos that help explain the condition or inspection location.',
    examples: ['full vehicle view', 'work area', 'supporting field photo'],
    acceptedTypes: ['general_field_photo', 'unknown'],
  },
]

const GENERAL_INSPECTION_STEPS: GuidedEvidenceStep[] = [
  {
    key: 'asset_id_vin',
    label: 'VIN plate or asset ID',
    instruction: 'Capture the VIN, serial, asset, or unit identifier that ties evidence to the asset.',
    examples: ['VIN plate', 'asset tag', 'unit label'],
    acceptedTypes: ['vin_plate', 'unit_number'],
  },
  {
    key: 'info_plate',
    label: 'Info/data plate',
    instruction: 'Capture manufacturer, model, rating, serial, or compliance plates.',
    examples: ['data plate', 'serial plate', 'compliance tag'],
    acceptedTypes: ['info_plate'],
  },
  {
    key: 'odometer_hour_meter',
    label: 'Odometer / hour meter',
    instruction: 'Capture mileage or hours when relevant to the inspection.',
    examples: ['odometer', 'hour meter', 'equipment hours'],
    acceptedTypes: ['odometer', 'hour_meter'],
  },
  {
    key: 'work_order_inspection_sheet',
    label: 'Work order / inspection sheet',
    instruction: 'Capture the job paperwork or checklist driving the field inspection.',
    examples: ['work order', 'inspection sheet', 'checklist'],
    acceptedTypes: ['work_order', 'inspection_sheet'],
  },
  {
    key: 'concern_area',
    label: 'Concern area',
    instruction: 'Capture the area the customer, inspector, or technician is concerned about.',
    examples: ['reported concern', 'area overview', 'component context'],
    acceptedTypes: ['general_field_photo', 'damage_or_defect'],
  },
  {
    key: 'defect_photos',
    label: 'Defect photos',
    instruction: 'Capture failed, damaged, worn, unsafe, or leaking conditions clearly.',
    examples: ['damage', 'wear', 'leak', 'broken component'],
    acceptedTypes: ['damage_or_defect'],
  },
  {
    key: 'supporting_evidence',
    label: 'Supporting evidence',
    instruction: 'Add any other helpful photos or documents for review.',
    examples: ['field context', 'supporting document', 'overview photo'],
    acceptedTypes: ['general_field_photo', 'other_document', 'unknown'],
  },
]

const DEFAULT_STEPS: GuidedEvidenceStep[] = [
  {
    key: 'asset_id_vin_unit_label',
    label: 'Asset ID / VIN / unit label',
    instruction: 'Capture the clearest identifier available for the asset or record.',
    examples: ['asset tag', 'VIN label', 'unit number'],
    acceptedTypes: ['vin_plate', 'unit_number'],
  },
  {
    key: 'documents',
    label: 'Documents',
    instruction: 'Capture documents that explain the job, record, or inspection.',
    examples: ['registration', 'work order', 'inspection sheet'],
    acceptedTypes: ['registration', 'work_order', 'inspection_sheet', 'other_document'],
  },
  {
    key: 'info_data_plates',
    label: 'Info/data plates',
    instruction: 'Capture tags or plates with manufacturer, serial, model, or rating information.',
    examples: ['data plate', 'serial tag', 'compliance label'],
    acceptedTypes: ['info_plate'],
  },
  {
    key: 'field_condition_photos',
    label: 'Field condition photos',
    instruction: 'Capture current condition, defects, or areas needing attention.',
    examples: ['condition overview', 'damage', 'concern area'],
    acceptedTypes: ['damage_or_defect', 'general_field_photo'],
  },
  {
    key: 'supporting_evidence',
    label: 'Supporting evidence',
    instruction: 'Add anything else useful for the evidence record.',
    examples: ['context photo', 'additional label', 'unknown supporting image'],
    acceptedTypes: ['general_field_photo', 'unknown'],
  },
]

function getWorkflow(sessionType: string) {
  const normalized = sessionType.toLowerCase()

  if (normalized.includes('cvip') || (normalized.includes('commercial') && normalized.includes('inspection'))) {
    return 'cvip'
  }

  if (normalized.includes('inspection')) {
    return 'general_inspection'
  }

  return 'default'
}

function getSteps(workflow: string) {
  if (workflow === 'cvip') {
    return CVIP_STEPS
  }

  if (workflow === 'general_inspection') {
    return GENERAL_INSPECTION_STEPS
  }

  return DEFAULT_STEPS
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getGuidance(extractedData: Json | null) {
  if (!isRecord(extractedData) || !isRecord(extractedData.guidance)) {
    return null
  }

  const step = typeof extractedData.guidance.step === 'string' ? extractedData.guidance.step : null
  const label = typeof extractedData.guidance.label === 'string' ? extractedData.guidance.label : null
  const workflow = typeof extractedData.guidance.workflow === 'string' ? extractedData.guidance.workflow : null

  return step && label && workflow ? { step, label, workflow } : null
}

function getDetectedType(extractedData: Json | null) {
  if (!isRecord(extractedData) || !isRecord(extractedData.classification)) {
    return null
  }

  return typeof extractedData.classification.detected_type === 'string' ? extractedData.classification.detected_type : null
}

function getExtractionStatus(extractedData: Json | null) {
  if (!isRecord(extractedData) || !isRecord(extractedData.extraction)) {
    return null
  }

  return typeof extractedData.extraction.status === 'string' ? extractedData.extraction.status : null
}

function captureMatchesStep(capture: CaptureItem, step: GuidedEvidenceStep) {
  const guidance = getGuidance(capture.extracted_data)
  const detectedType = getDetectedType(capture.extracted_data)

  return guidance?.step === step.key || (detectedType ? step.acceptedTypes.includes(detectedType) : false)
}

function getStepCaptures(captures: CaptureItem[], step: GuidedEvidenceStep) {
  return captures.filter((capture) => captureMatchesStep(capture, step))
}

function getStepStatus(stepCaptures: CaptureItem[]): StepStatus {
  if (stepCaptures.length === 0) {
    return 'Missing'
  }

  if (stepCaptures.some((capture) => capture.ai_status === 'needs_review')) {
    return 'Needs review'
  }

  if (stepCaptures.some((capture) => getExtractionStatus(capture.extracted_data) === 'extracted')) {
    return 'Extracted'
  }

  return 'Captured'
}



function StepStatusBadge({ status }: { status: StepStatus }) {
  const className = `guided-status guided-status-${status.toLowerCase().replace(/\s+/g, '-')}`
  return <span className={className}>{status}</span>
}

function GuidedStepCard({
  step,
  status,
  count,
}: {
  step: GuidedEvidenceStep
  status: StepStatus
  count: number
}) {
  const isComplete = status === 'Captured' || status === 'Extracted'
  const className = `guided-step-card guided-step-card-${status.toLowerCase().replace(/\s+/g, '-')} ${
    isComplete ? 'guided-step-card-compact' : ''
  }`

  return (
    <article className={className} id={`step-${step.key}`}>
      <div className="guided-step-header">
        <div>
          <h3>{step.label}</h3>
          <p>{step.instruction}</p>
        </div>
        <StepStatusBadge status={status} />
      </div>
      <div className="guided-step-meta">
        <span>{count} related capture{count === 1 ? '' : 's'}</span>
        <span>{status.toLowerCase()}</span>
      </div>
      <p className="guided-step-examples">Examples: {step.examples.join(', ')}</p>
      <Link href="#main-capture-card" className="secondary-link guided-step-capture-link touch-target">
        Capture evidence
      </Link>
    </article>
  )
}

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
  const steps = getSteps(workflow)
  const stepSummaries = steps.map((step) => {
    const stepCaptures = getStepCaptures(captureItems, step)
    return {
      step,
      count: stepCaptures.length,
      status: getStepStatus(stepCaptures),
    }
  })
  const capturedStepCount = stepSummaries.filter((summary) => summary.status !== 'Missing').length
  const needsReviewCount = captureItems.filter((capture) => capture.ai_status === 'needs_review').length
  const progressPercent = steps.length === 0 ? 0 : Math.round((capturedStepCount / steps.length) * 100)

  return (
    <main className="page-shell dashboard-shell guided-capture-shell">
      <div className="section-header page-header guided-page-header">
        <div>
          <Link href={`/dashboard/sessions/${session.id}`} className="secondary-link touch-target">
            ← Back to session
          </Link>
          <p className="eyebrow guided-eyebrow">Field capture session</p>
          <h1>{session.title}</h1>
          <p className="muted">
            {session.session_type} · {WORKFLOW_LABELS[workflow]} · Updated {formatDateTime(session.updated_at ?? session.created_at)}
          </p>
        </div>
        <div className="page-actions">
          <ThemeToggle />
          <Link href={`/dashboard/sessions/${session.id}`} className="button button-secondary touch-target">
            Back to Session Details
          </Link>
        </div>
      </div>

      {captureSaved ? <p className="success">Capture added to the guided session.</p> : null}

      <section className="card detail-card guided-progress-card">
        <div>
          <h2>{capturedStepCount} of {steps.length} evidence groups captured</h2>
          <p className="muted">
            These groups are guidance only. Skip anything that does not apply, or add extra supporting evidence when needed.
          </p>
        </div>
        <div className="guided-progress-track" aria-label={`${progressPercent}% complete`}>
          <div className="guided-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="guided-progress-meta">
          <span>{progressPercent}% complete</span>
          <span>{needsReviewCount} capture{needsReviewCount === 1 ? '' : 's'} need review</span>
        </div>
      </section>

      <section className="card detail-card guided-main-capture-card" id="main-capture-card">
        <div>
          <p className="eyebrow guided-eyebrow">Main field action</p>
          <h2>Capture Evidence</h2>
          <p className="muted">Use this for all field evidence. The checklist below updates as AI classifies and extracts details.</p>
        </div>
        <AddCaptureForm
          sessionId={session.id}
          sessionType={session.session_type}
          workflow={workflow}
          returnPath={`/dashboard/sessions/${session.id}/capture#main-capture-card`}
          helperText="Capture photos or videos, add voice/typed context, then review the card below."
          commonCaptureText="Common captures: VIN plate, info/data plate, odometer/hour meter, work order, concern area, defects, supporting photos or videos."
          showSuggestedCaptureText={false}
        />
        <div className="inline-evidence-feed">
          <div>
            <h2>Evidence feed</h2>
            <p className="muted">Preview, edit notes, remove, and choose report inclusion before finalizing.</p>
          </div>
          <CaptureList captures={captureItems} signedUrls={signedUrls} />
        </div>
      </section>

      <section className="card detail-card guided-actions-card">
        <div>
          <h2>AI actions</h2>
          <p className="muted">Classify captures, extract details, then review evidence on the session dashboard.</p>
        </div>
        <div className="guided-action-buttons">
          <ClassifyPendingCapturesButton sessionId={session.id} />
          <ExtractCaptureDetailsButton sessionId={session.id} />
          <Link href={`/dashboard/sessions/${session.id}#extracted-evidence`} className="button button-primary touch-target">
            Review extracted evidence
          </Link>
          <Link href={`/dashboard/sessions/${session.id}`} className="button button-secondary touch-target">
            Back to Session Details
          </Link>
        </div>
      </section>

      <section className="guided-checklist-section" aria-label="Suggested evidence checklist">
        <div className="section-header compact-section-header">
          <div>
            <h2>Evidence checklist</h2>
            <p className="muted">Use these rows for status and guidance only. Capture extra evidence anytime above.</p>
          </div>
        </div>
        <div className="guided-step-list">
          {stepSummaries.map((summary) => (
            <GuidedStepCard key={summary.step.key} step={summary.step} status={summary.status} count={summary.count} />
          ))}
        </div>
      </section>

      <div className="guided-sticky-actions">
        <Link href="#main-capture-card" className="button button-primary touch-target">
          Capture Evidence
        </Link>
        <Link href={`/dashboard/sessions/${session.id}`} className="button button-secondary touch-target">
          Session Details
        </Link>
      </div>
    </main>
  )
}
