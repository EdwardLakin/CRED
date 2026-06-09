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
  'Inspection',
  'Diagnostic',
  'Condition Report',
  'Investigation',
  'General Documentation',
] as const

export function getSessionStatusLabel(status: string) {
  return SESSION_STATUSES.find((sessionStatus) => sessionStatus.value === status)?.label ?? status
}
