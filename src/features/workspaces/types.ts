export type WorkspaceType = 'team' | 'shop' | 'office' | 'location' | 'matter' | 'general'
export type WorkspaceRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer'
export type WorkspaceMembershipStatus = 'invited' | 'active' | 'removed' | 'archived'

export const WORKSPACE_TYPES: WorkspaceType[] = ['team', 'shop', 'office', 'location', 'matter', 'general']
export const WORKSPACE_ROLES: WorkspaceRole[] = ['owner', 'admin', 'manager', 'member', 'viewer']
export const WORKSPACE_ADMIN_ROLES: WorkspaceRole[] = ['owner', 'admin']
