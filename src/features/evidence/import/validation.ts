import { EVIDENCE_REVIEW_STATUSES, EVENT_DATE_PRECISIONS } from '@/features/evidence/constants'
import { normalizeOptionalIsoDateTime } from '@/features/evidence/library/validation'

export const BULK_EVIDENCE_SOURCE_KIND = 'bulk_upload'
export const BULK_EVIDENCE_BUCKET = 'documentation-captures'
export const BULK_EVIDENCE_MAX_FILE_BYTES = 100 * 1024 * 1024

export const BULK_EVIDENCE_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/aac', 'audio/x-m4a'] as const

export type BulkEvidenceValidationResult = { ok: true } | { ok: false; error: string }

export function sanitizeEvidenceFilename(name: string) { const fallback = 'source-file'; const cleaned = name.replace(/[/\\]/g, '-').replace(/[^\w. -]+/g, '').replace(/\s+/g, ' ').trim(); return (cleaned || fallback).slice(0, 160) }
export function validateBulkEvidenceFile(file: { name: string; size: number; type: string }): BulkEvidenceValidationResult { const mimeType = file.type.trim().toLowerCase(); if (!BULK_EVIDENCE_ALLOWED_MIME_TYPES.includes(mimeType as (typeof BULK_EVIDENCE_ALLOWED_MIME_TYPES)[number])) return { ok: false, error: 'Unsupported file type.' }; if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: 'File is empty.' }; if (file.size > BULK_EVIDENCE_MAX_FILE_BYTES) return { ok: false, error: 'File is larger than the current capture limit.' }; return { ok: true } }
export function getBulkEvidenceMediaKind(mimeType: string): 'image' | 'audio' | 'document' { if (mimeType.startsWith('audio/')) return 'audio'; if (mimeType === 'application/pdf') return 'document'; return 'image' }
export function getBulkEvidenceCaptureType(mimeType: string): 'photo' | 'document' | 'voice_note' { if (mimeType.startsWith('audio/')) return 'voice_note'; if (mimeType === 'application/pdf') return 'document'; return 'photo' }

export function parseBatchEvidenceReviewStatus(value: FormDataEntryValue | null) { return typeof value === 'string' && EVIDENCE_REVIEW_STATUSES.includes(value as (typeof EVIDENCE_REVIEW_STATUSES)[number]) ? value : null }
export function parseBatchOutputInclusion(value: FormDataEntryValue | null) { if (value === 'on' || value === 'true' || value === 'include') return true; if (value === 'false' || value === 'exclude') return false; return null }
export function parseBatchEventDate(value: FormDataEntryValue | null) { return normalizeOptionalIsoDateTime(value) }
export function parseBatchEventDatePrecision(value: FormDataEntryValue | null) { if (!value || value === '') return null; return typeof value === 'string' && EVENT_DATE_PRECISIONS.includes(value as (typeof EVENT_DATE_PRECISIONS)[number]) ? value : null }
export function parseSelectedCaptureItemIds(formData: FormData) { return formData.getAll('capture_item_ids').filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim()) }
