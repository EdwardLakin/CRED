import { OFFLINE_DOCUMENT_HTML } from '@/features/offline/static-shell/offline-document'

export const dynamic = 'force-static'
export const revalidate = false

const headers = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=0, must-revalidate',
}

export function GET() {
  return new Response(OFFLINE_DOCUMENT_HTML, { headers })
}

export function HEAD() {
  return new Response(null, { headers })
}
