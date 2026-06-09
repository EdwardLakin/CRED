'use server'

import { redirect } from 'next/navigation'

import { requireUser } from '@/features/auth/server'
import { createClient } from '@/lib/supabase/server'
import type { Industry } from '@/lib/supabase/database.types'

const INDUSTRIES: ReadonlySet<string> = new Set([
  'Heavy Duty / Fleet',
  'Automotive',
  'Construction',
  'Electrician',
  'HVAC',
  'Plumbing',
  'Home Inspector',
  'Property Management',
  'Insurance / Claims',
  'Other',
])

export async function completeOnboarding(formData: FormData) {
  const user = await requireUser()
  const fullName = String(formData.get('fullName') ?? '').trim()
  const companyName = String(formData.get('companyName') ?? '').trim()
  const industryValue = String(formData.get('industry') ?? '')

  if (!fullName || !companyName || !INDUSTRIES.has(industryValue)) {
    redirect('/onboarding?error=Please%20complete%20all%20onboarding%20fields.')
  }

  const industry = industryValue as Industry
  const supabase = await createClient()

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .insert({ name: companyName, created_by: user.id })
    .select('id')
    .single()

  if (organizationError || !organization) {
    redirect(`/onboarding?error=${encodeURIComponent(organizationError?.message ?? 'Unable to create organization.')}`)
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: user.id,
    organization_id: organization.id,
    full_name: fullName,
    role: 'owner',
  })

  if (profileError) {
    redirect(`/onboarding?error=${encodeURIComponent(profileError.message)}`)
  }

  const { error: companyProfileError } = await supabase.from('company_profiles').insert({
    organization_id: organization.id,
    industry,
  })

  if (companyProfileError) {
    redirect(`/onboarding?error=${encodeURIComponent(companyProfileError.message)}`)
  }

  redirect('/dashboard')
}
