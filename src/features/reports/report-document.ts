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
  if (capture.media_kind === 'image' || capture.type === 'photo') return 'Supporting photo'
  if (capture.media_kind === 'video' || capture.type === 'video') return 'Supporting video'
  if (capture.media_kind === 'audio' || capture.type === 'voice_note') return 'Voice note'
  if (capture.media_kind === 'document') return 'Reference document'
  return 'Supporting file'
}

export function getEvidenceIdentifier(index: number) {
  return `ITEM-${String(index + 1).padStart(3, '0')}`
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
      'Cover',
      'Executive Summary',
      'Documented Observations',
      'Approval',
    ],
    trustStatement:
      'CRED assembles technician-provided notes, approved report text, and supporting proof. Technician notes remain the source of truth; photos and documents support the documented observations.',
  }
}
