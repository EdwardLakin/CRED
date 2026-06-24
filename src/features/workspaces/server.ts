import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { requireUser } from '@/features/auth/server'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'

import type { WorkspaceRole } from './types'

const ACTIVE_WORKSPACE_COOKIE = 'cred_active_workspace_id'
const ACTIVE_WORKSPACE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90

type OrganizationRow = Database['public']['Tables']['organizations']['Row']
type WorkspaceMembershipRow = Database['public']['Tables']['workspace_memberships']['Row']

type WorkspaceOrganizationProjection = Pick<
  OrganizationRow,
  | 'id'
  | 'name'
  | 'industry'
  | 'workspace_type'
  | 'plan'
  | 'subscription_status'
  | 'included_seats'
  | 'additional_seats'
  | 'seat_packs'
  | 'billing_account_id'
  | 'archived_at'
>

type WorkspaceMembershipQueryRow = Pick<
  WorkspaceMembershipRow,
  'id' | 'workspace_id' | 'role' | 'status' | 'joined_at'
> & {
  organizations: WorkspaceOrganizationProjection | WorkspaceOrganizationProjection[] | null
}

export type AccessibleWorkspace = WorkspaceOrganizationProjection & {
  membership: Pick<WorkspaceMembershipRow, 'id' | 'role' | 'status' | 'joined_at'>
}

function mapMembershipRole(role: string): WorkspaceRole {
  if (role === 'owner' || role === 'admin' || role === 'manager' || role === 'member' || role === 'viewer') return role
  if (role === 'reviewer') return 'viewer'
  return 'member'
}

function normalizeWorkspaceOrganization(
  organizations: WorkspaceMembershipQueryRow['organizations'],
): WorkspaceOrganizationProjection | null {
  if (Array.isArray(organizations)) return organizations[0] ?? null
  return organizations
}

function normalizeAccessibleWorkspace(membership: WorkspaceMembershipQueryRow): AccessibleWorkspace | null {
  const organization = normalizeWorkspaceOrganization(membership.organizations)
  if (!organization || organization.archived_at !== null || organization.id !== membership.workspace_id) return null

  return {
    ...organization,
    membership: {
      id: membership.id,
      role: mapMembershipRole(membership.role),
      status: membership.status,
      joined_at: membership.joined_at,
    },
  }
}

function normalizeAccessibleWorkspaces(memberships: WorkspaceMembershipQueryRow[] | null): AccessibleWorkspace[] {
  return (memberships ?? []).reduce<AccessibleWorkspace[]>((workspaces, membership) => {
    const workspace = normalizeAccessibleWorkspace(membership)
    if (workspace) workspaces.push(workspace)
    return workspaces
  }, [])
}

export async function listAccessibleWorkspaces(): Promise<AccessibleWorkspace[]> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: memberships, error } = await supabase
    .from('workspace_memberships')
    .select('id, workspace_id, role, status, joined_at, organizations(id, name, industry, workspace_type, plan, subscription_status, included_seats, additional_seats, seat_packs, billing_account_id, archived_at)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .is('organizations.archived_at', null)
    .order('created_at', { ascending: true })
    .returns<WorkspaceMembershipQueryRow[]>()

  if (error) throw new Error(error.message)

  return normalizeAccessibleWorkspaces(memberships)
}

async function getRequestedWorkspaceId() {
  const cookieStore = await cookies()
  return cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null
}

async function clearActiveWorkspaceCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(ACTIVE_WORKSPACE_COOKIE)
}

export async function getCurrentWorkspace(): Promise<AccessibleWorkspace | null> {
  const workspaces = await listAccessibleWorkspaces()
  if (workspaces.length === 0) {
    await clearActiveWorkspaceCookie()
    return null
  }

  const requestedWorkspaceId = await getRequestedWorkspaceId()
  const workspace = workspaces.find((candidate) => candidate.id === requestedWorkspaceId) ?? workspaces[0]

  if (requestedWorkspaceId && workspace.id !== requestedWorkspaceId) await clearActiveWorkspaceCookie()

  return workspace
}

export async function setActiveWorkspace(workspaceId: string) {
  const workspace = await requireWorkspaceMembership(workspaceId)
  const cookieStore = await cookies()

  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ACTIVE_WORKSPACE_COOKIE_MAX_AGE_SECONDS,
  })

  return workspace
}

export async function requireWorkspaceMembership(workspaceId?: string | null) {
  const explicitWorkspaceRequested = workspaceId != null
  const requestedWorkspaceId = workspaceId ?? (await getRequestedWorkspaceId())
  const workspaces = await listAccessibleWorkspaces()
  const requestedWorkspace = requestedWorkspaceId
    ? workspaces.find((candidate) => candidate.id === requestedWorkspaceId)
    : null
  const workspace = requestedWorkspace ?? (explicitWorkspaceRequested ? null : workspaces[0])

  if (!workspace) {
    await clearActiveWorkspaceCookie()
    redirect('/onboarding')
  }

  if (requestedWorkspaceId && workspace.id !== requestedWorkspaceId) await clearActiveWorkspaceCookie()

  return workspace
}

export async function requireWorkspaceRole(roles: WorkspaceRole[], workspaceId?: string | null) {
  const workspace = await requireWorkspaceMembership(workspaceId)

  if (!roles.includes(workspace.membership.role)) {
    redirect('/dashboard?notice=workspace-role-required')
  }

  return workspace
}
