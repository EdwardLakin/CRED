import type { BillingPlan, OrganizationPlan } from '@/lib/stripe'

const MB = 1024 * 1024
const GB = 1024 * MB
const STORAGE_BUCKET_MAX_BYTES = 100 * MB

export type PlanLimits = {
  plan: BillingPlan
  storageBytes: number
  aiActionsPerMonth: number
  maxCaptureFileSizeBytes: number
  maxVideoFileSizeBytes: number
  videoDurationLabel?: string
  emailSendsPerMonth: number
  activeShareLinks: number
  notes?: string
}

export const PLAN_LIMITS: Record<BillingPlan, PlanLimits> = {
  individual: {
    plan: 'individual',
    storageBytes: 5 * GB,
    aiActionsPerMonth: 200,
    maxCaptureFileSizeBytes: 25 * MB,
    maxVideoFileSizeBytes: 50 * MB,
    videoDurationLabel: 'short clips only',
    emailSendsPerMonth: 50,
    activeShareLinks: 25,
  },
  team: {
    plan: 'team',
    storageBytes: 25 * GB,
    aiActionsPerMonth: 1_000,
    maxCaptureFileSizeBytes: 50 * MB,
    maxVideoFileSizeBytes: STORAGE_BUCKET_MAX_BYTES,
    emailSendsPerMonth: 250,
    activeShareLinks: 100,
  },
  shop: {
    plan: 'shop',
    storageBytes: 100 * GB,
    aiActionsPerMonth: 5_000,
    maxCaptureFileSizeBytes: STORAGE_BUCKET_MAX_BYTES,
    maxVideoFileSizeBytes: STORAGE_BUCKET_MAX_BYTES,
    emailSendsPerMonth: 1_000,
    activeShareLinks: 500,
    notes: 'Video uploads are capped at 100 MB until the storage bucket and app upload path safely support larger objects.',
  },
}

export function getPlanLimits(plan: OrganizationPlan | null | undefined): PlanLimits {
  if (plan === 'team' || plan === 'shop') {
    return PLAN_LIMITS[plan]
  }

  return PLAN_LIMITS.individual
}

export function formatBytes(bytes: number) {
  if (bytes >= GB) {
    return `${(bytes / GB).toFixed(bytes % GB === 0 ? 0 : 1)} GB`
  }

  return `${Math.ceil(bytes / MB)} MB`
}
