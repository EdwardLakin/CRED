import { canAddUser, getCurrentSeatCount, getEffectiveSeatLimit, getRemainingSeats } from '@/features/billing/seat-entitlements'
import type { OrganizationPlan } from '@/lib/stripe'

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

export function getAllowedSeatCount(plan: OrganizationPlan | null | undefined) {
  return getEffectiveSeatLimit(plan)
}

export function getRemainingSeatCount(currentSeatCount: number, plan: OrganizationPlan | null | undefined) {
  return getRemainingSeats(currentSeatCount, plan)
}

export { canAddUser, getCurrentSeatCount, getEffectiveSeatLimit, getRemainingSeats }
