import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { requireUser } from '@/features/auth/server'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'

import type { WorkspaceRole } from './types'

const ACTIVE_WORKSPACE_COOKIE = 'cred_active_workspace_id'

type OrganizationRow = Database['public']['Tables']['organizations']['Row']
type WorkspaceMembershipRow = Database['public']['Tables']['workspace_memberships']['Row']

export type AccessibleWorkspace = Pick<
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
> & {
  membership: Pick<WorkspaceMembershipRow, 'id' | 'role' | 'status' | 'joined_at'>
}

function mapMembershipRole(role: string): WorkspaceRole {
  if (role === 'owner' || role === 'admin' || role === 'manager' || role === 'member' || role === 'viewer') return role
  if (role === 'reviewer') return 'viewer'
  return 'member'
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

  if (error) throw new Error(error.message)

  return ((memberships ?? []) as Array<any>)
    .filter((membership: any) => membership.organizations)
    .map((membership: any) => ({
      ...membership.organizations,
      membership: {
        id: membership.id,
        role: mapMembershipRole(membership.role),
        status: membership.status,
        joined_at: membership.joined_at,
      },
    })) as AccessibleWorkspace[]
}

async function getRequestedWorkspaceId() {
  const cookieStore = await cookies()
  return cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null
}

export async function getCurrentWorkspace(): Promise<AccessibleWorkspace | null> {
  const workspaces = await listAccessibleWorkspaces()
  if (workspaces.length === 0) return null

  const requestedWorkspaceId = await getRequestedWorkspaceId()
  return workspaces.find((workspace) => workspace.id === requestedWorkspaceId) ?? workspaces[0]
}

export async function setActiveWorkspace(workspaceId: string) {
  const workspace = await requireWorkspaceMembership(workspaceId)
  const cookieStore = await cookies()

  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })

  return workspace
}

export async function requireWorkspaceMembership(workspaceId?: string | null) {
  const requestedWorkspaceId = workspaceId ?? (await getRequestedWorkspaceId())
  const workspaces = await listAccessibleWorkspaces()
  const workspace = requestedWorkspaceId
    ? workspaces.find((candidate) => candidate.id === requestedWorkspaceId)
    : workspaces[0]

  if (!workspace) {
    redirect('/onboarding')
    throw new Error('Redirecting to onboarding')
  }

  return workspace
}

export async function requireWorkspaceRole(roles: WorkspaceRole[], workspaceId?: string | null) {
  const workspace = await requireWorkspaceMembership(workspaceId)

  if (!roles.includes(workspace.membership.role)) {
    redirect('/dashboard?notice=workspace-role-required')
  }

  return workspace
}
