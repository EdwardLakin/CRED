import { redirect } from 'next/navigation'

import { hasInternalAdminAccess, requireSessionWorkspace } from '@/features/sessions/data'

export default async function DashboardTemplatesPage() {
  const { profile } = await requireSessionWorkspace()

  if (!hasInternalAdminAccess(profile)) {
    redirect('/dashboard?notice=internal-admin-only')
  }

  redirect('/dashboard/settings/templates')
}
