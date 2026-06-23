import type { Json } from '@/lib/supabase/database.types'

export type CaptureOutputLike = {
  deleted_at?: string | null
  include_in_report?: boolean | null
  evidence_review_status?: string | null
  review_status?: string | null
  extracted_data?: Json | null
  capture_ai_analysis?: Json | null
  source_kind?: string | null
  suggestion_source?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isHiddenFromReport(metadata: unknown) {
  if (!isRecord(metadata)) return false
  return metadata.hidden_from_report === true || metadata.internal === true || metadata.internal_only === true || metadata.debug === true
}

export function isAiDerivedCapture(capture: CaptureOutputLike) {
  const source = `${capture.source_kind ?? capture.suggestion_source ?? ''}`.toLowerCase()
  return source === 'ai' || source === 'suggested' || source === 'system_suggested'
}

export function getCaptureReviewStatus(capture: CaptureOutputLike) {
  return capture.evidence_review_status ?? capture.review_status ?? null
}

export function isReviewedForOutput(status: string | null) {
  return status === 'accepted' || status === 'edited' || status === 'reviewed' || status === 'needs_followup'
}

export function isCaptureIncludedInOutput(capture: CaptureOutputLike) {
  const reviewStatus = getCaptureReviewStatus(capture)
  if (capture.deleted_at != null) return false
  if (isHiddenFromReport(capture.extracted_data) || isHiddenFromReport(capture.capture_ai_analysis)) return false
  if (reviewStatus === 'rejected') return false
  if (capture.include_in_report === false) return false
  if (isAiDerivedCapture(capture) && !isReviewedForOutput(reviewStatus)) return false
  return true
}

export function getIncludedCaptureReviewSummary(captures: CaptureOutputLike[]) {
  const included = captures.filter(isCaptureIncludedInOutput)
  const reviewed = included.filter((capture) => isReviewedForOutput(getCaptureReviewStatus(capture))).length
  return { included: included.length, reviewed, unreviewed: included.length - reviewed }
}
