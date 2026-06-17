'use server'

import { cookies } from 'next/headers'

import { createClient } from '@/lib/supabase/server'

import type { ThemeMode } from './ThemeProvider'

const THEME_OPTIONS = new Set<ThemeMode>(['light', 'dark', 'system'])
const THEME_COOKIE_KEY = 'cred-theme'

export async function saveThemePreference(mode: ThemeMode) {
  if (!THEME_OPTIONS.has(mode)) {
    return { ok: false }
  }

  const cookieStore = await cookies()
  cookieStore.set(THEME_COOKIE_KEY, mode, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: true }
  }

  const { error } = await supabase.from('profiles').update({ theme_preference: mode }).eq('user_id', user.id)

  return { ok: !error }
}
