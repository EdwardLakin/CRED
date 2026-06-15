import type { Json } from '@/lib/supabase/database.types'

export type AiUsage = {
  provider: string
  model: string
  operation: string
  inputTokens: number
  outputTokens: number
  imageCount: number
  estimatedCostCents: number
  metadata?: Json
}

export type CaptureAnalysisRequest = {
  signedImageUrl: string
  detectedType?: string | null
  guidance?: { workflow: string; step: string; label: string } | null
  note?: string | null
  sourceDocument?: { type: string; label: string; status: string } | null
}

export type NormalizedCaptureAnalysis = {
  classification: string | null
  confidence: number | null
  extracted_text: string | null
  extracted_values: Json
  generated_note: string | null
  generated_observation: string | null
  generated_recommendation: string | null
  ai_status: string
  analyzed_at: string
}

export type CaptureAnalysisResult = {
  analysis: NormalizedCaptureAnalysis
  extractedDataPatch?: Json
  summary: string
  status: 'analyzed' | 'needs_review' | 'analysis_failed'
  usage: AiUsage
}

export type CaptureAiProvider = {
  name: string
  classifyCapture(request: CaptureAnalysisRequest): Promise<CaptureAnalysisResult>
  extractCapture(request: CaptureAnalysisRequest): Promise<CaptureAnalysisResult>
}
