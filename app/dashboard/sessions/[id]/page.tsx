import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  AddCaptureForm,
  CaptureList,
  ClassifyPendingCapturesButton,
  ExtractCaptureDetailsButton,
  ExtractedEvidencePanel,
} from '@/features/capture'
import { ThemeToggle } from '@/components/theme'
import { SESSION_STATUSES, SessionStatusBadge, formatDateTime } from '@/features/sessions'
import {
  applySessionSuggestions,
  archiveDocumentationSession,
  restoreDocumentationSession,
  updateDocumentationSession,
} from '@/features/sessions/actions'
import { requireSessionWorkspace } from '@/features/sessions/data'


const SUGGESTION_FIELD_LABELS: Record<string, string> = {
  asset_label: 'Asset Label',
  vin: 'VIN',
  odometer: 'Odometer',
  unit_number: 'Unit Number',
  customer_name: 'Customer',
}

const SUPPORTED_APPLY_FIELDS = ['asset_label', 'vin', 'odometer', 'unit_number', 'customer_name']

const SUGGESTION_SOURCE_LABELS: Record<string, string> = {
  registration: 'Registration',
  vin_plate: 'VIN Plate',
  license_plate: 'License Plate',
  unit_number: 'Unit Number',
  inspection_sheet: 'Inspection Sheet',
  work_order: 'Work Order',
  odometer: 'Odometer',
  hour_meter: 'Hour Meter',
  info_plate: 'Info Plate',
  other_document: 'Other Document',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatConfidence(value: unknown) {
  const confidence = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(confidence)) {
    return '—'
  }

  return `${Math.round(Math.min(1, Math.max(0, confidence)) * 100)}%`
}

function formatSuggestionSource(value: unknown) {
  return typeof value === 'string' && value ? SUGGESTION_SOURCE_LABELS[value] ?? value.replace(/_/g, ' ') : 'capture'
}

