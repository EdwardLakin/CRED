import { processCaptureProcessingTick } from '@/lib/capture-processing/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_BATCH_SIZE = 5
const MAX_BATCH_SIZE = 25

function getAcceptedWorkerSecrets() {
  return [
    process.env.INTERNAL_CAPTURE_WORKER_SECRET?.trim(),
    process.env.CAPTURE_PROCESSING_INTERNAL_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
  ].filter((secret): secret is string => Boolean(secret))
}

function getProvidedSecret(request: Request) {
  const auth = request.headers.get('authorization') ?? ''
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? ''
  return (
    request.headers.get('x-internal-secret')?.trim() ||
    request.headers.get('x-vercel-cron-signature')?.trim() ||
    bearer
  )
}

function getBatchSize(request: Request) {
  const url = new URL(request.url)
  const parsed = Number(url.searchParams.get('batch_size') ?? DEFAULT_BATCH_SIZE)
  if (!Number.isFinite(parsed)) return DEFAULT_BATCH_SIZE
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(parsed)))
}

async function handleTick(request: Request) {
  const secrets = getAcceptedWorkerSecrets()
  const provided = getProvidedSecret(request)

  if (secrets.length === 0 || !provided || !secrets.includes(provided)) {
    console.warn('capture-processing tick unauthorized', {
      hasConfiguredSecret: secrets.length > 0,
      hasProvidedSecret: Boolean(provided),
    })
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const batchSize = getBatchSize(request)
  const result = await processCaptureProcessingTick(batchSize)

  if (result.processed === 0) {
    console.info('capture-processing tick noop', { batchSize })
  } else {
    console.info('capture-processing tick complete', {
      batchSize,
      processed: result.processed,
    })
  }

  return Response.json({ ok: true, workerId: result.workerId, processed: result.processed, batchSize: result.batchSize, ...result.diagnostics })
}

// Vercel Cron can invoke GET endpoints. Manual/testing callers may use POST.
export async function GET(request: Request) {
  return handleTick(request)
}

export async function POST(request: Request) {
  return handleTick(request)
}
