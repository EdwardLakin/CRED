import Link from 'next/link'
import { generateSuggestionsForImportBatch } from '../actions'
import type { EvidenceImportCaptureItem } from '../data'

export function EvidenceImportSuggestionPanel({ sessionId, batchId, captureItems }: { sessionId: string; batchId: string; captureItems: EvidenceImportCaptureItem[] }) {
  const action = async (): Promise<void> => {
    'use server'
    await generateSuggestionsForImportBatch(sessionId, batchId)
  }
  const eligible = captureItems.filter((item) => item.evidence_review_status !== 'excluded' && item.include_in_report).length
  return <section className="card form-stack"><div className="section-header"><div><p className="eyebrow">Batch-scoped suggestion generation</p><h2>Generate AI suggestions</h2><p className="muted">Uses only included, non-excluded capture items in this import batch. Suggestions remain suggested for human review and preserve source evidence IDs.</p></div><Link className="button button-secondary" href={`/dashboard/sessions/${sessionId}/suggestions`}>Suggestions workspace</Link></div><p>Eligible included unreviewed evidence: {eligible}</p><form action={action}><button className="button" type="submit">Generate suggestions from all included unreviewed evidence</button></form><p className="muted">Generated now: timeline event suggestions and factual observation suggestions. Entity suggestions and relationship suggestions are not generated yet by this batch entry point.</p></section>
}
