import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { getPlanLimits } from '@/features/billing/limits'
import type { OrganizationPlan } from '@/lib/stripe'
import type { Database, Json } from '@/lib/supabase/database.types'

export const USAGE_EVENT_TYPES = [
  'ai_classification',
  'ai_extraction',
  'ai_report_draft_generation',
  'capture_uploaded',
  'storage_bytes_added',
  'email_report_sent',
  'share_link_created',
  'printable_report_opened',
  'template_imported',
  'signature_captured',
] as const

export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number]

export type UsagePeriod = {
  startsAt: string
  endsAt: string
}

export type CurrentUsage = {
  storageBytes: number
  aiActionsThisMonth: number
  emailSendsThisMonth: number
  activeShareLinks: number
}

type Supabase = SupabaseClient<Database>

const AI_LIMITED_EVENT_TYPES = [
  'ai_classification',
  'ai_extraction',
  'ai_report_draft_generation',
] as const satisfies readonly UsageEventType[]

function isAiLimitedEventType(eventType: UsageEventType) {
  return (AI_LIMITED_EVENT_TYPES as readonly UsageEventType[]).includes(eventType)
}

export function isAiUsageLimitExempt(organizationId: string): boolean {
  const configuredOrganizationIds = process.env.AI_USAGE_BYPASS_ORGANIZATION_IDS

  if (!configuredOrganizationIds) {
    return false
  }

  return configuredOrganizationIds
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(organizationId)
}

export function getCurrentCalendarMonthPeriod(now = new Date()): UsagePeriod {
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const endsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

  return {
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  }
}

function numericQuantity(value: unknown) {
  const quantity = Number(value)
  return Number.isFinite(quantity) ? quantity : 0
}

export async function getActiveShareLinkCount(supabase: Supabase, organizationId: string) {
  const now = new Date().toISOString()
  const { count, error } = await supabase
    .from('report_share_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('disabled_at', null)
    .or(`expires_at.is.null,expires_at.gt.${now}`)

  if (error) {
    throw new Error(error.message)
  }

  return count ?? 0
}

export async function getCurrentUsage(
  supabase: Supabase,
  organizationId: string,
  period: UsagePeriod = getCurrentCalendarMonthPeriod(),
): Promise<CurrentUsage> {
  const { data: monthlyRows, error: monthlyError } = await supabase
    .from('organization_usage_events')
    .select('event_type, quantity')
    .eq('organization_id', organizationId)
    .gte('created_at', period.startsAt)
    .lt('created_at', period.endsAt)

  if (monthlyError) {
    throw new Error(monthlyError.message)
  }

  const { data: storageRows, error: storageError } = await supabase
    .from('organization_usage_events')
    .select('quantity')
    .eq('organization_id', organizationId)
    .eq('event_type', 'storage_bytes_added')

  if (storageError) {
    throw new Error(storageError.message)
  }

  const usage = (monthlyRows ?? []).reduce(
    (totals, row) => {
      if (row.event_type === 'ai_classification' || row.event_type === 'ai_extraction' || row.event_type === 'ai_report_draft_generation') {
        totals.aiActionsThisMonth += numericQuantity(row.quantity)
      }

      if (row.event_type === 'email_report_sent') {
        totals.emailSendsThisMonth += numericQuantity(row.quantity)
      }

      return totals
    },
    { aiActionsThisMonth: 0, emailSendsThisMonth: 0 },
  )

  return {
    storageBytes: (storageRows ?? []).reduce((total, row) => total + numericQuantity(row.quantity), 0),
    aiActionsThisMonth: usage.aiActionsThisMonth,
    emailSendsThisMonth: usage.emailSendsThisMonth,
    activeShareLinks: await getActiveShareLinkCount(supabase, organizationId),
  }
}

export async function recordUsageEvent({
  supabase,
  organizationId,
  eventType,
  quantity = 1,
  metadata = {},
  createdBy = null,
}: {
  supabase: Supabase
  organizationId: string
  eventType: UsageEventType
  quantity?: number
  metadata?: Json
  createdBy?: string | null
}) {
  const { error } = await supabase.from('organization_usage_events').insert({
    organization_id: organizationId,
    event_type: eventType,
    quantity,
    metadata,
    created_by: createdBy,
  })

  if (error) {
    throw new Error(error.message)
  }
}

export async function requireUsageAllowance({
  supabase,
  organizationId,
  plan,
  eventType,
  quantity = 1,
  fileSizeBytes,
  isVideo = false,
}: {
  supabase: Supabase
  organizationId: string
  plan: OrganizationPlan | null | undefined
  eventType: UsageEventType
  quantity?: number
  fileSizeBytes?: number
  isVideo?: boolean
}) {
  const limits = getPlanLimits(plan)

  if (typeof fileSizeBytes === 'number') {
    const maxFileSize = isVideo ? limits.maxVideoFileSizeBytes : limits.maxCaptureFileSizeBytes

    if (fileSizeBytes > maxFileSize) {
      return { ok: false as const, message: 'This file is larger than your plan allows.' }
    }
  }

  const usage = await getCurrentUsage(supabase, organizationId)

  if (eventType === 'storage_bytes_added' && usage.storageBytes + quantity > limits.storageBytes) {
    return { ok: false as const, message: 'Storage limit reached for your plan.' }
  }

  const aiLimitExempt = isAiLimitedEventType(eventType) && isAiUsageLimitExempt(organizationId)

  if (isAiLimitedEventType(eventType) && !aiLimitExempt && usage.aiActionsThisMonth + quantity > limits.aiActionsPerMonth) {
    return { ok: false as const, message: 'AI usage limit reached for this month.', aiLimitExempt: false }
  }

  if (eventType === 'email_report_sent' && usage.emailSendsThisMonth + quantity > limits.emailSendsPerMonth) {
    return { ok: false as const, message: 'Email send limit reached for this month.' }
  }

  if (eventType === 'share_link_created' && usage.activeShareLinks + quantity > limits.activeShareLinks) {
    return { ok: false as const, message: 'Share link limit reached for this plan.' }
  }

  return { ok: true as const, limits, usage, aiLimitExempt }
}
