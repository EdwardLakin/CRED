import { notFound } from 'next/navigation'

import { requireSessionWorkspace } from '@/features/sessions/data'
import type { Database, Json } from '@/lib/supabase/database.types'
import type { DeliverableType } from './validation'
import { generateDeliverable, type DeliverableSourceData } from './service'

type Tables = Database['public']['Tables']
export type EvidenceDeliverable = Tables['evidence_deliverables']['Row']
type QueryBuilder = { select: (columns: string, options?: { count?: 'exact'; head?: boolean }) => QueryBuilder; eq: (column: string, value: string) => QueryBuilder; is: (column: string, value: null) => QueryBuilder; order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => QueryBuilder; single: () => Promise<{ data: unknown; error: unknown }>; insert: (values: Record<string, unknown>) => { select: (columns: string) => { single: () => Promise<{ data: unknown; error: unknown }> } }; update: (values: Record<string, unknown>) => QueryBuilder; then: Promise<{ data: unknown; error: unknown; count?: number | null }>['then'] }
type SupabaseLike = { from: (table: string) => QueryBuilder }
export type DeliverablesWorkspace = { supabase: unknown; profile: { id?: string | null; organization_id: string; timezone?: string | null } }

export const deliverableTypeCards = [
  { type: 'chronology', title: 'Chronology', description: 'Timeline events with linked evidence counts, entities, and factual observations.' },
  { type: 'evidence_index', title: 'Evidence Index', description: 'Evidence item identifiers, source dates, review status, and include-in-outputs state.' },
  { type: 'observation_summary', title: 'Observation Summary', description: 'Factual observations with supporting, contradicting, entity, and event links.' },
] as const

export async function getDeliverablesData(sessionId: string, workspace?: DeliverablesWorkspace) {
  const rawWorkspace = workspace ?? (await requireSessionWorkspace())
  const supabase = rawWorkspace.supabase as SupabaseLike
  const { profile } = rawWorkspace
  const { data: session, error } = await supabase.from('documentation_sessions').select('*').eq('id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).single()
  if (error || !session) notFound()

  const [{ data: deliverables }, sourceData] = await Promise.all([
    supabase.from('evidence_deliverables').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).order('generated_at', { ascending: false }),
    loadDeliverableSourceData(supabase, sessionId, profile.organization_id),
  ])

  return { session: session as Tables['documentation_sessions']['Row'], deliverables: (deliverables ?? []) as EvidenceDeliverable[], availableTypes: deliverableTypeCards, previewSources: sourceData, timeZone: profile.timezone ?? null }
}

export async function loadDeliverableSourceData(supabase: SupabaseLike, sessionId: string, organizationId: string): Promise<DeliverableSourceData> {
  const [{ data: evidenceItems }, { data: timelineEvents }, { data: entities }, { data: assertions }, { data: relationships }] = await Promise.all([
    supabase.from('capture_items').select('*').eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).order('captured_at', { ascending: false }),
    supabase.from('timeline_events').select('*').eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).order('event_start_at', { ascending: true, nullsFirst: false }).order('event_time', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('evidence_entities').select('*').eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).order('display_name', { ascending: true }),
    supabase.from('evidence_assertions').select('*').eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).order('created_at', { ascending: true }),
    supabase.from('evidence_relationships').select('*').eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).order('created_at', { ascending: true }),
  ])
  return { sessionId, organizationId, evidenceItems: (evidenceItems ?? []) as DeliverableSourceData['evidenceItems'], timelineEvents: (timelineEvents ?? []) as DeliverableSourceData['timelineEvents'], entities: (entities ?? []) as DeliverableSourceData['entities'], assertions: (assertions ?? []) as DeliverableSourceData['assertions'], relationships: (relationships ?? []) as DeliverableSourceData['relationships'] }
}

export async function createDeliverableRecord(supabase: SupabaseLike, sessionId: string, organizationId: string, createdBy: string | null | undefined, type: DeliverableType) {
  const sourceData = await loadDeliverableSourceData(supabase, sessionId, organizationId)
  const generated = generateDeliverable(type, sourceData)
  const now = new Date().toISOString()
  const { data, error } = await supabase.from('evidence_deliverables').insert({ documentation_session_id: sessionId, organization_id: organizationId, deliverable_type: type, title: generated.title, status: 'generated', summary: generated.summary, content: generated.content, source_ids: generated.source_ids, provenance: generated.provenance, generated_by: createdBy ?? null, generated_at: now, created_at: now, updated_at: now }).select('*').single()
  if (error || !data) throw new Error('Unable to generate deliverable')
  return data as EvidenceDeliverable
}

export function summarizeDeliverableContent(content: Json) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return 'Preview unavailable'
  const record = content as Record<string, unknown>
  if (Array.isArray(record.events)) return `${record.events.length} chronology rows`
  if (Array.isArray(record.items)) return `${record.items.length} evidence index rows`
  if (Array.isArray(record.observations)) return `${record.observations.length} observation rows`
  return 'Generated preview'
}
