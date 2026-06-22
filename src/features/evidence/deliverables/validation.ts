import type { Json } from '@/lib/supabase/database.types'

export const DELIVERABLE_TYPES = ['chronology', 'evidence_index', 'observation_summary'] as const
export type DeliverableType = (typeof DELIVERABLE_TYPES)[number]

export function parseDeliverableType(value: FormDataEntryValue | string | null): DeliverableType {
  if (typeof value === 'string' && DELIVERABLE_TYPES.includes(value as DeliverableType)) return value as DeliverableType
  throw new Error('Unsupported deliverable type')
}

export function assertWorkspaceScope(row: { documentation_session_id: string; organization_id: string }, sessionId: string, organizationId: string) {
  if (row.documentation_session_id !== sessionId || row.organization_id !== organizationId) throw new Error('Deliverables must stay within the same session and organization')
}

export function deliverableProvenance(type: DeliverableType, sourceIds: Record<string, string[]>): Json {
  return { generated_from: 'evidence_workspace', deliverable_type: type, source_ids: sourceIds, deterministic: true }
}
