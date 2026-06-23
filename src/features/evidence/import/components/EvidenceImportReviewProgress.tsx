import type { EvidenceImportCaptureItem } from '../data'

export function getImportReviewProgress(captureItems: EvidenceImportCaptureItem[]) {
  return { total: captureItems.length, reviewed: captureItems.filter((item) => item.evidence_review_status === 'reviewed').length, unreviewed: captureItems.filter((item) => item.evidence_review_status === 'unreviewed').length, needsFollowup: captureItems.filter((item) => item.evidence_review_status === 'needs_followup').length, excluded: captureItems.filter((item) => item.evidence_review_status === 'excluded').length, includedInOutputs: captureItems.filter((item) => item.include_in_report).length }
}

export function EvidenceImportReviewProgress({ captureItems }: { captureItems: EvidenceImportCaptureItem[] }) {
  const progress = getImportReviewProgress(captureItems)
  return <section className="card"><h2>Batch progress</h2><dl className="metadata-list"><div><dt>Total imported items</dt><dd>{progress.total}</dd></div><div><dt>Reviewed count</dt><dd>{progress.reviewed}</dd></div><div><dt>Unreviewed count</dt><dd>{progress.unreviewed}</dd></div><div><dt>Needs follow-up count</dt><dd>{progress.needsFollowup}</dd></div><div><dt>Excluded count</dt><dd>{progress.excluded}</dd></div><div><dt>Included-in-outputs count</dt><dd>{progress.includedInOutputs}</dd></div></dl></section>
}
