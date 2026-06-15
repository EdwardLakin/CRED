import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

export async function getSessionAiCostSummary(supabase: SupabaseClient<Database>, sessionId: string) {
  const { data, error } = await (supabase as SupabaseClient)
    .from('ai_usage_events')
    .select('estimated_cost_cents,input_tokens,output_tokens,image_count,operation')
    .eq('documentation_session_id', sessionId)
  if (error) throw error
  return summarizeUsage(data ?? [])
}

export async function getOrganizationAiCostSummary(supabase: SupabaseClient<Database>, organizationId: string) {
  const { data, error } = await (supabase as SupabaseClient)
    .from('ai_usage_events')
    .select('estimated_cost_cents,input_tokens,output_tokens,image_count,operation')
    .eq('organization_id', organizationId)
  if (error) throw error
  return summarizeUsage(data ?? [])
}

function summarizeUsage(rows: Array<{ estimated_cost_cents: number; input_tokens: number; output_tokens: number; image_count: number; operation: string }>) {
  return rows.reduce(
    (summary, row) => {
      summary.estimatedCostCents += row.estimated_cost_cents
      summary.inputTokens += row.input_tokens
      summary.outputTokens += row.output_tokens
      summary.imageCount += row.image_count
      summary.byOperation[row.operation] = (summary.byOperation[row.operation] ?? 0) + row.estimated_cost_cents
      return summary
    },
    { estimatedCostCents: 0, inputTokens: 0, outputTokens: 0, imageCount: 0, byOperation: {} as Record<string, number> },
  )
}
