import type { SupabaseClient } from '@supabase/supabase-js'

import { getCredTier, type CredTier } from '@/features/billing/feature-gates'
import type { Database } from '@/lib/supabase/database.types'
import type { OrganizationPlan } from '@/lib/stripe'

export type SeatEntitlementInput = {
  plan?: OrganizationPlan | string | null
  included_seats?: number | null
  additional_seats?: number | null
  seat_packs?: number | null
  seat_pack_size?: number | null
}

export const INCLUDED_SEATS_BY_TIER: Record<CredTier, number> = {
  essentials: 3,
  professional: 10,
  investigation: 20,
}

export const DEFAULT_SEAT_PACK_SIZE = 5

function positiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export function getIncludedSeats(input: SeatEntitlementInput | OrganizationPlan | string | null | undefined) {
  if (typeof input === 'object' && input && typeof input.included_seats === 'number') {
    return positiveInteger(input.included_seats)
  }

  const plan = typeof input === 'object' && input ? input.plan : input
  return INCLUDED_SEATS_BY_TIER[getCredTier(plan)]
}

export function getEffectiveSeatLimit(input: SeatEntitlementInput | OrganizationPlan | string | null | undefined) {
  const entitlement = typeof input === 'object' && input ? input : { plan: input }
  const packSize = positiveInteger(entitlement.seat_pack_size) || DEFAULT_SEAT_PACK_SIZE
  return getIncludedSeats(entitlement) + positiveInteger(entitlement.additional_seats) + positiveInteger(entitlement.seat_packs) * packSize
}

export function getRemainingSeats(currentSeatCount: number, entitlement: SeatEntitlementInput | OrganizationPlan | string | null | undefined) {
  return Math.max(getEffectiveSeatLimit(entitlement) - currentSeatCount, 0)
}

export function canAddUser(currentSeatCount: number, entitlement: SeatEntitlementInput | OrganizationPlan | string | null | undefined, seatsToAdd = 1) {
  return currentSeatCount + Math.max(1, seatsToAdd) <= getEffectiveSeatLimit(entitlement)
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
