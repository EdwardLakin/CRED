import { requireProfile } from '@/features/auth/server'
import { createClient } from '@/lib/supabase/server'

export async function requireSessionWorkspace() {
  const profile = await requireProfile()
  const supabase = await createClient()

  return { supabase, profile }
}
