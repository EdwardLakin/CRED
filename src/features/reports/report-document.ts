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
}): UniversalReportDocument<TCapture> {
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
      'Cover page',
      'Report Information',
      'Summary',
      'Observations / Findings',
      'Recommendations (user-entered only)',
      'Evidence Appendix',
      'Inspector / Organization Details',
      'Signature / Approval',
    ],
    trustStatement:
      'CRED assembles user-provided captures, notes, and approved report text. Users remain the source of truth; CRED does not diagnose, classify photos, determine findings, or recommend repairs.',
  }
}
