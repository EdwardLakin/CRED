import type { ReactNode } from 'react'

import { DashboardNavigation } from './DashboardNavigation'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dashboard-frame">
      <DashboardNavigation />
      {children}
    </div>
  )
}
