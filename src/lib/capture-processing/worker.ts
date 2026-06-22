import { requireUsageAllowance, recordUsageEvent, type UsageEventType } from '@/features/usage'
import { analyzeCaptureImage } from '@/lib/ai/capture-analysis-service'
import { queueSessionProcessingJobs } from '@/lib/capture-processing/queue'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { normalizeBillingPlan } from '@/lib/stripe'

const BUCKET = 'documentation-captures'
const LOCK_STALE_MINUTES = 10
const SIGNED_URL_SECONDS = 60 * 5

type Job = {
  id: string
  organization_id: string
  documentation_session_id: string
  capture_item_id: string | null
  job_type: string
  attempts: number
  max_attempts: number
}

type QueryBuilder = {
  select: (...args: unknown[]) => QueryBuilder
  in: (...args: unknown[]) => QueryBuilder
  lte: (...args: unknown[]) => QueryBuilder
  or: (...args: unknown[]) => QueryBuilder
  order: (...args: unknown[]) => QueryBuilder
  limit: (...args: unknown[]) => Promise<{ data: unknown; error: unknown }>
  update: (...args: unknown[]) => QueryBuilder
  eq: (...args: unknown[]) => QueryBuilder
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>
  single: () => Promise<{ data: unknown; error: unknown }>
  insert: (...args: unknown[]) => Promise<{ data: unknown; error: unknown }>
  upsert: (...args: unknown[]) => Promise<{ data: unknown; error: unknown }>
  count?: number | null
}

type UntypedSupabase = { from: (table: string) => QueryBuilder }

function db(supabase: unknown): UntypedSupabase {
  return supabase as UntypedSupabase
}

type Capture = {
  id: string
  organization_id: string
  documentation_session_id: string
  storage_path: string | null
  extracted_data: Json
  technician_note: string | null
  transcript: string | null
  capture_ai_analysis: Json
  ocr_text: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeJson(base: Json, patch: Json | undefined): Json {
  if (!isRecord(base)) return patch ?? base
  if (!isRecord(patch)) return base
  return { ...base, ...patch }
}

function retryDelay(attempts: number) {
  return attempts <= 1 ? 60_000 : 5 * 60_000
}


export function getExtractionOcrTextUpdate(operation: string, existingOcrText: string | null | undefined, analysis: Json | undefined): string | null | undefined {
  if (operation !== 'extract_capture') return undefined
  const existing = typeof existingOcrText === 'string' ? existingOcrText.trim() : ''
  if (existing) return existingOcrText ?? existing
  const extractedText = isRecord(analysis) && typeof analysis.extracted_text === 'string' ? analysis.extracted_text.trim() : ''
  return extractedText || undefined
}

function isPermanentFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /invalid|unsupported|not found|signed url|storage_path|missing capture/i.test(message)
}

function getDetectedType(extractedData: Json) {
  if (!isRecord(extractedData) || !isRecord(extractedData.classification)) return null
  return typeof extractedData.classification.detected_type === 'string'
    ? extractedData.classification.detected_type
    : null
}

function getSourceDocument(extractedData: Json) {
  if (!isRecord(extractedData) || !isRecord(extractedData.source_document)) return null
  const source = extractedData.source_document
  const type = typeof source.type === 'string' ? source.type : null
  const label = typeof source.label === 'string' ? source.label : null
  const status = typeof source.status === 'string' ? source.status : 'pending_extraction'
  return type && label ? { type, label, status } : null
}

