export const BULK_EVIDENCE_SOURCE_KIND = 'bulk_upload'
export const BULK_EVIDENCE_BUCKET = 'documentation-captures'
export const BULK_EVIDENCE_MAX_FILE_BYTES = 100 * 1024 * 1024

export const BULK_EVIDENCE_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  'audio/aac',
  'audio/x-m4a',
] as const

export type BulkEvidenceValidationResult = { ok: true } | { ok: false; error: string }

export function sanitizeEvidenceFilename(name: string) {
  const fallback = 'evidence-file'
  const cleaned = name.replace(/[/\\]/g, '-').replace(/[^\w. -]+/g, '').replace(/\s+/g, ' ').trim()
  return (cleaned || fallback).slice(0, 160)
}

export function validateBulkEvidenceFile(file: { name: string; size: number; type: string }): BulkEvidenceValidationResult {
  const mimeType = file.type.trim().toLowerCase()
  if (!BULK_EVIDENCE_ALLOWED_MIME_TYPES.includes(mimeType as (typeof BULK_EVIDENCE_ALLOWED_MIME_TYPES)[number])) {
    return { ok: false, error: 'Unsupported file type.' }
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: 'File is empty.' }
  if (file.size > BULK_EVIDENCE_MAX_FILE_BYTES) return { ok: false, error: 'File is larger than the current capture limit.' }
  return { ok: true }
}

export function getBulkEvidenceMediaKind(mimeType: string): 'image' | 'audio' | 'document' {
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType === 'application/pdf') return 'document'
  return 'image'
}

export function getBulkEvidenceCaptureType(mimeType: string): 'photo' | 'document' | 'voice_note' {
  if (mimeType.startsWith('audio/')) return 'voice_note'
  if (mimeType === 'application/pdf') return 'document'
  return 'photo'
}
