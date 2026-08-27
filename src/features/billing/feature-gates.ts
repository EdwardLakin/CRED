import { redirect } from 'next/navigation'

import { normalizeBillingPlan, type OrganizationPlan } from '@/lib/stripe'

export type CredTier = 'essentials' | 'professional' | 'investigation'

export type FeatureKey =
  | 'capture'
  | 'evidence_library'
  | 'existing_report'
  | 'report_export'
  | 'bulk_import'
  | 'review_queue'
  | 'timeline'
  | 'factual_observations'
  | 'suggestions'
  | 'deliverables'
  | 'entities'
  | 'relationship_explorer'
  | 'investigation_deliverables'
  | 'team_management'

export type FeatureAccessSubject = { organization: { plan?: OrganizationPlan | string | null } } | { plan?: OrganizationPlan | string | null } | OrganizationPlan | string | null | undefined

type VisibleWorkspaceFeature = {
  key: FeatureKey
  label: string
  hrefSegment: string
  description: string
  shortLabel?: string
}

export const CRED_TIER_LABELS: Record<CredTier, string> = {
  essentials: 'CRED Essentials',
  professional: 'CRED Professional',
  investigation: 'CRED Investigation',
}

const TIER_ORDER: Record<CredTier, number> = {
  essentials: 0,
  professional: 1,
  investigation: 2,
}

const FEATURE_MINIMUM_TIER: Record<FeatureKey, CredTier> = {
  capture: 'essentials',
  evidence_library: 'essentials',
  existing_report: 'essentials',
  report_export: 'essentials',
  bulk_import: 'professional',
  team_management: 'essentials',
  review_queue: 'professional',
  timeline: 'professional',
  factual_observations: 'professional',
  suggestions: 'professional',
  deliverables: 'professional',
  entities: 'investigation',
  relationship_explorer: 'investigation',
  investigation_deliverables: 'investigation',
}

export const WORKSPACE_FEATURES: VisibleWorkspaceFeature[] = [
  { key: 'capture', label: 'Capture', hrefSegment: 'capture', shortLabel: 'Capture', description: 'Add item photos, notes, forms, and documents.' },
  { key: 'evidence_library', label: 'Items', hrefSegment: 'evidence', shortLabel: 'Items', description: 'Review captured items and choose what to include in the report.' },
  { key: 'existing_report', label: 'Review', hrefSegment: 'report', shortLabel: 'Review', description: 'Review the current report.' },
  { key: 'report_export', label: 'Export', hrefSegment: 'report', shortLabel: 'Export', description: 'Export PDF or email the reviewed report.' },
  { key: 'timeline', label: 'Timeline', hrefSegment: 'timeline', shortLabel: 'Timeline', description: 'Organize dated events and linked source items.' },
  { key: 'review_queue', label: 'Advanced Review', hrefSegment: 'evidence/review', shortLabel: 'Advanced Review', description: 'Process unresolved items and AI suggestions.' },
  { key: 'factual_observations', label: 'Documented Observations', hrefSegment: 'assertions', shortLabel: 'Observations', description: 'Review factual observations and supporting links.' },
  { key: 'suggestions', label: 'Suggestions', hrefSegment: 'suggestions', shortLabel: 'Suggestions', description: 'Review AI-proposed events, entities, observations, and relationships.' },
  { key: 'deliverables', label: 'Additional Outputs', hrefSegment: 'deliverables', shortLabel: 'Outputs', description: 'Generate versioned outputs for professional review.' },
  { key: 'entities', label: 'People & Organizations', hrefSegment: 'entities', shortLabel: 'People & Orgs', description: 'Review people, places, assets, and organizations.' },
  { key: 'relationship_explorer', label: 'Connections', hrefSegment: 'relationships', shortLabel: 'Connections', description: 'Explore how sources, events, people, and observations connect.' },
]

function planFromSubject(subject: FeatureAccessSubject) {
  if (typeof subject === 'string' || subject == null) return normalizeBillingPlan(subject)
  if ('organization' in subject) return normalizeBillingPlan(subject.organization.plan)
  return normalizeBillingPlan(subject.plan)
}

export function getCredTier(subject: FeatureAccessSubject): CredTier {
  const plan = planFromSubject(subject)
  if (plan === 'team') return 'professional'
  if (plan === 'shop' || plan === 'enterprise') return 'investigation'
  return 'essentials'
}

export function canUseFeature(subject: FeatureAccessSubject, feature: FeatureKey) {
  return TIER_ORDER[getCredTier(subject)] >= TIER_ORDER[FEATURE_MINIMUM_TIER[feature]]
}

export function requireFeature(subject: FeatureAccessSubject, feature: FeatureKey) {
  if (canUseFeature(subject, feature)) return { ok: true as const, tier: getCredTier(subject), feature }
  return { ok: false as const, tier: getCredTier(subject), feature, requiredTier: FEATURE_MINIMUM_TIER[feature] }
}

export function getVisibleWorkspaceFeatures(subject: FeatureAccessSubject) {
  return WORKSPACE_FEATURES.filter((feature) => canUseFeature(subject, feature.key))
}

export function requireWorkspaceFeatureOrRedirect(subject: FeatureAccessSubject, feature: FeatureKey, sessionId?: string) {
  const access = requireFeature(subject, feature)
  if (access.ok) return access
  const target = sessionId ? `/dashboard/sessions/${sessionId}?notice=feature-unavailable` : '/dashboard?notice=feature-unavailable'
  redirect(target)
}
