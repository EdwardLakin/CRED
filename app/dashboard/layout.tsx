import type { ReactNode } from 'react'

import { requireProfile } from '@/features/auth/server'
import { getDashboardNavigationDestinations } from '@/features/navigation-dashboard'

import { DashboardNavigation } from './DashboardNavigation'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const profile = await requireProfile()
  const navigationDestinations = getDashboardNavigationDestinations(profile)

  return (
    <div className="dashboard-frame">
      <DashboardNavigation destinations={navigationDestinations} />
      {children}
    </div>
  )
}
