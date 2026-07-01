import type { WorkspaceBrandProfile } from '@/features/branding/types'
import type { ReportRenderModel, ReportRenderSession } from './reportRenderTypes'

export function buildReportRenderModel(input: { session?: ReportRenderSession | null; brand: WorkspaceBrandProfile; templateId?: string | null; date?: string }): ReportRenderModel {
  const { session, brand } = input
  return {
    title: session?.title || 'Workspace report',
    reportId: session?.display_id || session?.id || 'CRED-1042',
    date: input.date || new Date().toISOString().slice(0, 10),
    customer: session?.customer_name || 'No customer recorded',
    asset: session?.asset_label || 'No asset recorded',
    visibleSections: ['cover', 'header', 'details', 'evidence', ...(brand.show_signature_block ? ['signature'] : []), 'footer'],
    evidence: session?.evidence || [],
    cover: brand.report_style,
    header: { layout: brand.header_layout },
    footer: { layout: brand.footer_layout, text: brand.footer_text },
    signature: { enabled: brand.show_signature_block, layout: brand.report_style.signatureLayout },
    colors: brand.colors,
    typography: brand.typography,
    layout: brand.report_style,
    templateId: input.templateId || null,
  }
}
