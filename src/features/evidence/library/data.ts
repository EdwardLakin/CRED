import { notFound } from 'next/navigation'

import { requireSessionWorkspace } from '@/features/sessions/data'
import type { Database } from '@/lib/supabase/database.types'

type Tables = Database['public']['Tables']
export type EvidenceLibraryItem = Tables['capture_items']['Row']
export type EvidenceLibrarySession = Tables['documentation_sessions']['Row']
export type EvidenceLibraryBatch = Tables['evidence_import_batches']['Row']

type QueryBuilder = {
  select: (columns: string, options?: { count?: 'exact'; head?: boolean }) => QueryBuilder
  eq: (column: string, value: string) => QueryBuilder
  is: (column: string, value: null) => QueryBuilder
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder
  single: () => Promise<{ data: unknown; error: unknown }>
  then: Promise<{ data: unknown; error: unknown; count?: number | null }>['then']
}

type EvidenceSupabaseLike = {
  from: (table: string) => QueryBuilder
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl?: string } | null }>
    }
  }
}

export type EvidenceWorkspace = {
  supabase: unknown
  profile: { organization_id: string; timezone?: string | null }
}

const CAPTURE_BUCKET = 'documentation-captures'

export async function getEvidenceLibraryData(sessionId: string, workspace?: EvidenceWorkspace) {
  const rawWorkspace = workspace ?? (await requireSessionWorkspace())
  const supabase = rawWorkspace.supabase as EvidenceSupabaseLike
  const { profile } = rawWorkspace
  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .single()

  if (sessionError || !session) notFound()

  const [{ data: captures }, { data: importBatches }] = await Promise.all([
    supabase
      .from('capture_items')
      .select('*')
      .eq('documentation_session_id', sessionId)
      .eq('organization_id', profile.organization_id)
      .is('deleted_at', null)
      .order('captured_at', { ascending: false }),
    supabase
      .from('evidence_import_batches')
      .select('*')
      .eq('documentation_session_id', sessionId)
      .eq('organization_id', profile.organization_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  const evidenceItems = (captures ?? []) as EvidenceLibraryItem[]
  const signedUrls = await buildEvidenceSignedUrls(supabase, evidenceItems)

  return {
    session: session as EvidenceLibrarySession,
    evidenceItems,
    importBatches: (importBatches ?? []) as EvidenceLibraryBatch[],
    signedUrls,
    timeZone: profile.timezone ?? null,
    profile,
  }
}

export async function getEvidenceDetailData(sessionId: string, captureId: string, workspace?: EvidenceWorkspace) {
  const libraryData = await getEvidenceLibraryData(sessionId, workspace)
  const evidenceItem = libraryData.evidenceItems.find((item) => item.id === captureId)
  if (!evidenceItem) notFound()

  return {
    ...libraryData,
    evidenceItem,
    relatedImportBatch: evidenceItem.import_batch_id
      ? libraryData.importBatches.find((batch) => batch.id === evidenceItem.import_batch_id) ?? null
      : null,
  }
}

async function buildEvidenceSignedUrls(supabase: EvidenceSupabaseLike, evidenceItems: EvidenceLibraryItem[]) {
  const signedUrls: Record<string, string> = {}

  await Promise.all(
    evidenceItems.map(async (item) => {
      const path = item.thumbnail_path || item.storage_path
      if (!path) return
      const { data } = await supabase.storage.from(CAPTURE_BUCKET).createSignedUrl(path, 60 * 10)
      if (data?.signedUrl) signedUrls[item.id] = data.signedUrl
    }),
  )

  return signedUrls
}
