import { createQuickCaptureSession } from '@/features/sessions/actions'

export default async function NewSessionPage() {
  await createQuickCaptureSession()
  return null
}