function getSuggestionRows(suggestedDetails: unknown) {
  if (!isRecord(suggestedDetails)) {
    return []
  }

  return Object.entries(suggestedDetails)
    .filter(([field]) => SUPPORTED_APPLY_FIELDS.includes(field))
    .map(([field, suggestion]) => {
      if (!isRecord(suggestion) || typeof suggestion.value !== 'string' || !suggestion.value.trim()) {
        return null
      }

      return {
        field,
        label: SUGGESTION_FIELD_LABELS[field] ?? field.replace(/_/g, ' '),
        value: suggestion.value.trim(),
        source: formatSuggestionSource(suggestion.source_type),
        confidence: formatConfidence(suggestion.confidence),
        applied: suggestion.applied === true,
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => a.label.localeCompare(b.label))
}

function SuggestedSessionDetailsCard({ sessionId, suggestedDetails }: { sessionId: string; suggestedDetails: unknown }) {
  const suggestions = getSuggestionRows(suggestedDetails)
  const applyAction = applySessionSuggestions.bind(null, sessionId)
  const hasSupportedSuggestions = suggestions.length > 0

  return (
    <section className="card detail-card suggested-details-card form-stack">
      <div>
        <h2>Suggested Session Details</h2>
        <p className="muted">
          Review extracted values before applying them. CRED will not overwrite Session Details until you choose what to apply.
        </p>
      </div>

      {suggestions.length === 0 ? (
        <div className="empty-state suggestions-empty-state">
          No suggestions yet. Classify captures, then extract details from captures to prepare session updates.
        </div>
      ) : (
        <form action={applyAction} className="form-stack">
          <div className="suggestion-list">
            {suggestions.map((suggestion) => (
              <label key={suggestion.field} className="suggestion-row">
                <span className="suggestion-select">
                  <input
                    type="checkbox"
                    name="selected_fields"
                    value={suggestion.field}
                    defaultChecked={!suggestion.applied}
                  />
                </span>
                <span className="suggestion-main">
                  <strong>{suggestion.label}</strong>
                  <span>{suggestion.value}</span>
                  <small>
                    from {suggestion.source}, {suggestion.confidence}{suggestion.applied ? ' · applied' : ''}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <div className="form-actions suggestion-actions">
            <button className="button button-primary touch-target" disabled={!hasSupportedSuggestions}>
              Apply selected suggestions
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function DetailField({
  id,
  label,
  defaultValue,
  placeholder,
}: {
  id: string
  label: string
  defaultValue: string | null
  placeholder?: string
}) {
  return (
    <div className="field-stack">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} name={id} defaultValue={defaultValue ?? ''} placeholder={placeholder} className="input" />
    </div>
  )
}

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ captureError?: string; captureSaved?: string; error?: string; saved?: string; suggestionsApplied?: string }>
}) {
  const { id } = await params
  const { captureError, captureSaved, error, saved, suggestionsApplied } = await searchParams
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
    .order('captured_at', { ascending: false })

  const signedUrls: Record<string, string> = {}
  await Promise.all(
    (captures ?? []).map(async (capture) => {
      const { data } = await supabase.storage.from('documentation-captures').createSignedUrl(capture.storage_path, 60 * 10)

      if (data?.signedUrl) {
        signedUrls[capture.id] = data.signedUrl
      }
    }),
  )

  const saveAction = updateDocumentationSession.bind(null, session.id)
  const archiveAction = archiveDocumentationSession.bind(null, session.id)
  const restoreAction = restoreDocumentationSession.bind(null, session.id)
  const isArchived = session.status === 'archived'

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header">
        <div>
          <Link href="/dashboard/sessions" className="secondary-link touch-target">
            ← All sessions
          </Link>
          <div className="title-row">
            <h1>{session.title}</h1>
            <SessionStatusBadge status={session.status} />
          </div>
          <p className="muted">
            {session.session_type} · Updated {formatDateTime(session.updated_at ?? session.created_at)}
          </p>
        </div>
        <div className="page-actions">
          <ThemeToggle />
          <form action={isArchived ? restoreAction : archiveAction}>
            <button className="button button-secondary touch-target">
              {isArchived ? 'Restore Archived Session' : 'Archive Session'}
            </button>
          </form>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {captureError ? <p className="error">{captureError}</p> : null}
      {saved ? <p className="success">{suggestionsApplied ? `Applied ${suggestionsApplied} session suggestion${suggestionsApplied === '1' ? '' : 's'}.` : 'Session saved.'}</p> : null}
      {captureSaved ? <p className="success">Capture added.</p> : null}


      <section className="card detail-card field-mode-cta-card">
        <div>
          <p className="eyebrow guided-eyebrow">Field mode</p>
          <h2>Capture Session</h2>
          <p className="muted">Use guided capture for CVIP/inspection evidence.</p>
        </div>
        <Link href={`/dashboard/sessions/${session.id}/capture`} className="button button-primary touch-target">
          Start / Continue Capture
        </Link>
      </section>

      <section className="card detail-card capture-card form-stack">
        <div>
          <h2>Add Capture</h2>
          <p className="muted">
            Start with the camera. Capture evidence now, then let CRED classify VIN plates, info plates, documents,
            odometers, damage, and field photos automatically.
          </p>
        </div>
        <AddCaptureForm sessionId={session.id} sessionType={session.session_type} />
      </section>

      <section className="card detail-card capture-card form-stack">
        <div className="captures-section-header">
          <div>
            <h2>Captures</h2>
            <p className="muted">Review uploaded files, intake status, and extraction placeholders for this session.</p>
            <p className="next-ai-step">
              Next: AI will identify VIN plates, info plates, documents, odometers, and field photos automatically.
            </p>
          </div>
          <div className="capture-ai-actions">
            <ClassifyPendingCapturesButton sessionId={session.id} />
            <ExtractCaptureDetailsButton sessionId={session.id} />
          </div>
        </div>
        <CaptureList captures={captures ?? []} signedUrls={signedUrls} />
      </section>

      <div id="extracted-evidence">
        <ExtractedEvidencePanel captures={captures ?? []} signedUrls={signedUrls} />
      </div>

      <SuggestedSessionDetailsCard sessionId={session.id} suggestedDetails={session.suggested_details} />

      <form action={saveAction} className="card detail-card form-stack">
        <section className="form-stack">
          <div>
            <h2>Session Details</h2>
            <p className="muted">
              Rename the session, update its workflow status, and maintain asset and customer reference details.
            </p>
          </div>

          <div className="field-grid">
            <div className="field-stack field-wide">
              <label htmlFor="title" className="label">
                Title / Rename
              </label>
              <input id="title" name="title" required minLength={2} defaultValue={session.title} className="input" />
            </div>

            <div className="field-stack">
              <label htmlFor="session_type_display" className="label">
                Session Type
              </label>
              <input id="session_type_display" value={session.session_type} readOnly className="input readonly-input" />
            </div>

            <div className="field-stack">
              <label htmlFor="status" className="label">
                Status
              </label>
              <select id="status" name="status" defaultValue={session.status} className="select">
                {SESSION_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="form-stack">
          <h2>Asset Details</h2>
          <div className="field-grid">
            <DetailField
              id="asset_label"
              label="Asset Label"
              defaultValue={session.asset_label}
              placeholder="Equipment, vehicle, or property label"
            />
            <DetailField id="vin" label="VIN" defaultValue={session.vin} placeholder="Vehicle identification number" />
            <DetailField id="odometer" label="Odometer" defaultValue={session.odometer} placeholder="Mileage or hours" />
            <DetailField
              id="unit_number"
              label="Unit Number"
              defaultValue={session.unit_number}
              placeholder="Internal unit number"
            />
            <div className="field-wide">
              <DetailField
                id="customer_name"
                label="Customer Name"
                defaultValue={session.customer_name}
                placeholder="Customer or account name"
              />
            </div>
          </div>
        </section>

        <div className="form-actions">
          <Link href="/dashboard/sessions" className="button button-secondary touch-target">
            Cancel
          </Link>
          <button className="button button-primary touch-target">Save Changes</button>
        </div>
      </form>
    </main>
  )
}
