'use server'

import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import type { Industry } from '@/lib/supabase/database.types'

type SafeOnboardingError = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

const ONBOARDING_ERROR_MESSAGES = {
  organization: 'We could not create your organization. Please try again.',
  profile: 'We could not create your profile. Please try again.',
  company_profile: 'We could not save your company profile. Please try again.',
} as const

function redirectWithOnboardingError(
  step: 'organization' | 'profile' | 'company_profile',
  error: SafeOnboardingError | null,
  hasUser: boolean,
): never {
  console.error('Onboarding creation failed', {
    step,
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    hasUser,
  })

  redirect(`/onboarding?error=${encodeURIComponent(ONBOARDING_ERROR_MESSAGES[step])}`)
}

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
  const fullName = String(formData.get('fullName') ?? '').trim()
  const companyName = String(formData.get('companyName') ?? '').trim()
  const industryValue = String(formData.get('industry') ?? '')

  if (!fullName || !companyName || !INDUSTRIES.has(industryValue)) {
    redirect('/onboarding?error=Please%20complete%20all%20onboarding%20fields.')
  }

  const industry = industryValue as Industry
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  console.error('Onboarding auth diagnostic', {
    hasUser: Boolean(user),
    hasSessionUserId: Boolean(user?.id),
  })

  if (!user) {
    redirect('/sign-in?message=session-expired')
  }

  const hasUser = Boolean(user)

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .insert({ name: companyName })
    .select('id')
    .single()

  if (organizationError || !organization) {
    redirectWithOnboardingError('organization', organizationError, hasUser)
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: user.id,
    organization_id: organization.id,
    full_name: fullName,
    role: 'owner',
  })

  if (profileError) {
    redirectWithOnboardingError('profile', profileError, hasUser)
  }

  const { error: companyProfileError } = await supabase.from('company_profiles').insert({
    organization_id: organization.id,
    industry,
  })

  if (companyProfileError) {
    redirectWithOnboardingError('company_profile', companyProfileError, hasUser)
  }

  redirect('/dashboard')
}
