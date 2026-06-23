import Link from 'next/link'
import { formatDateTime } from '@/features/sessions'
import type { Json } from '@/lib/supabase/database.types'
import type { DeliverableDetailData } from '../data'
import { formatDeliverableStatus, summarizeDeliverableContent } from '../data'
import { DeliverablePreview } from './DeliverablePreview'

export function DeliverableDetail({ data }: { data: DeliverableDetailData }) {
  const { deliverable, session, timeZone } = data
  return <main className="page-shell dashboard-shell"><div className="section-header page-header"><div><Link href={`/dashboard/sessions/${session.id}/deliverables`} className="secondary-link touch-target">← Deliverables workspace</Link><h1>{deliverable.title} — Version {deliverable.version_number}</h1><p className="muted">{session.title} · Printable evidence deliverable</p></div><Link href={`/dashboard/sessions/${session.id}/deliverables/${deliverable.id}/print`} className="button button-primary touch-target">Print / export</Link></div><section className="card detail-card form-stack"><div className="metadata-list"><div><dt>Type</dt><dd>{deliverable.deliverable_type}</dd></div><div><dt>Status</dt><dd>{formatDeliverableStatus(deliverable.status)}</dd></div><div><dt>Generated</dt><dd>{formatDateTime(deliverable.generated_at, timeZone)}</dd></div>{deliverable.finalized_at ? <div><dt>Finalized</dt><dd>{formatDateTime(deliverable.finalized_at, timeZone)}</dd></div> : null}<div><dt>Preview</dt><dd>{summarizeDeliverableContent(deliverable.content)}</dd></div></div><SourceProvenance provenance={deliverable.provenance} sourceIds={deliverable.source_ids} generatedAt={deliverable.generated_at} timeZone={timeZone} /><div><h2>Preview content</h2><DeliverablePreview deliverable={deliverable} /></div></section></main>
}

function SourceProvenance({ provenance, sourceIds, generatedAt, timeZone }: { provenance: Json; sourceIds: Json; generatedAt: string; timeZone: string | null }) {
  const provenanceRecord = asRecord(provenance)
  const selection = asRecord(provenanceRecord.source_selection)
  const ids = asRecord(sourceIds)
  return <section className="form-stack"><div><h2>Source provenance</h2><p className="muted">This section reads from the immutable provenance stored on this deliverable version. It is not recomputed from the current workspace.</p></div><div className="metadata-list"><ProvenanceIds label="Selected import batches" ids={stringList(selection.selectedImportBatchIds)} /><ProvenanceIds label="Selected evidence items" ids={stringList(selection.selectedCaptureItemIds).length ? stringList(selection.selectedCaptureItemIds) : stringList(ids.evidence_item_ids)} /><ProvenanceIds label="Selected factual observations" ids={stringList(selection.selectedAssertionIds).length ? stringList(selection.selectedAssertionIds) : stringList(ids.assertion_ids)} /><ProvenanceIds label="Selected timeline events" ids={stringList(selection.selectedTimelineEventIds).length ? stringList(selection.selectedTimelineEventIds) : stringList(ids.timeline_event_ids)} /><ProvenanceIds label="Selected entities" ids={stringList(selection.selectedEntityIds).length ? stringList(selection.selectedEntityIds) : stringList(ids.entity_ids)} /><div><dt>Include needs follow-up evidence</dt><dd>{yesNo(selection.includeNeedsFollowUpEvidence)}</dd></div><div><dt>Include output-excluded evidence</dt><dd>{yesNo(selection.includeOutputExcludedEvidence)}</dd></div><div><dt>Accepted suggestion option</dt><dd>{yesNo(selection.includeAcceptedSuggestions)}</dd></div><div><dt>Edited suggestion option</dt><dd>{yesNo(selection.includeEditedSuggestions)}</dd></div><div><dt>Generated timestamp</dt><dd>{formatDateTime(generatedAt, timeZone)}</dd></div><div><dt>Generator metadata</dt><dd>{String(provenanceRecord.generated_from ?? 'evidence_workspace')} · deterministic: {yesNo(provenanceRecord.deterministic)}</dd></div></div><details><summary className="touch-target">Raw provenance JSON for debugging</summary><pre>{JSON.stringify(provenance, null, 2)}</pre></details></section>
}

function ProvenanceIds({ label, ids }: { label: string; ids: string[] }) {
  return <div><dt>{label}</dt><dd>{ids.length} selected{ids.length ? <ul>{ids.map((id) => <li key={id}><code>{id}</code></li>)}</ul> : null}</dd></div>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function yesNo(value: unknown) {
  return value === true ? 'Yes' : 'No'
}
