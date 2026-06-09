'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@/features/auth/server'
import { createClient } from '@/lib/supabase/server'

export async function signUp(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const origin = (await headers()).get('origin')

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin ?? ''}/auth/callback`,
    },
  })

  if (error) {
    redirect(`/sign-up?error=${encodeURIComponent(error.message)}`)
  }

  if (!data.session) {
    redirect('/sign-in?message=Check%20your%20email%20to%20confirm%20your%20account%2C%20then%20sign%20in.')
  }

  const profile = await getCurrentProfile()
  redirect(profile ? '/dashboard' : '/onboarding')
}
