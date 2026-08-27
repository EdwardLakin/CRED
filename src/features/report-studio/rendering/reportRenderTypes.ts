import type { BrandColors, ReportStyle, TypographySettings, WorkspaceBrandProfile } from '@/features/branding/types'
import type { FinalReportSnapshot } from '@/features/reports/final-report-snapshot'

export type ReportRenderEvidence = { id: string; label: string; note: string | null; mediaKind: string | null; thumbnailUrl: string | null; originalUrl: string | null }
export type ReportRenderSession = { id: string; display_id: string | null; title: string; status: string; review_status?: string | null; customer_name?: string | null; asset_label?: string | null; evidence?: ReportRenderEvidence[]; snapshot?: FinalReportSnapshot }
export type ReportRenderModel = { title: string; reportId: string; date: string; customer: string; asset: string; visibleSections: string[]; evidence: ReportRenderEvidence[]; snapshot: FinalReportSnapshot; cover: ReportStyle; header: { layout: WorkspaceBrandProfile['header_layout'] }; footer: { layout: WorkspaceBrandProfile['footer_layout']; text: string | null }; signature: { enabled: boolean; layout: ReportStyle['signatureLayout'] }; colors: BrandColors; typography: TypographySettings; layout: ReportStyle; templateId: string | null }
