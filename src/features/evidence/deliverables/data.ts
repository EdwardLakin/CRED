import { notFound } from 'next/navigation'

import { requireSessionWorkspace } from '@/features/sessions/data'
import type { Database, Json } from '@/lib/supabase/database.types'
import type { DeliverableSourceSelection, DeliverableType } from './validation'
import { applyDeliverableSourceSelection, generateDeliverable, type DeliverableAssemblyBatch, type DeliverableSourceData } from './service'

type Tables = Database['public']['Tables']
export type EvidenceDeliverable = Tables['evidence_deliverables']['Row']
type QueryBuilder = { select: (columns: string, options?: { count?: 'exact'; head?: boolean }) => QueryBuilder; eq: (column: string, value: string) => QueryBuilder; is: (column: string, value: null) => QueryBuilder; order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => QueryBuilder; single: () => Promise<{ data: unknown; error: unknown }>; insert: (values: Record<string, unknown>) => { select: (columns: string) => { single: () => Promise<{ data: unknown; error: unknown }> } }; update: (values: Record<string, unknown>) => QueryBuilder; then: Promise<{ data: unknown; error: unknown; count?: number | null }>['then'] }
export type DeliverableImportBatch = DeliverableAssemblyBatch
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

  return { session: session as Tables['documentation_sessions']['Row'], deliverables: (deliverables ?? []) as EvidenceDeliverable[], availableTypes: deliverableTypeCards, previewSources: applyDeliverableSourceSelection(sourceData), assemblySources: sourceData, sourceCounts: getDeliverableSourceCounts(applyDeliverableSourceSelection(sourceData)), timeZone: profile.timezone ?? null }
}

export async function loadDeliverableSourceData(supabase: SupabaseLike, sessionId: string, organizationId: string): Promise<DeliverableSourceData> {
  const [{ data: evidenceItems }, { data: importBatches }, { data: timelineEvents }, { data: entities }, { data: assertions }, { data: relationships }] = await Promise.all([
    supabase.from('capture_items').select('*').eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).order('captured_at', { ascending: false }),
    supabase.from('evidence_import_batches').select('id, documentation_session_id, organization_id, source_kind, status, file_count, deleted_at').eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('timeline_events').select('*').eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).order('event_start_at', { ascending: true, nullsFirst: false }).order('event_time', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('evidence_entities').select('*').eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).order('display_name', { ascending: true }),
    supabase.from('evidence_assertions').select('*').eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).order('created_at', { ascending: true }),
    supabase.from('evidence_relationships').select('*').eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).order('created_at', { ascending: true }),
  ])
  return { sessionId, organizationId, evidenceItems: (evidenceItems ?? []) as DeliverableSourceData['evidenceItems'], importBatches: (importBatches ?? []) as DeliverableImportBatch[], timelineEvents: (timelineEvents ?? []) as DeliverableSourceData['timelineEvents'], entities: (entities ?? []) as DeliverableSourceData['entities'], assertions: (assertions ?? []) as DeliverableSourceData['assertions'], relationships: (relationships ?? []) as DeliverableSourceData['relationships'] }
}

export async function createDeliverableRecord(supabase: SupabaseLike, sessionId: string, organizationId: string, createdBy: string | null | undefined, type: DeliverableType, sourceSelection?: DeliverableSourceSelection) {
  const sourceData = await loadDeliverableSourceData(supabase, sessionId, organizationId)
  const generated = generateDeliverable(type, sourceData, sourceSelection)
  const now = new Date().toISOString()
  const { data, error } = await supabase.from('evidence_deliverables').insert({ documentation_session_id: sessionId, organization_id: organizationId, deliverable_type: type, title: generated.title, status: 'generated', summary: generated.summary, content: generated.content, source_ids: generated.source_ids, provenance: generated.provenance, generated_by: createdBy ?? null, generated_at: now, created_at: now, updated_at: now }).select('*').single()
  if (error || !data) throw new Error('Unable to generate deliverable')
  return data as EvidenceDeliverable
}

export function getDeliverableSourceCounts(sourceData: DeliverableSourceData) {
  return { evidenceItems: sourceData.evidenceItems.length, importBatches: new Set(sourceData.evidenceItems.map((item) => item.import_batch_id).filter(Boolean)).size, timelineEvents: sourceData.timelineEvents.length, entities: sourceData.entities.length, factualObservations: sourceData.assertions.length, relationships: sourceData.relationships.length }
}

export function summarizeDeliverableContent(content: Json) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return 'Preview unavailable'
  const record = content as Record<string, unknown>
  if (Array.isArray(record.events)) return `${record.events.length} chronology rows`
  if (Array.isArray(record.items)) return `${record.items.length} evidence index rows`
  if (Array.isArray(record.observations)) return `${record.observations.length} observation rows`
  return 'Generated preview'
}

export type DeliverableDetailData = {
  session: Tables['documentation_sessions']['Row']
  deliverable: EvidenceDeliverable
  timeZone: string | null
}

export async function validateDeliverableAccess(sessionId: string, deliverableId: string, workspace?: DeliverablesWorkspace): Promise<DeliverableDetailData> {
  const rawWorkspace = workspace ?? (await requireSessionWorkspace())
  const supabase = rawWorkspace.supabase as SupabaseLike
  const { profile } = rawWorkspace
  const { data: session, error: sessionError } = await supabase.from('documentation_sessions').select('*').eq('id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).single()
  if (sessionError || !session) notFound()

  const { data: deliverable, error: deliverableError } = await supabase.from('evidence_deliverables').select('*').eq('id', deliverableId).eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).single()
  if (deliverableError || !deliverable) notFound()

  return { session: session as Tables['documentation_sessions']['Row'], deliverable: deliverable as EvidenceDeliverable, timeZone: profile.timezone ?? null }
}

export async function getDeliverableDetail(sessionId: string, deliverableId: string, workspace?: DeliverablesWorkspace) {
  return validateDeliverableAccess(sessionId, deliverableId, workspace)
}

export function summarizeDeliverableProvenance(provenance: Json, sourceIds: Json) {
  const ids = sourceIds && typeof sourceIds === 'object' && !Array.isArray(sourceIds) ? sourceIds as Record<string, unknown> : {}
  const counts = Object.entries(ids).filter(([, value]) => Array.isArray(value)).map(([key, value]) => `${(value as unknown[]).length} ${key.replace(/_/g, ' ')}`)
  const generatedFrom = provenance && typeof provenance === 'object' && !Array.isArray(provenance) ? String((provenance as Record<string, unknown>).generated_from ?? 'evidence workspace') : 'evidence workspace'
  return `${generatedFrom.replace(/_/g, ' ')} snapshot${counts.length ? ` · ${counts.join(' · ')}` : ''}`
}
