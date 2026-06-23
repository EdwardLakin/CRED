import 'server-only'

import { randomBytes } from 'crypto'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireActiveBillingAccess } from '@/features/billing/access'
import { requireUsageAllowance, recordUsageEvent } from '@/features/usage/limits'
import type { Database } from '@/lib/supabase/database.types'
import type { EvidenceDeliverable } from './data'

export const DELIVERABLE_SHARE_EXPIRATION_DAYS = 30
export type DeliverableShareToken = Database['public']['Tables']['report_share_tokens']['Row']
type Supabase = SupabaseClient<Database>

type Profile = { id: string; organization_id: string; organization: { billing_status: string | null; plan: string | null } }

export function getDeliverableShareUrl(token: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? ''
  return `${base}/deliverables/share/${token}`
}

export function isActiveShareToken(token: Pick<DeliverableShareToken, 'disabled_at' | 'expires_at'>, now = new Date()) {
  return !token.disabled_at && (!token.expires_at || new Date(token.expires_at) > now)
}

export function validateDeliverableShareExpiration(expiresAt?: string | null) {
  if (!expiresAt) {
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + DELIVERABLE_SHARE_EXPIRATION_DAYS)
    return expiry.toISOString()
  }

  const expiry = new Date(expiresAt)
  if (!Number.isFinite(expiry.getTime()) || expiry <= new Date()) {
    throw new Error('Share-link expiration must be a valid future date.')
  }

  return expiry.toISOString()
}

export function deliverableShareStatus(token?: Pick<DeliverableShareToken, 'disabled_at' | 'expires_at'> | null) {
  if (!token) return 'Not shared'
  if (token.disabled_at) return 'Revoked'
  if (token.expires_at && new Date(token.expires_at) <= new Date()) return 'Expired'
  return 'Active'
}

export async function requireShareableDeliverable(supabase: Supabase, organizationId: string, sessionId: string, deliverableId: string) {
  const { data: session, error: sessionError } = await supabase.from('documentation_sessions').select('id, organization_id, deleted_at').eq('id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).single()
  if (sessionError || !session) throw new Error('Session not found')
  const { data, error } = await supabase.from('evidence_deliverables').select('*').eq('id', deliverableId).eq('documentation_session_id', sessionId).eq('organization_id', organizationId).is('deleted_at', null).single()
  if (error || !data) throw new Error('Deliverable not found')
  const deliverable = data as EvidenceDeliverable
  if (deliverable.status !== 'final') throw new Error('Only a finalized deliverable can receive a secure share link.')
  return deliverable
}

export async function getActiveDeliverableShareToken(supabase: Supabase, organizationId: string, sessionId: string, deliverableId: string) {
  const { data, error } = await supabase.from('report_share_tokens').select('*').eq('organization_id', organizationId).eq('documentation_session_id', sessionId).eq('deliverable_id', deliverableId).eq('link_kind', 'deliverable').is('disabled_at', null).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).find((token) => isActiveShareToken(token)) ?? null
}

export async function createDeliverableShareLink({ supabase, profile, sessionId, deliverableId, expiresAt }: { supabase: Supabase; profile: Profile; sessionId: string; deliverableId: string; expiresAt?: string | null }) {
  await requireShareableDeliverable(supabase, profile.organization_id, sessionId, deliverableId)
  const existing = await getActiveDeliverableShareToken(supabase, profile.organization_id, sessionId, deliverableId)
  if (existing) return existing
  const billingAccess = requireActiveBillingAccess(profile as never)
  if (!billingAccess.ok) throw new Error(billingAccess.message)
  const allowance = await requireUsageAllowance({ supabase, organizationId: profile.organization_id, plan: billingAccess.access.plan, eventType: 'share_link_created' })
  if (!allowance.ok) throw new Error(allowance.message)
  const expiry = validateDeliverableShareExpiration(expiresAt)
  const { data, error } = await supabase.from('report_share_tokens').insert({ documentation_session_id: sessionId, organization_id: profile.organization_id, deliverable_id: deliverableId, link_kind: 'deliverable', token: randomBytes(32).toString('base64url'), expires_at: expiry, created_by: profile.id }).select('*').single()
  if (error || !data) {
    const racedExisting = await getActiveDeliverableShareToken(supabase, profile.organization_id, sessionId, deliverableId)
    if (racedExisting) return racedExisting
    throw new Error('Could not create secure share link.')
  }
  await recordUsageEvent({ supabase, organizationId: profile.organization_id, eventType: 'share_link_created', metadata: { session_id: sessionId, deliverable_id: deliverableId, delivery: 'deliverable_share_link' }, createdBy: profile.id })
  return data
}

export async function resolveDeliverableShareToken(supabase: Supabase, token: string) {
  const { data: shareToken, error } = await supabase.from('report_share_tokens').select('*, documentation_sessions(id,title,organization_id,deleted_at), evidence_deliverables(*)').eq('token', token).eq('link_kind', 'deliverable').maybeSingle()
  const session = Array.isArray(shareToken?.documentation_sessions) ? shareToken?.documentation_sessions[0] : shareToken?.documentation_sessions
  const deliverable = Array.isArray(shareToken?.evidence_deliverables) ? shareToken?.evidence_deliverables[0] : shareToken?.evidence_deliverables
  if (error || !shareToken || !session || !deliverable || !isActiveShareToken(shareToken) || session.organization_id !== shareToken.organization_id || deliverable.organization_id !== shareToken.organization_id || deliverable.documentation_session_id !== session.id || deliverable.id !== shareToken.deliverable_id || deliverable.status !== 'final' || deliverable.deleted_at || session.deleted_at) notFound()
  const { data: viewedToken, error: viewError } = await supabase.rpc('increment_deliverable_share_token_view', { p_token_id: shareToken.id })
  if (viewError || !viewedToken) notFound()
  return { shareToken: viewedToken, session, deliverable: deliverable as EvidenceDeliverable }
}
