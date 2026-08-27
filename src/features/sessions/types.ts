import type { Database } from '@/lib/supabase/database.types'

import { DEFAULT_REPORT_TYPE, REPORT_TYPES, normalizeReportType, type ReportType } from './report-types'

export type DocumentationSession = Database['public']['Tables']['documentation_sessions']['Row']

export type SessionStatus = 'draft' | 'capturing' | 'review' | 'finalized' | 'archived'

export const SESSION_STATUSES: Array<{ value: SessionStatus; label: string }> = [
  { value: 'draft', label: 'Capturing' },
  { value: 'capturing', label: 'Capturing' },
  { value: 'review', label: 'Review Required' },
  { value: 'finalized', label: 'Ready' },
  { value: 'archived', label: 'Archived' },
]

export const DEFAULT_SESSION_TYPE = DEFAULT_REPORT_TYPE
export const SESSION_TYPES = REPORT_TYPES
export type SessionType = ReportType

export function getSessionTypeLabel(sessionType: string) {
  const normalized = normalizeReportType(sessionType)
  return REPORT_TYPES.find((reportType) => reportType.value === normalized)?.label ?? normalized
}

export function getSessionStatusLabel(status: string) {
  return SESSION_STATUSES.find((sessionStatus) => sessionStatus.value === status)?.label ?? status
}
