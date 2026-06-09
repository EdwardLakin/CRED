import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/env'

import type { Database } from './database.types'

export async function createClient() {
  const cookieStore = await cookies()
  const requestCookies = new Map(cookieStore.getAll().map((cookie) => [cookie.name, cookie.value]))

  return createServerClient<Database>(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return Array.from(requestCookies.entries()).map(([name, value]) => ({ name, value }))
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) => {
            requestCookies.set(name, value)
          })

          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Server Components cannot write cookies. Server Actions and Route Handlers can,
            // and the in-memory request cookie map above still preserves auth state for this client.
          }
        },
      },
    },
  )
}
