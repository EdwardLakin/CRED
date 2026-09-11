'use server'

import { buildBrandingSettingsPayload, saveBrandingAndExport } from '@/features/branding/actions'
import { normalizeBrandProfile } from '@/features/branding/types'
import { templatePayloadFromBrand } from '@/features/branding/templates'
import { saveReportSummaryFromStudio } from '@/features/reports/actions'
import { requireSessionWorkspace } from '@/features/sessions/data'

export const STUDIO_EXPORT_TEMPLATE_NAME = '__report_studio_export_draft__'

type ExportState = { ok: boolean; error?: string; redirectTo?: string }

export async function saveReportStudioDraftAndExport(
  previousState: ExportState,
  formData: FormData,
): Promise<ExportState> {
  const summaryResult = await saveReportSummaryFromStudio({ ok: false }, formData)
  if (!summaryResult.ok) {
    return { ok: false, error: summaryResult.error ?? 'Unable to save the report summary before export.' }
  }

  const workspace = await requireSessionWorkspace()
  const current = (name: string) => String(formData.get(`current_${name}`) ?? '').trim() || null
  const payload = await buildBrandingSettingsPayload(formData, workspace.profile, {
    logo: current('logo'),
    darkLogo: current('dark_logo'),
    icon: current('icon'),
    signature: current('signature'),
  })
  const brand = normalizeBrandProfile(payload as never)
  const templatePayload = templatePayloadFromBrand(
    brand,
    workspace.profile.organization_id,
    workspace.profile.id,
    STUDIO_EXPORT_TEMPLATE_NAME,
    'Internal Report Studio export snapshot',
    false,
  )

  const { data: existing } = await (workspace.supabase.from('workspace_report_templates') as any)
    .select('id')
    .eq('organization_id', workspace.profile.organization_id)
    .eq('name', STUDIO_EXPORT_TEMPLATE_NAME)
    .maybeSingle()

  let templateId = existing?.id as string | undefined
  if (templateId) {
    const updatePayload = { ...templatePayload, updated_at: new Date().toISOString() } as any
    delete updatePayload.created_by
    const { error } = await (workspace.supabase.from('workspace_report_templates') as any)
      .update(updatePayload)
      .eq('id', templateId)
      .eq('organization_id', workspace.profile.organization_id)
    if (error) return { ok: false, error: error.message }
  } else {
    const { data, error } = await (workspace.supabase.from('workspace_report_templates') as any)
      .insert(templatePayload)
      .select('id')
      .single()
    if (error || !data?.id) return { ok: false, error: error?.message ?? 'Unable to snapshot the Report Studio draft.' }
    templateId = String(data.id)
  }

  if (!templateId) {
    return { ok: false, error: 'Unable to resolve the Report Studio export snapshot.' }
  }
  formData.set('selected_template_id', templateId)
  const result = await saveBrandingAndExport(previousState, formData)
  return (result ?? { ok: false, error: 'Unable to start report export.' }) as ExportState
}
