import { NextResponse, type NextRequest } from 'next/server'

import { getCurrentProfile } from '@/features/auth/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(error.message)}`, requestUrl.origin))
    }
  }

  const profile = await getCurrentProfile()
  const destination = profile ? next ?? '/dashboard' : '/onboarding'

  return NextResponse.redirect(new URL(destination, requestUrl.origin))
}