export async function processCaptureProcessingTick(batchSize = 5) {
  const safeBatchSize = Math.max(1, Math.min(25, Math.floor(batchSize) || 5))
  const supabase = createAdminClient()
  const workerId = `capture-worker-${crypto.randomUUID()}`
  const staleBefore = new Date(Date.now() - LOCK_STALE_MINUTES * 60_000).toISOString()

  const { data: availableJobs, error: queryError } = await db(supabase)
    .from('capture_processing_jobs')
    .select('id, organization_id, documentation_session_id, capture_item_id, job_type, attempts, max_attempts')
    .in('status', ['queued', 'retrying'])
    .lte('scheduled_for', new Date().toISOString())
    .or(`locked_at.is.null,locked_at.lt.${staleBefore}`)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(safeBatchSize)

  if (queryError) throw queryError

  const jobsFound = ((availableJobs ?? []) as Job[]).length
  const results = []
  for (const job of (availableJobs ?? []) as Job[]) {
    const { data: locked, error: lockError } = await db(supabase)
      .from('capture_processing_jobs')
      .update({ status: 'running', locked_at: new Date().toISOString(), locked_by: workerId, started_at: new Date().toISOString(), attempts: job.attempts + 1 })
      .eq('id', job.id)
      .eq('organization_id', job.organization_id)
      .in('status', ['queued', 'retrying'])
      .select('id')
      .maybeSingle()

    if (lockError || !locked) {
      results.push({ jobId: job.id, status: 'skipped_locked' })
      continue
    }

    try {
      await processJob(supabase, job)
      await db(supabase)
        .from('capture_processing_jobs')
        .update({ status: 'succeeded', locked_at: null, locked_by: null, completed_at: new Date().toISOString(), last_error: null })
        .eq('id', job.id)
        .eq('organization_id', job.organization_id)
        .eq('locked_by', workerId)
      results.push({ jobId: job.id, status: 'succeeded' })
    } catch (error) {
      const attempts = job.attempts + 1
      const permanent = isPermanentFailure(error)
      const failed = permanent || attempts >= job.max_attempts
      const message = error instanceof Error ? error.message : String(error)
      await db(supabase)
        .from('capture_processing_jobs')
        .update({
          status: failed ? 'failed' : 'retrying',
          locked_at: null,
          locked_by: null,
          last_error: message.slice(0, 1000),
          scheduled_for: new Date(Date.now() + retryDelay(attempts)).toISOString(),
          completed_at: failed ? new Date().toISOString() : null,
        })
        .eq('id', job.id)
        .eq('organization_id', job.organization_id)
        .eq('locked_by', workerId)
      if (failed && job.capture_item_id) {
        await db(supabase)
          .from('capture_items')
          .update({ ai_status: 'needs_review', processing_status: 'analysis_failed', ai_summary: 'AI analysis unavailable — manual review still available' })
          .eq('id', job.capture_item_id)
          .eq('organization_id', job.organization_id)
      }
      results.push({ jobId: job.id, status: failed ? 'failed' : 'retrying' })
    }
  }

  const { count: remainingCount } = await db(supabase)
    .from('capture_processing_jobs')
    .select('id', { count: 'exact', head: true })
    .in('status', ['queued', 'retrying'])
    .lte('scheduled_for', new Date().toISOString())

  const jobsSucceeded = results.filter((result) => result.status === 'succeeded').length
  const jobsFailed = results.filter((result) => result.status === 'failed').length
  const jobsRetried = results.filter((result) => result.status === 'retrying').length

  return {
    workerId,
    processed: results.length,
    results,
    batchSize: safeBatchSize,
    diagnostics: {
      jobs_found: jobsFound,
      jobs_processed: results.length,
      jobs_succeeded: jobsSucceeded,
      jobs_failed: jobsFailed,
      jobs_retried: jobsRetried,
      jobs_remaining: remainingCount ?? 0,
      batch_size: safeBatchSize,
      no_op: jobsFound === 0,
    },
  }
}

