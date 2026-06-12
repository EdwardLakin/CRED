import type { Database, Json } from '@/lib/supabase/database.types'

export type CaptureItem = Database['public']['Tables']['capture_items']['Row']
export type CaptureType = 'photo' | 'document' | 'vin_plate' | 'info_plate' | 'voice_note' | 'video' | 'evidence_video'
export type CaptureIntent = 'auto_image' | 'auto_evidence' | 'manual'

export const CAPTURE_TYPES: Array<{ value: CaptureType; label: string; helper: string }> = [
  { value: 'photo', label: 'Field Photo', helper: 'General image or damage photo' },
  { value: 'document', label: 'Document', helper: 'PDF, document scan, or image' },
  { value: 'vin_plate', label: 'VIN Plate', helper: 'Vehicle VIN label or plate' },
  { value: 'info_plate', label: 'Info/Data Plate', helper: 'Manufacturer, rating, or data tag' },
  { value: 'voice_note', label: 'Voice Note', helper: 'Audio note for later transcription' },
  { value: 'video', label: 'Video', helper: 'Short evidence video with note' },
]

export const CAPTURE_TYPE_LABELS: Record<CaptureType, string> = {
  photo: 'Image',
  document: 'Document',
  vin_plate: 'VIN Plate',
  info_plate: 'Info/Data Plate',
  voice_note: 'Voice Note',
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
    case 'document':
      return 'Document captured'
    case 'photo':
      return 'Photo captured'
  }
}
