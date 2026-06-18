import type { SupabaseClient } from '@supabase/supabase-js'

import type { BillingPlan, OrganizationPlan } from '@/features/billing'
import type { Database } from '@/lib/supabase/database.types'

export type TeamRole = 'owner' | 'admin' | 'inspector' | 'reviewer'
export type TeamMemberStatus = 'active' | 'pending_invite'

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  inspector: 'Inspector',
  reviewer: 'Reviewer',
}

export const TEAM_STATUS_LABELS: Record<TeamMemberStatus, string> = {
  active: 'Active',
  pending_invite: 'Pending Invite',
}

export const PLAN_SEAT_LIMITS: Record<BillingPlan, number> = {
  individual: 1,
  team: 5,
  shop: 15,
}

export function getAllowedSeatCount(plan: OrganizationPlan | null | undefined) {
  if (plan === 'team' || plan === 'shop') return PLAN_SEAT_LIMITS[plan]
  return PLAN_SEAT_LIMITS.individual
}

export function getRemainingSeatCount(currentSeatCount: number, plan: OrganizationPlan | null | undefined) {
  return Math.max(getAllowedSeatCount(plan) - currentSeatCount, 0)
}

export async function getCurrentSeatCount(supabase: SupabaseClient<Database>, organizationId: string) {
  const client = supabase as SupabaseClient
  const [{ count: activeCount, error: activeError }, { count: pendingCount, error: pendingError }] = await Promise.all([
    client.from('profiles').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
    client.from('organization_invitations').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'pending_invite'),
  ])

  if (activeError) throw activeError
  if (pendingError) throw pendingError

  return (activeCount ?? 0) + (pendingCount ?? 0)
}
