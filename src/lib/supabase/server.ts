import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/env'

import type { Database } from './database.types'

export async function createClient() {
  const cookieStore = await cookies()

  console.error('Supabase env diagnostic', {
    hasUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  })

  return createServerClient<Database>(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(
          cookiesToSet: Array<{
            name: string
            value: string
            options?: Parameters<typeof cookieStore.set>[2]
          }>,
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Server Components cannot write cookies. Middleware or Route Handlers can refresh them.
          }
        },
      },
    },
  )
}
