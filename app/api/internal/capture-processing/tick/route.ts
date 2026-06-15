import { processCaptureProcessingTick } from '@/lib/capture-processing/worker'

export async function POST(request: Request) {
  const secret = process.env.CAPTURE_PROCESSING_INTERNAL_SECRET
  const provided = request.headers.get('x-internal-secret') ?? ''

  if (!secret || provided !== secret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await processCaptureProcessingTick(5)
  return Response.json(result)
}
