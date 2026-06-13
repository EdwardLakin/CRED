import type { Database, Json } from '@/lib/supabase/database.types'

export type CaptureItem = Database['public']['Tables']['capture_items']['Row']
export type CaptureType = 'photo' | 'document' | 'vin_plate' | 'info_plate' | 'voice_note' | 'text_note' | 'video' | 'evidence_video'
export type CaptureIntent = 'auto_image' | 'auto_evidence' | 'manual'

export type SourceDocumentType =
  | 'work_order'
  | 'registration'
  | 'vin_plate'
  | 'data_plate'
  | 'odometer'
  | 'licence_plate'
  | 'unit_number'
  | 'other'

export type SourceDocumentMetadata = {
  type: SourceDocumentType
  label: string
  status: 'pending_extraction' | 'extracted' | 'needs_review'
}

export const SOURCE_DOCUMENT_OPTIONS: Array<{ type: SourceDocumentType; label: string }> = [
  { type: 'work_order', label: 'Work Order' },
  { type: 'registration', label: 'Registration' },
  { type: 'vin_plate', label: 'VIN Plate' },
  { type: 'data_plate', label: 'Data Plate' },
  { type: 'odometer', label: 'Odometer' },
  { type: 'licence_plate', label: 'Licence Plate' },
  { type: 'unit_number', label: 'Unit Number' },
  { type: 'other', label: 'Other Source Document' },
]

export const SOURCE_DOCUMENT_LABELS: Record<SourceDocumentType, string> = Object.fromEntries(
  SOURCE_DOCUMENT_OPTIONS.map((option) => [option.type, option.label]),
) as Record<SourceDocumentType, string>

export function isSourceDocumentType(value: string): value is SourceDocumentType {
  return SOURCE_DOCUMENT_OPTIONS.some((option) => option.type === value)
}

