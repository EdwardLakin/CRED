import type { Json } from '@/lib/supabase/database.types'

import type { DocumentationSession } from './types'
import { getCustomerFacingReportTitle, getDisplayReportTitle } from '@/features/reports/report-title'
import { getSessionTypeLabel } from './types'
import { formatDateTime } from './utils'

function isRecord(value: Json | null | undefined): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getStringFromJson(value: Json | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export function getSessionReportField(session: DocumentationSession, field: string) {
  const details = isRecord(session.field_service_details) ? session.field_service_details : null
  const suggested = isRecord(session.suggested_details) ? session.suggested_details : null
  return getStringFromJson(details?.[field]) ?? getStringFromJson(suggested?.[field])
}

export type SessionCardTitleDraft = { title?: string | null; header_fields?: unknown } | null | undefined

export function getSessionPrimaryTitle(session: DocumentationSession, currentReport?: SessionCardTitleDraft) {
  if (currentReport) return getDisplayReportTitle(currentReport, session)
  return (
    getSessionReportField(session, 'report_title') ||
    getCustomerFacingReportTitle(session.title) ||
    session.customer_name?.trim() ||
    getSessionReportField(session, 'customer_client') ||
    getSessionReportField(session, 'subject') ||
    'Untitled session'
  )
}

export function getSessionSecondarySummary(session: DocumentationSession, evidenceCount?: number, timeZone?: string | null) {
  const parts = [
    session.display_id,
    getSessionTypeLabel(session.session_type),
    `Created ${formatDateTime(session.created_at, timeZone)}`,
    `Updated ${formatDateTime(session.updated_at ?? session.created_at, timeZone)}`,
  ].filter(Boolean)

  if (evidenceCount !== undefined) {
    parts.push(`${evidenceCount} item${evidenceCount === 1 ? '' : 's'}`)
  }

  return parts.join(' · ')
}
