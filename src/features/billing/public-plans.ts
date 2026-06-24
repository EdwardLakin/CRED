import { BILLING_PLANS, type BillingPlan } from '@/lib/stripe'
import { CRED_TIER_LABELS, canUseFeature, type CredTier, type FeatureKey } from '@/features/billing/feature-gates'
import { getIncludedSeats } from '@/features/billing/seat-entitlements'

export type PublicCredPlan = {
  billingKey: BillingPlan
  tier: CredTier
  name: string
  shortName: string
  priceLabel: string
  includedSeats: number
  audience: string
  description: string
  highlightedFeatures: string[]
  featured?: boolean
}

export const PUBLIC_PLAN_ORDER: BillingPlan[] = ['individual', 'team', 'shop']

export const PUBLIC_PLAN_TIER_BY_BILLING_KEY: Record<BillingPlan, CredTier> = {
  individual: 'essentials',
  team: 'professional',
  shop: 'investigation',
}

export const PUBLIC_BILLING_COMPATIBILITY_NOTE =
  'Transitional billing compatibility: legacy Stripe billing keys individual, team, and shop display publicly as CRED Essentials, CRED Professional, and CRED Investigation.'

const PLAN_COPY: Record<BillingPlan, Omit<PublicCredPlan, 'billingKey' | 'tier' | 'name' | 'priceLabel' | 'includedSeats'>> = {
  individual: {
    shortName: 'Essentials',
    audience: 'Technicians, repair shops, inspectors, contractors, field-service teams, fleet teams, and property walkthrough teams.',
    description: 'A complete documentation workflow for capturing field evidence, reviewing reports, approving them, and exporting polished records.',
    highlightedFeatures: [
      'Capture sessions for photos, forms, documents, voice notes, and text notes',
      'Evidence Library and Existing Report workflow',
      'Human review, approval, signatures, PDF/print, email, and secure sharing',
      'Team management with additional seats available',
    ],
    featured: true,
  },
  team: {
    shortName: 'Professional',
    audience: 'Adjusters, claims teams, compliance teams, larger inspection teams, and field organizations with more complex documentation.',
    description: 'Everything in Essentials plus structured evidence review, organization, timelines, observations, suggestions, and deliverables.',
    highlightedFeatures: [
      'Review Queue for structured evidence review',
      'Timeline, Factual Observations, and Suggestions',
      'Deliverables for larger-team report preparation',
      'Larger-team workflow with additional seats available',
    ],
  },
  shop: {
    shortName: 'Investigation',
    audience: 'Law firms, insurance investigators, forensic consultants, expert witnesses, dispute-resolution teams, and evidence-heavy services.',
    description: 'Everything in Professional plus advanced evidence organization, entities, relationships, evidence linking, and investigation deliverables.',
    highlightedFeatures: [
      'Entities and Relationship Explorer',
      'Evidence linking and chronology analysis support',
      'Investigation deliverables and full investigation workspace',
      'Advanced workspace for evidence-heavy teams',
    ],
  },
}

export function getPublicCredPlan(billingKey: BillingPlan): PublicCredPlan {
  const tier = PUBLIC_PLAN_TIER_BY_BILLING_KEY[billingKey]
  return {
    billingKey,
    tier,
    name: CRED_TIER_LABELS[tier],
    priceLabel: BILLING_PLANS[billingKey].price,
    includedSeats: getIncludedSeats(billingKey),
    ...PLAN_COPY[billingKey],
  }
}

export const PUBLIC_CRED_PLANS = PUBLIC_PLAN_ORDER.map(getPublicCredPlan)

export type PublicFeatureComparisonRow = {
  label: string
  feature?: FeatureKey
  values: Record<CredTier, boolean | string>
}

const COMPARISON_FEATURES: Array<{ label: string; feature: FeatureKey }> = [
  { label: 'Capture sessions', feature: 'capture' },
  { label: 'Evidence Library', feature: 'evidence_library' },
  { label: 'Existing Report', feature: 'existing_report' },
  { label: 'PDF/print/export', feature: 'report_export' },
  { label: 'Secure report sharing', feature: 'report_export' },
  { label: 'Signatures', feature: 'report_export' },
  { label: 'Team management', feature: 'team_management' },
  { label: 'Review Queue', feature: 'review_queue' },
  { label: 'Timeline', feature: 'timeline' },
  { label: 'Factual Observations', feature: 'factual_observations' },
  { label: 'Suggestions', feature: 'suggestions' },
  { label: 'Deliverables', feature: 'deliverables' },
  { label: 'Entities', feature: 'entities' },
  { label: 'Relationship Explorer', feature: 'relationship_explorer' },
  { label: 'Investigation deliverables', feature: 'investigation_deliverables' },
]

export const PUBLIC_FEATURE_COMPARISON: PublicFeatureComparisonRow[] = [
  ...COMPARISON_FEATURES.map(({ label, feature }) => ({
    label,
    feature,
    values: {
      essentials: canUseFeature('individual', feature),
      professional: canUseFeature('team', feature),
      investigation: canUseFeature('shop', feature),
    },
  })),
  {
    label: 'Included seats',
    values: {
      essentials: String(getIncludedSeats('individual')),
      professional: String(getIncludedSeats('team')),
      investigation: String(getIncludedSeats('shop')),
    },
  },
]
