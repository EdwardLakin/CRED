export const EVIDENCE_CATEGORIES = ['supporting_evidence', 'observation', 'concern', 'recommended_action'] as const

export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number]

export const DEFAULT_EVIDENCE_CATEGORY: EvidenceCategory = 'supporting_evidence'

export const EVIDENCE_CATEGORY_LABELS: Record<EvidenceCategory, string> = {
  supporting_evidence: 'Supporting Evidence',
  observation: 'Observation',
  concern: 'Concern',
  recommended_action: 'Recommended Action',
}

export function normalizeEvidenceCategory(value: unknown): EvidenceCategory {
  return typeof value === 'string' && EVIDENCE_CATEGORIES.includes(value as EvidenceCategory)
    ? (value as EvidenceCategory)
    : DEFAULT_EVIDENCE_CATEGORY
}
