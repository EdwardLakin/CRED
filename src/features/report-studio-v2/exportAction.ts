'use server'

import { saveBrandingAndExport } from '@/features/branding/actions'
import { saveReportSummaryFromStudio } from '@/features/reports/actions'

type ExportState = { ok: boolean; error?: string; redirectTo?: string }

export async function saveReportStudioDraftAndExport(
  previousState: ExportState,
  formData: FormData,
): Promise<ExportState> {
  const summaryResult = await saveReportSummaryFromStudio({ ok: false }, formData)
  if (!summaryResult.ok) {
    return { ok: false, error: summaryResult.error ?? 'Unable to save the report summary before export.' }
  }
  const result = await saveBrandingAndExport(previousState, formData)
  return (result ?? { ok: false, error: 'Unable to start report export.' }) as ExportState
}
