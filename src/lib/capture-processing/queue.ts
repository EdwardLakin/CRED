import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/lib/supabase/database.types'

export const CAPTURE_JOB_TYPES = [
  'classify_capture',
  'extract_capture',
  'generate_capture_note',
  'group_evidence',
  'normalize_report_fields',
  'generate_findings',
  'update_report_readiness',
] as const

export type CaptureProcessingJobType = (typeof CAPTURE_JOB_TYPES)[number]

const CAPTURE_UPLOAD_JOBS: CaptureProcessingJobType[] = [
  'classify_capture',
  'extract_capture',
  'generate_capture_note',
]

const SESSION_JOBS: CaptureProcessingJobType[] = [
  'group_evidence',
  'normalize_report_fields',
  'generate_findings',
  'update_report_readiness',
]

type Client = SupabaseClient<Database>

export async function queueCaptureAnalysisJobs(params: {
  supabase: Client
  organizationId: string
  sessionId: string
  captureItemId: string
  metadata?: Json
}) {
  const rows = CAPTURE_UPLOAD_JOBS.map((jobType, index) => ({
    organization_id: params.organizationId,
    documentation_session_id: params.sessionId,
    capture_item_id: params.captureItemId,
    job_type: jobType,
    priority: 50 + index,
    status: 'queued',
    metadata: params.metadata ?? {},
  }))

  const client = params.supabase as SupabaseClient
  await client.from('capture_processing_jobs').upsert(rows, {
    onConflict: 'organization_id,documentation_session_id,capture_item_id,job_type',
    ignoreDuplicates: true,
  })

  await client
    .from('capture_items')
    .update({ processing_status: 'queued', ai_status: 'queued' })
    .eq('id', params.captureItemId)
    .eq('organization_id', params.organizationId)
    .eq('documentation_session_id', params.sessionId)
}

export async function queueSessionProcessingJobs(params: {
  supabase: Client
  organizationId: string
  sessionId: string
  metadata?: Json
}) {
  const rows = SESSION_JOBS.map((jobType, index) => ({
    organization_id: params.organizationId,
    documentation_session_id: params.sessionId,
    capture_item_id: null,
    job_type: jobType,
    priority: 100 + index,
    status: 'queued',
    metadata: params.metadata ?? {},
  }))

  await (params.supabase as SupabaseClient).from('capture_processing_jobs').upsert(rows, {
    onConflict: 'organization_id,documentation_session_id,job_type',
    ignoreDuplicates: true,
  })
}
