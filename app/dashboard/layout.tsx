import type { ReactNode } from 'react'

import { requireProfile } from '@/features/auth/server'
import { getDashboardNavigationDestinations } from '@/features/navigation-dashboard'
import { OfflineBootstrap } from '@/features/offline/OfflineBootstrap'

import { DashboardNavigation } from './DashboardNavigation'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const profile = await requireProfile()
  const navigationDestinations = getDashboardNavigationDestinations(profile)

  return (
    <div className="dashboard-frame">
      <OfflineBootstrap
        userId={profile.user_id}
        organizationId={profile.organization_id}
      />
      <DashboardNavigation destinations={navigationDestinations} />
      {children}
    </div>
  )
}
