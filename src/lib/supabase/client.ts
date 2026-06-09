import { createBrowserClient } from '@supabase/ssr'

import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/env'

import type { Database } from './database.types'

export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey())
}
