'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type DashboardNavigationItem = {
  href: string
  label: string
  description: string
}

const primaryItems: DashboardNavigationItem[] = [
  { href: '/dashboard', label: 'Dashboard', description: 'Start or resume' },
  { href: '/dashboard/sessions', label: 'Recent', description: 'Session history' },
]

const managementItems: DashboardNavigationItem[] = [
  { href: '/dashboard/settings', label: 'Settings', description: 'Workspace' },
  { href: '/dashboard/billing', label: 'Billing', description: 'Plan and subscription' },
]

function isActive(pathname: string, href: string) {
  if (href === '/dashboard') {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavigationLink({ item }: { item: DashboardNavigationItem }) {
  const pathname = usePathname()
  const active = isActive(pathname, item.href)

  return (
    <Link href={item.href} className="dashboard-nav-link touch-target" aria-current={active ? 'page' : undefined}>
      <span>{item.label}</span>
      <small>{item.description}</small>
    </Link>
  )
}

export function DashboardNavigation() {
  return (
    <nav className="dashboard-navigation" aria-label="Dashboard navigation">
      <div className="dashboard-nav-group" aria-label="Workspace navigation">
        {primaryItems.map((item) => (
          <NavigationLink key={item.href} item={item} />
        ))}
      </div>
      <div className="dashboard-nav-section">
        <p className="dashboard-nav-section-label">Management</p>
        <div className="dashboard-nav-group dashboard-nav-management" aria-label="Management navigation">
          {managementItems.map((item) => (
            <NavigationLink key={item.href} item={item} />
          ))}
        </div>
      </div>
    </nav>
  )
}
