import { formatDateTime } from '@/features/sessions'

export type EvidenceDocumentCapture = {
  id: string
  captured_at: string
  type: string | null
  media_kind: string | null
  technician_note: string | null
  transcript: string | null
}

export type ReportEvidenceItem<TCapture extends EvidenceDocumentCapture> = {
  capture: TCapture
  evidenceId: string
  capturedAtLabel: string
  evidenceType: string
  note: string | null
  sourceCaptureId: string
}

export type UniversalReportDocument<TCapture extends EvidenceDocumentCapture> = {
  evidenceItems: ReportEvidenceItem<TCapture>[]
  sectionOrder: string[]
  trustStatement: string
}

export function getEvidenceNote(capture: EvidenceDocumentCapture) {
  return capture.technician_note?.trim() || capture.transcript?.trim() || null
}

export function getEvidenceTypeLabel(capture: EvidenceDocumentCapture) {
  if (capture.type === 'text_note' || capture.media_kind === 'note') return 'Technician note'
  if (capture.media_kind === 'image' || capture.type === 'photo') return 'Photo evidence'
  if (capture.media_kind === 'video' || capture.type === 'video') return 'Video evidence'
  if (capture.media_kind === 'audio' || capture.type === 'voice_note') return 'Voice note'
  if (capture.media_kind === 'document') return 'Reference document'
  return 'Supporting file'
}

export function getEvidenceIdentifier(index: number) {
  return `E-${String(index + 1).padStart(3, '0')}`
}

export function buildUniversalReportDocument<TCapture extends EvidenceDocumentCapture>(params: {
  captures: TCapture[]
  timeZone: string | null
  reportType?: string | null
}): UniversalReportDocument<TCapture> {
  const reportType = params.reportType || 'General Evidence Report'
  return {
    evidenceItems: params.captures.map((capture, index) => ({
      capture,
      evidenceId: getEvidenceIdentifier(index),
      capturedAtLabel: formatDateTime(capture.captured_at, params.timeZone),
      evidenceType: getEvidenceTypeLabel(capture),
      note: getEvidenceNote(capture),
      sourceCaptureId: capture.id,
    })),
    sectionOrder: [
      'Cover',
      'Report Overview',
      'Report Information',
      'Final Summary / Notes',
      'Captured Evidence',
      'Evidence Appendix',
      'Inspector Details',
      'Signature',
    ],
    trustStatement:
      `CRED assembles this ${reportType} from user-selected session metadata, approved report text, and included evidence. Users remain the source of truth; CRED does not infer report type, diagnose, determine findings, or recommend repairs.`,
  }
}
