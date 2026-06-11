import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { getSupabaseServiceRoleKey, getSupabaseUrl } from '@/lib/env'

import type { Database } from './database.types'

export function createAdminClient() {
  return createSupabaseClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
