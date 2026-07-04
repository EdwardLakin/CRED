import type { WorkspaceBrandProfile } from "@/features/branding/types";
import type { WorkspaceReportTemplate } from "@/features/branding/templates";

export type ReportStudioSection = "cover" | "header" | "summary" | "clientAsset" | "evidence" | "footer" | "signature" | "colors" | "typography";
export type EvidenceItem = { id: string; label: string; note: string | null; mediaKind: string | null; thumbnailUrl: string | null; originalUrl?: string | null };
export type ReportStudioSession = { id: string; display_id: string | null; title: string | null; status: string | null; review_status: string | null; updated_at: string | null; customer_name: string | null; asset_label: string | null; report_draft_id?: string | null; report_summary?: string | null; evidence: EvidenceItem[] };
export type ReportStudioAssets = { logoUrl?: string | null; darkLogoUrl?: string | null; iconUrl?: string | null; signatureUrl?: string | null };
export type ReportStudioProps = ReportStudioAssets & { profile: WorkspaceBrandProfile; templates: WorkspaceReportTemplate[]; sessions: ReportStudioSession[]; selectedSessionId: string | null; notices?: Record<string, string | undefined> };
