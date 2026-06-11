'use server'

import { redirect } from 'next/navigation'

import { parseBillingPlan } from '@/features/billing'
import { createClient } from '@/lib/supabase/server'
type SafeOnboardingError = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

const ONBOARDING_ERROR_MESSAGES = {
  workspace: 'We could not create your workspace. Please try again.',
} as const

function redirectWithOnboardingError(
  step: 'workspace',
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
  const planValue = String(formData.get('plan') ?? '')
  const plan = parseBillingPlan(planValue) ?? 'individual'

  if (!fullName || !companyName || !INDUSTRIES.has(industryValue)) {
    redirect('/onboarding?error=Please%20complete%20all%20onboarding%20fields.')
  }

  const industry = industryValue
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

  const { data: organizationId, error: workspaceError } = await supabase.rpc(
    'create_onboarding_workspace',
    {
      p_full_name: fullName,
      p_company_name: companyName,
      p_industry: industry,
      p_plan: plan,
    },
  )

  if (workspaceError || !organizationId) {
    redirectWithOnboardingError('workspace', workspaceError, hasUser)
  }

  redirect('/dashboard')
}