async function processJob(supabase: ReturnType<typeof createAdminClient>, job: Job) {
  if (job.job_type === 'group_evidence' || job.job_type === 'normalize_report_fields' || job.job_type === 'generate_findings' || job.job_type === 'update_report_readiness') {
    await db(supabase)
      .from('capture_items')
      .update({ processing_status: job.job_type === 'update_report_readiness' ? 'report_ready' : 'grouped' })
      .eq('organization_id', job.organization_id)
      .eq('documentation_session_id', job.documentation_session_id)
      .in('processing_status', ['analyzed', 'grouped', 'needs_review', 'analysis_failed'])
    return
  }

  if (!job.capture_item_id) throw new Error('missing capture_item_id')
  const { data: capture, error } = await db(supabase)
    .from('capture_items')
    .select('id, organization_id, documentation_session_id, storage_path, extracted_data, technician_note, transcript, capture_ai_analysis, ocr_text')
    .eq('id', job.capture_item_id)
    .eq('organization_id', job.organization_id)
    .eq('documentation_session_id', job.documentation_session_id)
    .maybeSingle()
  if (error) throw error
  if (!capture) throw new Error('missing capture')
  const item = capture as Capture
  if (!item.storage_path) throw new Error('missing capture storage_path')

  await db(supabase)
    .from('capture_items')
    .update({ processing_status: 'analyzing', ai_status: 'processing' })
    .eq('id', item.id)
    .eq('organization_id', item.organization_id)

  const operation = job.job_type === 'extract_capture' || job.job_type === 'generate_capture_note' ? 'extract_capture' : 'classify_capture'
  const eventType: UsageEventType = operation === 'extract_capture' ? 'ai_extraction' : 'ai_classification'

  const { data: organization, error: organizationError } = await db(supabase)
    .from('organizations')
    .select('plan')
    .eq('id', job.organization_id)
    .single()
  if (organizationError) throw organizationError

  const allowance = await requireUsageAllowance({
    supabase,
    organizationId: job.organization_id,
    plan: normalizeBillingPlan((organization as { plan?: string | null } | null)?.plan),
    eventType,
    quantity: 1,
  })
  if (!allowance.ok) throw new Error(allowance.message)

  const { data: signed, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(item.storage_path, SIGNED_URL_SECONDS)
  if (signedError || !signed?.signedUrl) throw new Error('Unable to create signed url for capture analysis')

  const result = await analyzeCaptureImage(operation, {
    signedImageUrl: signed.signedUrl,
    detectedType: getDetectedType(item.extracted_data),
    note: item.technician_note ?? item.transcript,
    sourceDocument: getSourceDocument(item.extracted_data),
  })

  const ocrTextUpdate = getExtractionOcrTextUpdate(operation, item.ocr_text, result.analysis)
  const captureUpdate: Record<string, unknown> = {
    ai_status: result.status === 'needs_review' ? 'needs_review' : 'extracted',
    processing_status: result.status === 'needs_review' ? 'needs_review' : 'analyzed',
    ai_summary: result.summary,
    capture_ai_analysis: mergeJson(item.capture_ai_analysis, result.analysis),
    extracted_data: mergeJson(item.extracted_data, result.extractedDataPatch),
  }
  if (ocrTextUpdate !== undefined) captureUpdate.ocr_text = ocrTextUpdate

  await db(supabase)
    .from('capture_items')
    .update(captureUpdate)
    .eq('id', item.id)
    .eq('organization_id', item.organization_id)
    .eq('documentation_session_id', item.documentation_session_id)

  await recordUsageEvent({
    supabase,
    organizationId: job.organization_id,
    eventType,
    quantity: 1,
    metadata: {
      documentation_session_id: job.documentation_session_id,
      capture_item_id: job.capture_item_id,
      job_id: job.id,
      background: true,
      operation: result.usage.operation,
      provider: result.usage.provider,
      model: result.usage.model,
      estimated_cost_cents: result.usage.estimatedCostCents,
    },
  })

  await db(supabase)
    .from('ai_usage_events')
    .upsert({
      organization_id: job.organization_id,
      documentation_session_id: job.documentation_session_id,
      capture_item_id: job.capture_item_id,
      job_id: job.id,
      provider: result.usage.provider,
      model: result.usage.model,
      operation: result.usage.operation,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      image_count: result.usage.imageCount,
      estimated_cost_cents: result.usage.estimatedCostCents,
      metadata: result.usage.metadata ?? {},
    }, { onConflict: 'organization_id,documentation_session_id,job_id,operation' })

  const { count } = await db(supabase)
    .from('capture_processing_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', job.organization_id)
    .eq('documentation_session_id', job.documentation_session_id)
    .in('job_type', ['classify_capture', 'extract_capture', 'generate_capture_note'])
    .in('status', ['queued', 'retrying', 'running'])
  if ((count ?? 0) <= 1) {
    await queueSessionProcessingJobs({ supabase, organizationId: job.organization_id, sessionId: job.documentation_session_id })
  }
}
