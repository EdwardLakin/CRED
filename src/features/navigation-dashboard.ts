export type ProfileRole = 'owner' | 'admin' | 'inspector' | 'reviewer'

export type DashboardDestinationSurface = 'technician' | 'admin' | 'account' | 'session'

export type DashboardNavigationDestination = {
  href: string
  label: string
  description: string
  surface: DashboardDestinationSurface
}

export const dashboardNavigationDestinations: DashboardNavigationDestination[] = [
  { href: '/dashboard', label: 'Dashboard', description: 'Start or resume', surface: 'technician' },
  { href: '/dashboard/sessions', label: 'Recent', description: 'Recent work', surface: 'technician' },
  { href: '/dashboard/settings', label: 'Account', description: 'Your workspace', surface: 'account' },
  { href: '/dashboard/billing', label: 'Workspace', description: 'Plan and usage', surface: 'admin' },
]

export function canUseWorkspaceAdmin(profile: { role: ProfileRole }) {
  return profile.role === 'owner' || profile.role === 'admin'
}

export function getDashboardNavigationDestinations(profile: { role: ProfileRole }) {
  const showAdmin = canUseWorkspaceAdmin(profile)

  return dashboardNavigationDestinations.filter((destination) => {
    if (destination.surface === 'admin') {
      return showAdmin
    }

    return true
  })
}

export function getDestinationsBySurface(destinations: DashboardNavigationDestination[], surface: DashboardDestinationSurface) {
  return destinations.filter((destination) => destination.surface === surface)
}
