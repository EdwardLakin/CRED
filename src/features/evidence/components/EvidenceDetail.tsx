import { formatDateTime } from '@/features/sessions'

import { getCredTier, type FeatureAccessSubject } from '@/features/billing/feature-gates'

import type { EvidenceLibraryBatch, EvidenceLibraryItem } from '@/features/evidence/library/data'

import { EvidenceDateForm, EvidenceDuplicateForm, EvidenceInclusionForm, EvidenceMetadataForm, EvidenceReviewForm } from './EvidenceForms'

import { EvidencePreview } from './EvidencePreview'

function show(value: string | null | undefined) {

  return value?.trim() || 'Not available'

}

function fmt(value: string | null, timeZone: string | null) {

  return value ? formatDateTime(value, timeZone) : 'Not documented'

}

function label(value: string | null | undefined) {

  return value

    ? value

        .replaceAll('_', ' ')

        .replace(/\b\w/g, (letter) => letter.toUpperCase())

    : 'Not documented'

}

function processingLabel(item: EvidenceLibraryItem) {

  const statuses = [item.processing_status, item.ai_status].filter(Boolean)

  if (statuses.length === 0) return 'Ready'

  return statuses.map(label).join(' · ')

}

export function EvidenceDetail({

  item,

  allItems,

  relatedImportBatch,

  signedUrl,

  timeZone,

  accessSubject,

}: {

  item: EvidenceLibraryItem

  allItems: EvidenceLibraryItem[]

  relatedImportBatch: EvidenceLibraryBatch | null

  signedUrl?: string

  timeZone: string | null

  accessSubject?: FeatureAccessSubject

}) {

  const isInvestigation = getCredTier(accessSubject) === 'investigation'

  const detailsOpen = isInvestigation

  return (

    <div className="evidence-detail-layout">

      <section className="card detail-card form-stack evidence-detail-primary">

        <EvidencePreview item={item} signedUrl={signedUrl} large />

        <dl className="metadata-list evidence-summary-list">

          <div><dt>Item title</dt><dd>{show(item.technician_note || item.original_filename)}</dd></div>

          <div><dt>Added to workspace</dt><dd>{fmt(item.captured_at ?? item.created_at, timeZone)}</dd></div>

        </dl>

        <div className="evidence-control-panel">

          <div>

            <h2>Review and output</h2>

            <p className="muted">Review status tracks human review. Output inclusion controls whether this item can appear in reports and deliverables.</p>

          </div>

          <EvidenceReviewForm item={item} />

          <EvidenceInclusionForm item={item} />

        </div>

        <details className="evidence-details-panel" open={detailsOpen}>

          <summary className="touch-target">

            <span>Item details</span>

            <span className="muted">{isInvestigation ? 'Investigation view' : 'More details'}</span>

          </summary>

          <dl className="metadata-list">

            <div><dt>Item type</dt><dd>{label(item.media_kind)}</dd></div>

            <div><dt>Source</dt><dd>{label(item.source_kind)}</dd></div>

            <div><dt>Processing history</dt><dd>{processingLabel(item)}</dd></div>

            <div><dt>Original filename</dt><dd>{item.original_filename ?? 'Not available'}</dd></div>

            <div><dt>Event date</dt><dd>{fmt(item.event_date, timeZone)} · {label(item.event_date_precision)}</dd></div>

            <div><dt>Source dates</dt><dd>Created {fmt(item.source_created_at, timeZone)} · Sent {fmt(item.source_sent_at, timeZone)} · Received {fmt(item.source_received_at, timeZone)}</dd></div>

            <div><dt>Duplicate check</dt><dd>{label(item.duplicate_status)}{item.duplicate_of_capture_item_id ? ` of ${item.duplicate_of_capture_item_id}` : ''}</dd></div>

            <div><dt>Related import batch</dt><dd>{relatedImportBatch ? `${label(relatedImportBatch.source_kind)} · ${label(relatedImportBatch.status)}` : 'Not available'}</dd></div>

          </dl>

        </details>

      </section>

      {isInvestigation ? (

        <>

          <section className="card detail-card form-stack">

            <h2>Item text</h2>

            <h3>Note</h3>

            <p>{show(item.technician_note)}</p>

            <h3>Transcript</h3>

            <p>{show(item.transcript)}</p>

            <h3>OCR text</h3>

            <pre className="text-block">{show(item.ocr_text)}</pre>

            <h3>Extracted data</h3>

            <pre className="text-block">{JSON.stringify(item.extracted_data ?? {}, null, 2)}</pre>

          </section>

          <section className="card detail-card form-stack">

            <h2>Investigation controls</h2>

            <EvidenceDuplicateForm item={item} candidates={allItems} />

          </section>

          <section className="card detail-card form-stack">

            <h2>Source dates</h2>

            <EvidenceDateForm item={item} />

          </section>

          <section className="card detail-card form-stack">

            <h2>Source metadata</h2>

            <EvidenceMetadataForm item={item} />

          </section>

        </>

      ) : null}

    </div>

  )

}
