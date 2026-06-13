import { redirect } from 'next/navigation'

import { requireProfile, type CurrentProfile } from '@/features/auth/server'
import { createClient } from '@/lib/supabase/server'

export async function requireSessionWorkspace() {
  const profile = await requireProfile()
  const supabase = await createClient()

  return { supabase, profile }
}

export function hasInternalAdminAccess(profile: Pick<CurrentProfile, 'role'>) {
  return profile.role === 'owner' || profile.role === 'admin'
}

export async function requireInternalAdminWorkspace() {
  const workspace = await requireSessionWorkspace()

  if (!hasInternalAdminAccess(workspace.profile)) {
    redirect('/dashboard?notice=internal-admin-only')
  }

  return workspace
}
