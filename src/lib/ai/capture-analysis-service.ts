import { openAiCaptureProvider } from './providers/openai'
import type { CaptureAnalysisRequest } from './providers/types'

export async function analyzeCaptureImage(
  operation: 'classify_capture' | 'extract_capture',
  request: CaptureAnalysisRequest,
) {
  const provider = openAiCaptureProvider
  return operation === 'classify_capture'
    ? provider.classifyCapture(request)
    : provider.extractCapture(request)
}
