import type { Json } from '@/lib/supabase/database.types'
import type { CaptureItem } from './types'
import { getRequiredEvidenceCompletion } from './guided-workflow'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function flattenText(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [String(value)]
  if (Array.isArray(value)) return value.flatMap(flattenText)
  if (isRecord(value)) return Object.entries(value).flatMap(([key, entry]) => [key, ...flattenText(entry)])
  return []
}

function captureText(capture: CaptureItem) {
  return [
    capture.technician_note,
    capture.transcript,
    capture.ai_summary,
    capture.ocr_text,
    ...flattenText(capture.extracted_data),
  ].filter(Boolean).join(' ').toLowerCase()
}

function countCriticalFindings(captures: CaptureItem[]) {
  return captures.filter((capture) => /\b(critical|unsafe|out of service|fail|failed|red tag|do not operate|requires immediate)\b/i.test(captureText(capture))).length
}

function getProcessingStatus(capture: CaptureItem) {
  return capture.processing_status ?? capture.ai_status ?? 'uploaded'
}

function getAiStatusCounts(captures: CaptureItem[]) {
  return captures.reduce(
    (counts, capture) => {
      const status = getProcessingStatus(capture)
      if (status === 'queued') counts.queued += 1
      else if (status === 'analyzing' || status === 'processing') counts.analyzing += 1
      else if (status === 'needs_review') counts.needsReview += 1
      else if (['analysis_failed', 'grouping_failed', 'failed'].includes(status)) counts.failed += 1
      else if (['analyzed', 'grouped', 'report_ready', 'extracted', 'ready_for_review'].includes(status)) counts.complete += 1
      return counts
    },
    { queued: 0, analyzing: 0, complete: 0, needsReview: 0, failed: 0 },
  )
}

function getConfidence(capture: CaptureItem) {
  const status = getProcessingStatus(capture)
  if (['queued', 'analyzing'].includes(status)) return 0.35
  if (['analysis_failed', 'grouping_failed', 'failed'].includes(status)) return 0.25
  const data = capture.extracted_data
  if (!isRecord(data)) return null
  const candidates = [data.confidence, isRecord(data.classification) ? data.classification.confidence : null, isRecord(data.extraction) ? data.extraction.confidence : null]
  const value = candidates.find((candidate) => typeof candidate === 'number')
  return typeof value === 'number' ? Math.max(0, Math.min(1, value)) : null
}

export function getInspectionProgress(captures: CaptureItem[], sessionType: string, templateRequiredEvidence?: Json | null, signatureCount = 0) {
  const evidence = getRequiredEvidenceCompletion(captures, sessionType, templateRequiredEvidence)
  const requiredTotal = Math.max(evidence.totalCount, 1)
  const evidenceCompleteness = Math.round((evidence.completedCount / requiredTotal) * 100)
  const confidences = captures.map(getConfidence).filter((value): value is number => value !== null)
  const findingConfidence = confidences.length > 0 ? Math.round((confidences.reduce((sum, value) => sum + value, 0) / confidences.length) * 100) : captures.length > 0 ? 72 : 0
  const aiStatusCounts = getAiStatusCounts(captures)
  const pendingAiCount = aiStatusCounts.queued + aiStatusCounts.analyzing
  const failedAiCount = aiStatusCounts.failed
  const signatureReady = signatureCount > 0 ? 100 : 0
  const aiReadinessPenalty = Math.min(25, pendingAiCount * 10 + failedAiCount * 5)
  const reportReadiness = Math.max(0, Math.round((evidenceCompleteness * 0.55) + (findingConfidence * 0.30) + (signatureReady * 0.15) - aiReadinessPenalty))
  const criticalFindings = countCriticalFindings(captures)
  const nextMissing = evidence.missing[0]?.rule.label ?? null

  return {
    evidence,
    inspectionComplete: evidenceCompleteness,
    remainingRequiredItems: evidence.missing.length,
    criticalFindings,
    missingEvidence: evidence.missing.length,
    evidenceCompleteness,
    findingConfidence,
    reportReadiness,
    aiStatusCounts,
    isInitialAiAnalysisPending: pendingAiCount > 0,
    canShowReadinessMetrics: captures.length === 0 || pendingAiCount === 0,
    missingReadinessItems: [
      ...evidence.missing.slice(0, 3).map((row) => row.rule.label),
      ...(pendingAiCount > 0 ? ['AI analysis still running'] : []),
      ...(failedAiCount > 0 ? ['AI analysis failed — verify manually'] : []),
      ...(signatureCount === 0 ? ['Customer/inspector signature'] : []),
    ],
    nextStep: nextMissing ? `Capture ${nextMissing} evidence.` : 'Review draft report and collect required signoff.',
  }
}
