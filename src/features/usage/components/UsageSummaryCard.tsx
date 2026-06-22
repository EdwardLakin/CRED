import { Card } from '@/components/ui'
import { formatBytes, getPlanLimits } from '@/features/billing'
import { getCurrentUsage, isAiUsageLimitExempt } from '@/features/usage/limits'
import type { OrganizationPlan } from '@/lib/stripe'
import type { Database } from '@/lib/supabase/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'

type UsageMetricProps = {
  label: string
  used: string
  limit: string
  percent: number | null
}

function UsageMetric({ label, used, limit, percent }: UsageMetricProps) {
  const safePercent = percent === null ? null : Math.min(Math.max(percent, 0), 100)

  return (
    <div className="usage-metric">
      <div className="guided-progress-meta">
        <strong>{label}</strong>
        <span>
          {percent === null ? `${used} used · ${limit}` : `${used} / ${limit}`}
        </span>
      </div>
      <div className="guided-progress-track" aria-hidden="true">
        <div className="guided-progress-fill" style={{ width: safePercent === null ? '0%' : `${safePercent}%` }} />
      </div>
    </div>
  )
}

export async function UsageSummaryCard({
  organizationId,
  plan,
  supabase,
}: {
  organizationId: string
  plan: OrganizationPlan | null
  supabase: SupabaseClient<Database>
}) {
  const limits = getPlanLimits(plan)
  const usage = await getCurrentUsage(supabase, organizationId)
  const aiLimitExempt = isAiUsageLimitExempt(organizationId)

  return (
    <Card className="dashboard-card workspace-card usage-summary-card">
      <div className="section-header">
        <div>
          <p className="eyebrow">Usage</p>
          <h2>Plan usage</h2>
          <p className="muted">Approximate storage plus monthly AI actions and report emails.</p>
        </div>
      </div>
      <div className="usage-summary-grid">
        <UsageMetric
          label="Storage"
          used={formatBytes(usage.storageBytes)}
          limit={formatBytes(limits.storageBytes)}
          percent={(usage.storageBytes / limits.storageBytes) * 100}
        />
        <UsageMetric
          label="AI actions"
          used={usage.aiActionsThisMonth.toLocaleString()}
          limit={aiLimitExempt ? 'Unlimited' : limits.aiActionsPerMonth.toLocaleString()}
          percent={aiLimitExempt ? null : (usage.aiActionsThisMonth / limits.aiActionsPerMonth) * 100}
        />
        <UsageMetric
          label="Email sends"
          used={usage.emailSendsThisMonth.toLocaleString()}
          limit={limits.emailSendsPerMonth.toLocaleString()}
          percent={(usage.emailSendsThisMonth / limits.emailSendsPerMonth) * 100}
        />
      </div>
    </Card>
  )
}
