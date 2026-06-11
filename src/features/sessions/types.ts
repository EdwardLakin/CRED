import type { Database } from '@/lib/supabase/database.types'

export type DocumentationSession = Database['public']['Tables']['documentation_sessions']['Row']

export type SessionStatus = 'draft' | 'capturing' | 'review' | 'finalized' | 'archived'

export const SESSION_STATUSES: Array<{ value: SessionStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'capturing', label: 'Capturing' },
  { value: 'review', label: 'Review' },
  { value: 'finalized', label: 'Finalized' },
  { value: 'archived', label: 'Archived' },
]

export const SESSION_TYPES = [
  { value: 'Inspection', label: 'Inspection' },
  { value: 'Diagnostic', label: 'Diagnostic' },
  { value: 'Condition Report', label: 'Condition Report' },
  { value: 'Investigation', label: 'Investigation' },
  { value: 'General Documentation', label: 'General Documentation' },
  { value: 'field_service_report', label: 'New Field Service Report' },
] as const

export type SessionType = (typeof SESSION_TYPES)[number]['value']

export function getSessionTypeLabel(sessionType: string) {
  return SESSION_TYPES.find((type) => type.value === sessionType)?.label ?? sessionType
}

export function getSessionStatusLabel(status: string) {
  return SESSION_STATUSES.find((sessionStatus) => sessionStatus.value === status)?.label ?? status
}
