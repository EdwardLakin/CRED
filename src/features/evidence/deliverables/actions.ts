'use server'

import { revalidatePath } from 'next/cache'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { createDeliverableRecord } from './data'
import { parseDeliverableSourceSelection, parseDeliverableType } from './validation'

type QueryBuilder = { select: (columns: string) => QueryBuilder; eq: (column: string, value: string) => QueryBuilder; is: (column: string, value: null) => QueryBuilder; single: () => Promise<{ data: unknown; error: unknown }> }
type SupabaseLike = { from: (table: string) => QueryBuilder }

async function assertSession(supabase: SupabaseLike, sessionId: string, organizationId: string) {
  const { data, error } = await supabase.from('documentation_sessions').select('id').eq('id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).single()
  if (error || !data) throw new Error('Session not found')
}

export async function generateEvidenceDeliverable(sessionId: string, formData: FormData) {
  const type = parseDeliverableType(formData.get('deliverable_type'))
  const sourceSelection = parseDeliverableSourceSelection(formData)
  const { supabase: rawSupabase, profile } = await requireSessionWorkspace()
  const supabase = rawSupabase as unknown as SupabaseLike
  await assertSession(supabase, sessionId, profile.organization_id)
  await createDeliverableRecord(rawSupabase as never, sessionId, profile.organization_id, profile.id, type, sourceSelection)
  revalidatePath(`/dashboard/sessions/${sessionId}/deliverables`)
}
