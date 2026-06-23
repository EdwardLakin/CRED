import { bulkUpdateBatchEvidenceOutputInclusion, bulkUpdateBatchEvidenceReviewStatus, generateSuggestionsForSelectedBatchEvidence } from '../actions'
import type { EvidenceImportCaptureItem } from '../data'

export function EvidenceImportBulkActions({ sessionId, batchId, captureItems }: { sessionId: string; batchId: string; captureItems: EvidenceImportCaptureItem[] }) {
  const reviewAction = bulkUpdateBatchEvidenceReviewStatus.bind(null, sessionId, batchId)
  const outputAction = bulkUpdateBatchEvidenceOutputInclusion.bind(null, sessionId, batchId)
  const suggestSelectedAction = async (formData: FormData): Promise<void> => {
    'use server'
    await generateSuggestionsForSelectedBatchEvidence(sessionId, batchId, formData)
  }
  const checkboxes = captureItems.map((item) => <label key={item.id} className="checkbox-row"><input type="checkbox" name="capture_item_ids" value={item.id} /> {item.original_filename ?? item.id}</label>)
  return <section className="card form-stack"><h2>Bulk actions</h2><form action={reviewAction}><input type="hidden" name="scope" value="all_unreviewed" /><input type="hidden" name="evidence_review_status" value="reviewed" /><button className="button" type="submit">Mark all unreviewed as reviewed</button></form><form action={outputAction} className="form-stack"><input type="hidden" name="include_in_report" value="false" />{checkboxes}<button className="button button-secondary" type="submit">Exclude selected from outputs</button></form><form action={outputAction} className="form-stack"><input type="hidden" name="include_in_report" value="true" />{checkboxes}<button className="button button-secondary" type="submit">Include selected in outputs</button></form><form action={suggestSelectedAction} className="form-stack">{checkboxes}<button className="button" type="submit">Generate suggestions from selected evidence</button></form></section>
}
