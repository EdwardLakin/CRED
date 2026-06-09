import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import type { Database, Industry } from '@/lib/supabase/database.types'

type ProfileRow = Database['public']['Tables']['profiles']['Row']
type OrganizationRow = Database['public']['Tables']['organizations']['Row']
type CompanyProfileRow = Database['public']['Tables']['company_profiles']['Row']

export interface CurrentProfile extends ProfileRow {
  organization: Pick<OrganizationRow, 'id' | 'name'>
  company_profile: Pick<CompanyProfileRow, 'industry'> | null
}

export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user
}

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const user = await getCurrentUser()

  if (!user) {
    return null
  }

  const supabase = await createClient()
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, organization_id, full_name, role, created_at')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return null
  }

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', profile.organization_id)
    .single()

  if (organizationError || !organization) {
    return null
  }

  const { data: companyProfile } = await supabase
    .from('company_profiles')
    .select('industry')
    .eq('organization_id', profile.organization_id)
    .maybeSingle()

  return {
    id: profile.id,
    organization_id: profile.organization_id,
    full_name: profile.full_name,
    role: profile.role,
    created_at: profile.created_at,
    organization,
    company_profile: companyProfile ? { industry: companyProfile.industry as Industry } : null,
  }
}

export async function requireUser() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/sign-in')
    throw new Error('Redirecting to sign in')
  }

  return user
}

export async function requireProfile(): Promise<CurrentProfile> {
  await requireUser()
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/onboarding')
    throw new Error('Redirecting to onboarding')
  }

  return profile
}
