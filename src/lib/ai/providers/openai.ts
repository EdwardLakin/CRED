import {
  buildClassifiedImageData,
  classifyCaptureImage,
  getCaptureClassificationSummary,
} from '@/lib/openai/capture-classifier'
import {
  buildCaptureAiAnalysis,
  buildExtractedCaptureData,
  extractCaptureImageDetails,
  getCaptureExtractionSummary,
} from '@/lib/openai/capture-extractor'
import type { Json } from '@/lib/supabase/database.types'

import type { CaptureAiProvider, CaptureAnalysisRequest, NormalizedCaptureAnalysis } from './types'

const MODEL = 'gpt-4.1-mini'

function estimateUsage(operation: string, imageCount = 1) {
  return {
    provider: 'openai',
    model: MODEL,
    operation,
    inputTokens: 0,
    outputTokens: 0,
    imageCount,
    estimatedCostCents: 0,
    metadata: { estimated: true } as Json,
  }
}

export const openAiCaptureProvider: CaptureAiProvider = {
  name: 'openai',
  async classifyCapture(request: CaptureAnalysisRequest) {
    const classification = await classifyCaptureImage(
      request.signedImageUrl,
      request.guidance ?? null,
      request.note ?? null,
    )
    const status =
      classification.confidence >= 0.7 && classification.detected_type !== 'unknown'
        ? 'analyzed'
        : 'needs_review'
    const aiStatus = status === 'analyzed' ? 'analyzed' : 'needs_review'
    return {
      analysis: {
        classification: classification.detected_type,
        confidence: classification.confidence,
        extracted_text: null,
        extracted_values: {},
        generated_note: null,
        generated_observation: null,
        generated_recommendation: null,
        ai_status: aiStatus,
        analyzed_at: new Date().toISOString(),
      },
      extractedDataPatch: buildClassifiedImageData(
        {},
        classification,
        classification.confidence >= 0.7 && classification.detected_type !== 'unknown'
          ? 'classified'
          : 'needs_review',
      ),
      summary: getCaptureClassificationSummary(classification),
      status,
      usage: estimateUsage('classify_capture'),
    }
  },
  async extractCapture(request: CaptureAnalysisRequest) {
    const detectedType = request.detectedType || 'general_evidence'
    const extraction = await extractCaptureImageDetails(
      request.signedImageUrl,
      detectedType as never,
      request.note ?? null,
      request.sourceDocument ?? null,
    )
    const status = extraction.confidence >= 0.65 ? 'analyzed' : 'needs_review'
    const extractionStatus = status === 'analyzed' ? 'extracted' : 'needs_review'
    return {
      analysis: buildCaptureAiAnalysis({}, extraction, extractionStatus) as NormalizedCaptureAnalysis,
      extractedDataPatch: buildExtractedCaptureData({}, extraction, extractionStatus),
      summary: getCaptureExtractionSummary(extraction),
      status,
      usage: estimateUsage('extract_capture'),
    }
  },
}
