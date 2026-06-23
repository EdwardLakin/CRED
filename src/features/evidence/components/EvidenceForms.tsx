'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { clearEvidenceDuplicate, markEvidenceDuplicate, updateEvidenceOutputInclusion, updateEvidenceReviewStatus, updateEvidenceSourceDates, updateEvidenceSourceMetadata, type EvidenceMutationResult } from '@/features/evidence/library/actions'
import { EVIDENCE_REVIEW_STATUSES, EVENT_DATE_PRECISIONS, EVIDENCE_WORKSPACE_LABELS, formatEvidenceReviewStatus } from '@/features/evidence/constants'
import type { EvidenceLibraryItem } from '@/features/evidence/library/data'

function inputDate(value: string | null) {
  return value ? value.slice(0, 10) : ''
}

export function EvidenceReviewForm({ item }: { item: EvidenceLibraryItem }) {
  const router = useRouter()
  const [selectedStatus, setSelectedStatus] = useState(item.evidence_review_status)
  const [state, formAction, pending] = useActionState<EvidenceMutationResult, FormData>(updateEvidenceReviewStatus.bind(null, item.id), { ok: false, message: '' })
  useEffect(() => {
    if (state.ok) router.refresh()
  }, [router, state.ok])
  return (
    <form action={formAction} className="evidence-compact-control-form" aria-label="Save review status">
      <label className="label" htmlFor={`review-${item.id}`}>Review status</label>
      <select id={`review-${item.id}`} name="evidence_review_status" className="select evidence-compact-select" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value as EvidenceLibraryItem['evidence_review_status'])}>
        {EVIDENCE_REVIEW_STATUSES.map((status) => <option key={status} value={status}>{formatEvidenceReviewStatus(status)}</option>)}
      </select>
      <button className="button button-secondary evidence-control-save" disabled={pending}>{pending ? 'Saving…' : 'Save review'}</button>
      {state.message ? <p className={state.ok ? 'success evidence-control-message' : 'error evidence-control-message'}>{state.message}</p> : null}
    </form>
  )
}

export function EvidenceInclusionForm({ item }: { item: EvidenceLibraryItem }) {
  const router = useRouter()
  const [included, setIncluded] = useState(Boolean(item.include_in_report))
  const [state, formAction, pending] = useActionState<EvidenceMutationResult, FormData>(updateEvidenceOutputInclusion.bind(null, item.id), { ok: false, message: '' })
  useEffect(() => {
    if (state.ok) router.refresh()
  }, [router, state.ok])
  return (
    <form action={formAction} className="evidence-compact-control-form evidence-inclusion-control-form" aria-label="Save output preference">
      <label className="checkbox-row evidence-compact-checkbox"><input type="checkbox" name="include_in_report" checked={included} onChange={(event) => setIncluded(event.target.checked)} /> {EVIDENCE_WORKSPACE_LABELS.includeInOutputs}</label>
      <button className="button button-secondary evidence-control-save" disabled={pending}>{pending ? 'Saving…' : 'Save output'}</button>
      {state.message ? <p className={state.ok ? 'success evidence-control-message' : 'error evidence-control-message'}>{state.message}</p> : null}
    </form>
  )
}

export function EvidenceDateForm({ item }: { item: EvidenceLibraryItem }) {
  return (
    <form action={updateEvidenceSourceDates.bind(null, item.id)} className="form-stack">
      <div className="form-grid two-columns">
        <label className="field-stack"><span className="label">Event date</span><input className="input" type="date" name="event_date" defaultValue={inputDate(item.event_date)} /></label>
        <label className="field-stack"><span className="label">Event date precision</span><select className="select" name="event_date_precision" defaultValue={item.event_date_precision ?? ''}><option value="">Not set</option>{EVENT_DATE_PRECISIONS.map((precision) => <option key={precision} value={precision}>{precision}</option>)}</select></label>
        <label className="field-stack"><span className="label">Source created</span><input className="input" type="date" name="source_created_at" defaultValue={inputDate(item.source_created_at)} /></label>
        <label className="field-stack"><span className="label">Source sent</span><input className="input" type="date" name="source_sent_at" defaultValue={inputDate(item.source_sent_at)} /></label>
        <label className="field-stack"><span className="label">Source received</span><input className="input" type="date" name="source_received_at" defaultValue={inputDate(item.source_received_at)} /></label>
      </div>
      <button className="button button-secondary">Save dates</button>
    </form>
  )
}

export function EvidenceMetadataForm({ item }: { item: EvidenceLibraryItem }) {
  return (
    <form action={updateEvidenceSourceMetadata.bind(null, item.id)} className="form-stack">
      <label className="field-stack"><span className="label">Source URI</span><input className="input" name="source_uri" defaultValue={item.source_uri ?? ''} /></label>
      <label className="field-stack"><span className="label">Source metadata JSON</span><textarea className="input" name="source_metadata" rows={5} defaultValue={JSON.stringify(item.source_metadata ?? {}, null, 2)} /></label>
      <button className="button button-secondary">Save metadata</button>
    </form>
  )
}

export function EvidenceDuplicateForm({ item, candidates }: { item: EvidenceLibraryItem; candidates: EvidenceLibraryItem[] }) {
  return (
    <div className="form-actions">
      <form action={markEvidenceDuplicate.bind(null, item.id)} className="inline-form">
        <select className="select" name="duplicate_of_capture_item_id" defaultValue={item.duplicate_of_capture_item_id ?? ''}>
          <option value="">Duplicate of unknown item</option>
          {candidates.filter((candidate) => candidate.id !== item.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.original_filename || candidate.technician_note || candidate.id}</option>)}
        </select>
        <button className="button button-secondary">Mark duplicate</button>
      </form>
      <form action={clearEvidenceDuplicate.bind(null, item.id)}><button className="button button-secondary">Clear duplicate</button></form>
    </div>
  )
}
