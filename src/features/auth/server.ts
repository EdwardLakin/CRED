import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'

type ProfileRow = Database['public']['Tables']['profiles']['Row']
type OrganizationRow = Database['public']['Tables']['organizations']['Row']
type CompanyProfileRow = Database['public']['Tables']['company_profiles']['Row']

export interface CurrentProfile extends ProfileRow {
  organization: Pick<
    OrganizationRow,
    | 'id'
    | 'name'
    | 'industry'
    | 'stripe_customer_id'
    | 'stripe_subscription_id'
    | 'plan'
    | 'subscription_status'
    | 'current_period_end'
    | 'trial_ends_at'
    | 'billing_started_at'
    | 'included_seats'
    | 'additional_seats'
    | 'seat_packs'
  >
  company_profile: Pick<CompanyProfileRow, 'company_name' | 'facility_name' | 'facility_number' | 'facility_address_line_1' | 'facility_address_line_2' | 'facility_city' | 'facility_region' | 'facility_postal_code' | 'facility_country' | 'facility_phone' | 'facility_email' | 'permit_number' | 'certification_number'> | null
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
.select('id, user_id, organization_id, full_name, role, created_at, inspector_role_or_title, technician_license_number, inspector_phone, inspector_email, timezone, default_signature_path, use_default_signature, theme_preference')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return null
  }

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('id, name, industry, stripe_customer_id, stripe_subscription_id, plan, subscription_status, current_period_end, trial_ends_at, billing_started_at, included_seats, additional_seats, seat_packs')
    .eq('id', profile.organization_id)
    .single()

  if (organizationError || !organization) {
    return null
  }

  const { data: companyProfile } = await supabase
    .from('company_profiles')
    .select('company_name, facility_name, facility_number, facility_address_line_1, facility_address_line_2, facility_city, facility_region, facility_postal_code, facility_country, facility_phone, facility_email, permit_number, certification_number')
    .eq('organization_id', profile.organization_id)
    .maybeSingle()

  return {
    id: profile.id,
    user_id: profile.user_id,
    organization_id: profile.organization_id,
    full_name: profile.full_name,
    role: profile.role,
    created_at: profile.created_at,
    inspector_role_or_title: profile.inspector_role_or_title,
    technician_license_number: profile.technician_license_number,
    inspector_phone: profile.inspector_phone,
    inspector_email: profile.inspector_email,
    timezone: profile.timezone,
    default_signature_path: profile.default_signature_path,
    use_default_signature: profile.use_default_signature,
    theme_preference: profile.theme_preference,
    organization,
    company_profile: companyProfile,
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
