export function formatReportEventLabel(exportType: string, status?: string | null) {
  if (exportType === 'printable_report_opened') return 'Printable report opened'
  if (exportType === 'saved_report') return status === 'saved' ? 'Printable report saved' : 'Saved report'
  if (exportType === 'email') return 'Printable report emailed'
  if (exportType === 'share_link') return 'Share link created'
  if (exportType === 'pdf_generated') return 'Printable report opened'

  return exportType.replace(/_/g, ' ')
}
