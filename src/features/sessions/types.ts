import type { Database } from '@/lib/supabase/database.types'

export type DocumentationSession = Database['public']['Tables']['documentation_sessions']['Row']

export type SessionStatus = 'draft' | 'capturing' | 'review' | 'finalized' | 'archived'

export const SESSION_STATUSES: Array<{ value: SessionStatus; label: string }> = [
  { value: 'draft', label: 'Capturing' },
  { value: 'capturing', label: 'Capturing' },
  { value: 'review', label: 'Review Required' },
  { value: 'finalized', label: 'Ready' },
  { value: 'archived', label: 'Archived' },
]

export const DEFAULT_SESSION_TYPE = 'General Documentation'

export const SESSION_TYPES = [
  { value: 'Inspection', label: 'Inspection' },
  { value: 'field_service_report', label: 'Service Report' },
  { value: 'General Documentation', label: 'General Documentation' },
] as const

export type SessionType = (typeof SESSION_TYPES)[number]['value']

export function getSessionTypeLabel(sessionType: string) {
  return SESSION_TYPES.find((type) => type.value === sessionType)?.label ?? sessionType
}

export function getSessionStatusLabel(status: string) {
  return SESSION_STATUSES.find((sessionStatus) => sessionStatus.value === status)?.label ?? status
}
