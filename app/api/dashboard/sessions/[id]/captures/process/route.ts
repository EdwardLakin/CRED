import { processPendingCapturesForSession } from '@/features/capture/actions'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const summary = await processPendingCapturesForSession(id)

  return Response.json(summary, { status: summary.ok ? 200 : 202 })
}
