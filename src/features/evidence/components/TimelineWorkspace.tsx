import Link from 'next/link'

import { linkEvidenceToTimelineEvent, createTimelineEvent, deleteTimelineEvent, unlinkEvidenceRelationship, updateTimelineEvent } from '@/features/evidence/timeline/actions'
import type { TimelineEvent, TimelineEvidenceItem, TimelineRelationship, TimelineSession } from '@/features/evidence/timeline/data'
import { DIAGNOSTIC_EVENT_TYPES, EVIDENCE_SOURCE_KINDS, EVENT_DATE_PRECISIONS, SUGGESTION_REVIEW_STATUSES, formatDiagnosticEventType, formatSuggestionReviewStatus } from '@/features/evidence/constants'
import { formatDateTime } from '@/features/sessions'

function evidenceLabel(item: TimelineEvidenceItem) {
  return item.original_filename || item.technician_note || `${item.media_kind} evidence`
}

function eventDate(event: TimelineEvent, timeZone: string | null) {
  return formatDateTime(event.event_start_at ?? event.event_time ?? event.created_at, timeZone)
}

export function TimelineWorkspace({ session, events, evidenceItems, relationships, timeZone }: { session: TimelineSession; events: TimelineEvent[]; evidenceItems: TimelineEvidenceItem[]; relationships: TimelineRelationship[]; timeZone: string | null }) {
  const evidenceById = new Map(evidenceItems.map((item) => [item.id, item]))
  const relationshipsByEvent = new Map<string, TimelineRelationship[]>()
  for (const relationship of relationships) {
    relationshipsByEvent.set(relationship.target_id, [...(relationshipsByEvent.get(relationship.target_id) ?? []), relationship])
  }

  return (
    <div className="form-stack">
      <section className="card detail-card form-stack">
        <div>
          <p className="eyebrow">Session timeline</p>
          <h2>{session.title}</h2>
          <p className="muted">Manually organize evidence into reviewed timeline events. Reports and exports are unchanged.</p>
        </div>
      </section>

      <TimelineEventForm sessionId={session.id} timeZone={timeZone} />

      {events.length === 0 ? <div className="empty-state">No timeline events yet.</div> : events.map((event) => {
        const eventRelationships = relationshipsByEvent.get(event.id) ?? []
        return (
          <article key={event.id} className="card detail-card form-stack">
            <div className="section-header">
              <div>
                <p className="eyebrow">{formatDiagnosticEventType(event.event_type)} · {event.source_kind} · {formatSuggestionReviewStatus(event.review_status)}</p>
                <h2>{event.title}</h2>
                <p className="muted">{eventDate(event, timeZone)} · precision: {event.event_date_precision}{event.timezone ? ` · ${event.timezone}` : ''}</p>
              </div>
              <form action={deleteTimelineEvent.bind(null, session.id, event.id)}><button className="button button-secondary touch-target">Delete</button></form>
            </div>
            {event.description ? <p>{event.description}</p> : <p className="muted">No description.</p>}
            <div>
              <h3>Linked evidence ({eventRelationships.length})</h3>
              {eventRelationships.length === 0 ? <p className="muted">No evidence linked.</p> : (
                <ul className="form-stack">
                  {eventRelationships.map((relationship) => {
                    const item = evidenceById.get(relationship.source_id)
                    return <li key={relationship.id}><Link href={`/dashboard/sessions/${session.id}/evidence/${relationship.source_id}`}>{item ? evidenceLabel(item) : relationship.source_id}</Link> · {relationship.relationship_type} <form action={unlinkEvidenceRelationship.bind(null, session.id, relationship.id)} style={{ display: 'inline' }}><button className="secondary-link">unlink</button></form></li>
                  })}
                </ul>
              )}
            </div>
            <LinkEvidenceForm sessionId={session.id} eventId={event.id} evidenceItems={evidenceItems} />
            <details>
              <summary className="secondary-link touch-target">Edit event</summary>
              <TimelineEventForm sessionId={session.id} event={event} timeZone={timeZone} />
            </details>
          </article>
        )
      })}
    </div>
  )
}

function TimelineEventForm({ sessionId, event, timeZone }: { sessionId: string; event?: TimelineEvent; timeZone: string | null }) {
  const action = event ? updateTimelineEvent.bind(null, sessionId, event.id) : createTimelineEvent.bind(null, sessionId)
  return (
    <form action={action} className="card detail-card form-stack">
      <div><p className="eyebrow">{event ? 'Edit timeline event' : 'Create timeline event'}</p><h2>{event ? event.title : 'New event'}</h2></div>
      <label>Diagnostic event type<select className="input" name="event_type" defaultValue={event?.event_type ?? 'manual'}>{DIAGNOSTIC_EVENT_TYPES.map((value) => <option key={value} value={value}>{formatDiagnosticEventType(value)}</option>)}</select></label>
      <label>Title<input className="input" name="title" required defaultValue={event?.title ?? ''} /></label>
      <label>Description<textarea className="input" name="description" rows={3} defaultValue={event?.description ?? ''} /></label>
      <div className="form-grid two-column">
        <label>Start<input className="input" type="datetime-local" name="event_start_at" defaultValue={toLocalInput(event?.event_start_at)} /></label>
        <label>End<input className="input" type="datetime-local" name="event_end_at" defaultValue={toLocalInput(event?.event_end_at)} /></label>
      </div>
      <div className="form-grid two-column">
        <label>Date precision<select className="input" name="event_date_precision" defaultValue={event?.event_date_precision ?? 'exact'}>{EVENT_DATE_PRECISIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Source<select className="input" name="source_kind" defaultValue={event?.source_kind ?? 'text_note'}>{EVIDENCE_SOURCE_KINDS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Review status<select className="input" name="review_status" defaultValue={event?.review_status ?? 'accepted'}>{SUGGESTION_REVIEW_STATUSES.map((value) => <option key={value} value={value}>{formatSuggestionReviewStatus(value)}</option>)}</select></label>
        <label>Timezone<input className="input" name="timezone" defaultValue={event?.timezone ?? timeZone ?? ''} /></label>
      </div>
      <button className="button button-primary touch-target">{event ? 'Save timeline event' : 'Create timeline event'}</button>
    </form>
  )
}

function LinkEvidenceForm({ sessionId, eventId, evidenceItems }: { sessionId: string; eventId: string; evidenceItems: TimelineEvidenceItem[] }) {
  return <form action={linkEvidenceToTimelineEvent.bind(null, sessionId, eventId)} className="form-actions"><select className="input" name="capture_item_id" required><option value="">Select evidence</option>{evidenceItems.map((item) => <option key={item.id} value={item.id}>{evidenceLabel(item)}</option>)}</select><select className="input" name="relationship_type" defaultValue="documents"><option value="documents">documents</option><option value="supports">supports</option></select><button className="button button-secondary touch-target">Link evidence</button></form>
}

function toLocalInput(value?: string | null) {
  if (!value) return ''
  return value.slice(0, 16)
}
