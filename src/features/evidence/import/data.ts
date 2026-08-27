import { notFound } from 'next/navigation'

import { requireWorkspaceFeatureOrRedirect } from '@/features/billing/feature-gates'
import { requireSessionWorkspace } from '@/features/sessions/data'
import type { Database } from '@/lib/supabase/database.types'

type Tables = Database['public']['Tables']
export type EvidenceImportBatch = Tables['evidence_import_batches']['Row']
export type EvidenceImportCaptureItem = Tables['capture_items']['Row']
export type EvidenceImportSession = Tables['documentation_sessions']['Row']

export async function getEvidenceImportPageData(sessionId: string) {
  const { supabase, profile } = await requireSessionWorkspace()
  requireWorkspaceFeatureOrRedirect(profile, 'bulk_import', sessionId)
  const { data: session, error } = await supabase.from('documentation_sessions').select('*').eq('id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).single()
  if (error || !session) notFound()
  const { data: batches } = await supabase.from('evidence_import_batches').select('*').eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).order('created_at', { ascending: false })
  return { session: session as EvidenceImportSession, batches: (batches ?? []) as EvidenceImportBatch[], timeZone: profile.timezone ?? null }
}

export async function getEvidenceImportBatchDetail(sessionId: string, batchId: string) {
  const { supabase, profile } = await requireSessionWorkspace()
  requireWorkspaceFeatureOrRedirect(profile, 'bulk_import', sessionId)
  const { data: session, error: sessionError } = await supabase.from('documentation_sessions').select('*').eq('id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).single()
  if (sessionError || !session) notFound()
  const { data: batch, error: batchError } = await supabase.from('evidence_import_batches').select('*').eq('id', batchId).eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).single()
  if (batchError || !batch) notFound()
  const { data: captureItems } = await supabase.from('capture_items').select('*').eq('import_batch_id', batchId).eq('documentation_session_id', sessionId).eq('organization_id', profile.organization_id).is('deleted_at', null).order('created_at', { ascending: false })
  return { session: session as EvidenceImportSession, batch: batch as EvidenceImportBatch, captureItems: (captureItems ?? []) as EvidenceImportCaptureItem[], timeZone: profile.timezone ?? null }
}
