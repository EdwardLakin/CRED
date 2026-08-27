import type { WorkspaceBrandProfile } from '@/features/branding/types'
import { buildFinalReportSnapshot } from '@/features/reports/final-report-snapshot'
import type { ReportRenderModel, ReportRenderSession } from './reportRenderTypes'

export function buildReportRenderModel(input: { session?: ReportRenderSession | null; brand: WorkspaceBrandProfile; templateId?: string | null; date?: string }): ReportRenderModel {
  const { session, brand } = input
  const date = input.date || new Date().toISOString().slice(0, 10)
  const snapshot = session?.snapshot ?? buildFinalReportSnapshot({
    sessionId: session?.id || 'report-studio-preview',
    reportId: session?.display_id || session?.id || 'CRED-1042',
    organizationName: brand.display_name || 'CRED',
    reportTitle: session?.title || 'Workspace report',
    reportType: 'Documentation Report',
    reportDate: date,
    identity: [
      { label: 'Customer / Client', value: session?.customer_name || 'No customer recorded' },
      { label: 'Asset / Equipment', value: session?.asset_label || 'No asset recorded' },
    ],
    media: (session?.evidence || []).map((item) => ({ id: item.id, kind: item.mediaKind === 'document' ? 'document' : 'photo', label: item.label, capturedAt: null })),
    items: (session?.evidence || []).filter((item) => item.mediaKind !== 'document').map((item) => ({ id: item.id, title: item.label, description: item.note || '', category: null, details: [], recommendations: [], mediaIds: [item.id] })),
    documents: (session?.evidence || []).filter((item) => item.mediaKind === 'document').map((item) => ({ id: item.id, title: item.label, summary: item.note || '', details: [], mediaId: item.id })),
    status: session?.review_status || session?.status,
  })
  return {
    title: snapshot.reportTitle,
    reportId: snapshot.reportId,
    date,
    customer: session?.customer_name || 'No customer recorded',
    asset: session?.asset_label || 'No asset recorded',
    visibleSections: ['cover', 'header', 'details', 'items', ...(snapshot.documents.length ? ['documents'] : []), ...(brand.show_signature_block ? ['signature'] : []), 'footer'],
    evidence: session?.evidence || [],
    snapshot,
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
