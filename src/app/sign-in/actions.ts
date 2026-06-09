'use server'

import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@/features/auth/server'
import { createClient } from '@/lib/supabase/server'

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect(`/sign-in?error=${encodeURIComponent(error.message)}`)
  }

  const profile = await getCurrentProfile()
  redirect(profile ? '/dashboard' : '/onboarding')
}
