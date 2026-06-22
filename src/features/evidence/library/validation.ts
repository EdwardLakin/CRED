import { EVIDENCE_REVIEW_STATUSES, EVENT_DATE_PRECISIONS } from '@/features/evidence/constants'
import type { Json } from '@/lib/supabase/database.types'

export function parseEvidenceReviewStatus(value: FormDataEntryValue | null) {
  return typeof value === 'string' && EVIDENCE_REVIEW_STATUSES.includes(value as (typeof EVIDENCE_REVIEW_STATUSES)[number])
    ? value
    : null
}

export function parseEventDatePrecision(value: FormDataEntryValue | null) {
  if (!value || value === '') return null
  return typeof value === 'string' && EVENT_DATE_PRECISIONS.includes(value as (typeof EVENT_DATE_PRECISIONS)[number]) ? value : null
}

export function normalizeOptionalIsoDateTime(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value.trim()) return null
  const date = value.trim().length === 10 ? new Date(`${value.trim()}T00:00:00.000Z`) : new Date(value.trim())
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date')
  return date.toISOString()
}

export function parseMetadataJson(value: FormDataEntryValue | null): Json {
  if (typeof value !== 'string' || !value.trim()) return {}
  const parsed = JSON.parse(value)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Source metadata must be a JSON object')
  return parsed as Json
}