export function getSourceDocumentOption(type: SourceDocumentType) {
  return SOURCE_DOCUMENT_OPTIONS.find((option) => option.type === type) ?? {
    type,
    label: SOURCE_DOCUMENT_LABELS[type],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getSourceDocumentMetadata(extractedData: Json | null): SourceDocumentMetadata | null {
  if (!isRecord(extractedData) || !isRecord(extractedData.source_document)) {
    return null
  }

  const sourceDocument = extractedData.source_document
  const type = typeof sourceDocument.type === 'string' && isSourceDocumentType(sourceDocument.type)
    ? sourceDocument.type
    : null

  if (!type) {
    return null
  }

  const label = typeof sourceDocument.label === 'string' && sourceDocument.label.trim()
    ? sourceDocument.label.trim()
    : SOURCE_DOCUMENT_LABELS[type]
  const status =
    sourceDocument.status === 'extracted' || sourceDocument.status === 'needs_review'
      ? sourceDocument.status
      : 'pending_extraction'

  return { type, label, status }
}

export function addSourceDocumentMetadata(
  extractedData: Json,
  sourceDocument: { type: SourceDocumentType; label?: string },
): Json {
  const existingObject = isRecord(extractedData) ? extractedData : {}
  const label = sourceDocument.label?.trim() || SOURCE_DOCUMENT_LABELS[sourceDocument.type]

  return {
    ...existingObject,
    source_document: {
      type: sourceDocument.type,
      label,
      status: 'pending_extraction',
    },
  }
}

export const CAPTURE_TYPES: Array<{ value: CaptureType; label: string; helper: string }> = [
  { value: 'photo', label: 'Field Photo', helper: 'General image or damage photo' },
  { value: 'document', label: 'Document', helper: 'PDF, document scan, or image' },
  { value: 'vin_plate', label: 'VIN Plate', helper: 'Vehicle VIN label or plate' },
  { value: 'info_plate', label: 'Info/Data Plate', helper: 'Manufacturer, rating, or data tag' },
  { value: 'voice_note', label: 'Voice Note', helper: 'Audio note for later transcription' },
  { value: 'text_note', label: 'Text Note', helper: 'Typed evidence note without a file' },
  { value: 'video', label: 'Video', helper: 'Short evidence video with note' },
]

export const CAPTURE_TYPE_LABELS: Record<CaptureType, string> = {
  photo: 'Image',
  document: 'Document',
  vin_plate: 'VIN Plate',
  info_plate: 'Info/Data Plate',
  voice_note: 'Voice Note',
  text_note: 'Text Note',
  video: 'Video',
  evidence_video: 'Evidence Video',
}

export const MANUAL_CAPTURE_TYPES = CAPTURE_TYPES

export function isCaptureType(value: string): value is CaptureType {
  return CAPTURE_TYPES.some((captureType) => captureType.value === value)
}

export function isCaptureIntent(value: string): value is CaptureIntent {
  return value === 'auto_image' || value === 'auto_evidence' || value === 'manual'
}

export function getAutoImageExtractedData(): Json {
  return {
    kind: 'unclassified_image',
    classification: {
      status: 'pending',
      detected_type: null,
      confidence: null,
    },
    extraction: {
      status: 'not_started',
    },
  }
}

export function getInitialExtractedData(type: CaptureType): Json {
  switch (type) {
    case 'vin_plate':
      return { kind: 'vin_plate', vin: null, confidence: null, status: 'pending_ocr' }
    case 'info_plate':
      return { kind: 'info_plate', fields: {}, status: 'pending_ocr' }
    case 'document':
      return {
        kind: 'document',
        classification: { status: 'manual_document', detected_type: 'document', confidence: null },
        extraction: { status: 'not_started' },
      }
    case 'photo':
      return { kind: 'photo', status: 'captured' }
    case 'video':
    case 'evidence_video':
      return {
        kind: 'video',
        classification: { status: 'pending', detected_type: 'supporting_photo', confidence: null },
        extraction: { status: 'not_started' },
      }
    case 'voice_note':
      return {
        kind: 'voice_note',
        classification: { status: 'manual_audio', detected_type: 'voice_note', confidence: null },
        extraction: { status: 'not_started' },
      }
    case 'text_note':
      return {
        kind: 'text_note',
        classification: { status: 'manual_text_note', detected_type: 'text_note', confidence: null },
        extraction: { status: 'not_applicable' },
      }
  }
}

export function getCaptureEventTitle(type: CaptureType, intent: CaptureIntent = 'manual') {
  if (intent === 'auto_image') {
    return 'Evidence captured'
  }

  switch (type) {
    case 'vin_plate':
      return 'VIN plate captured'
    case 'info_plate':
      return 'Info plate captured'
    case 'video':
    case 'evidence_video':
      return 'Video evidence captured'
    case 'voice_note':
      return 'Voice note captured'
    case 'text_note':
      return 'Text note captured'
    case 'document':
      return 'Document captured'
    case 'photo':
      return 'Photo captured'
  }
}

export type CaptureProcessingStatus = 'pending' | 'processing' | 'extracted' | 'needs_review' | 'failed' | 'blocked_by_limit' | 'ready_for_review'

export function getCaptureProcessingStatus(capture: CaptureItem): CaptureProcessingStatus {
  const extractedData = isRecord(capture.extracted_data) ? capture.extracted_data : null
  const processing = extractedData && isRecord(extractedData.processing) ? extractedData.processing : null
  const processingStatus = typeof processing?.status === 'string' ? processing.status : null
  const extraction = extractedData && isRecord(extractedData.extraction) ? extractedData.extraction : null
  const extractionStatus = typeof extraction?.status === 'string' ? extraction.status : null

  if (processingStatus === 'blocked_by_limit') return 'blocked_by_limit'
  if (capture.ai_status === 'processing' || processingStatus === 'processing') return 'processing'
  if (capture.ai_status === 'failed' || processingStatus === 'failed' || extractionStatus === 'failed') return 'failed'
  if (capture.ai_status === 'needs_review' || extractionStatus === 'needs_review') return 'needs_review'
  if (capture.ai_status === 'extracted' || extractionStatus === 'extracted' || extractionStatus === 'not_applicable') return 'extracted'
  if (capture.ai_status === 'classified') return 'ready_for_review'
  return 'pending'
}

export function getCaptureProcessingLabel(status: CaptureProcessingStatus) {
  switch (status) {
    case 'processing':
      return 'Processing'
    case 'extracted':
      return 'Ready for review'
    case 'needs_review':
      return 'Needs review'
    case 'failed':
      return 'Failed / Retry processing'
    case 'blocked_by_limit':
      return 'AI limit reached'
    case 'ready_for_review':
      return 'Preparing report details'
    case 'pending':
    default:
      return 'Pending AI processing'
  }
}
