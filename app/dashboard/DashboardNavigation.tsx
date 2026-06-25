'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import type { DashboardNavigationDestination } from '@/features/navigation-dashboard'
import { getDestinationsBySurface } from '@/features/navigation-dashboard'

function isActive(pathname: string, href: string) {
  if (href === '/dashboard') {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavigationLink({ item }: { item: DashboardNavigationDestination }) {
  const pathname = usePathname()
  const active = isActive(pathname, item.href)

  return (
    <Link href={item.href} className="dashboard-nav-link touch-target" aria-current={active ? 'page' : undefined}>
      <span>{item.label}</span>
      <small>{item.description}</small>
    </Link>
  )
}

export function DashboardNavigation({ destinations }: { destinations: DashboardNavigationDestination[] }) {
  const pathname = usePathname()

  if (/^\/dashboard\/sessions\/[^/]+(?:\/|$)/.test(pathname)) {
    return null
  }

  const technicianItems = getDestinationsBySurface(destinations, 'technician')
  const accountItems = destinations.filter((item) => item.surface === 'account' || item.surface === 'admin')

  return (
    <nav className="dashboard-navigation" aria-label="Dashboard navigation">
      <div className="dashboard-nav-group" aria-label="Capture navigation">
        {technicianItems.map((item) => (
          <NavigationLink key={item.href} item={item} />
        ))}
      </div>
      {accountItems.length > 0 ? (
        <div className="dashboard-nav-section dashboard-nav-secondary-section">
          <p className="dashboard-nav-section-label">Account</p>
          <div className="dashboard-nav-group dashboard-nav-management" aria-label="Account and workspace navigation">
            {accountItems.map((item) => (
              <NavigationLink key={item.href} item={item} />
            ))}
          </div>
        </div>
      ) : null}
    </nav>
  )
}
