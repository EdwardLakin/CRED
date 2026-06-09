import type { Database, Json } from '@/lib/supabase/database.types'

export type CaptureItem = Database['public']['Tables']['capture_items']['Row']
export type CaptureType = 'photo' | 'document' | 'vin_plate' | 'info_plate' | 'voice_note'

export const CAPTURE_TYPES: Array<{ value: CaptureType; label: string; helper: string }> = [
  { value: 'photo', label: 'Photo', helper: 'Field photo or supporting image' },
  { value: 'document', label: 'Document', helper: 'PDF, document scan, or image' },
  { value: 'vin_plate', label: 'VIN Plate', helper: 'Vehicle VIN label or plate' },
  { value: 'info_plate', label: 'Info/Data Plate', helper: 'Manufacturer, compliance, or data tag' },
  { value: 'voice_note', label: 'Voice Note', helper: 'Audio note for later transcription' },
]

export const CAPTURE_TYPE_LABELS: Record<CaptureType, string> = {
  photo: 'Photo',
  document: 'Document',
  vin_plate: 'VIN Plate',
  info_plate: 'Info/Data Plate',
  voice_note: 'Voice Note',
}

export function isCaptureType(value: string): value is CaptureType {
  return CAPTURE_TYPES.some((captureType) => captureType.value === value)
}

export function getInitialExtractedData(type: CaptureType): Json {
  switch (type) {
    case 'vin_plate':
      return { kind: 'vin_plate', vin: null, confidence: null, status: 'pending_ocr' }
    case 'info_plate':
      return { kind: 'info_plate', fields: {}, status: 'pending_ocr' }
    case 'document':
      return { kind: 'document', status: 'pending_ocr' }
    case 'photo':
      return { kind: 'photo', status: 'captured' }
    case 'voice_note':
      return { kind: 'voice_note', status: 'pending_transcription' }
  }
}

export function getCaptureEventTitle(type: CaptureType) {
  switch (type) {
    case 'vin_plate':
      return 'VIN plate captured'
    case 'info_plate':
      return 'Info plate captured'
    case 'voice_note':
      return 'Voice note captured'
    case 'document':
      return 'Document captured'
    case 'photo':
      return 'Photo captured'
  }
}
