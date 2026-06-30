import type { Database } from "@/lib/supabase/database.types";
import type { WorkspaceBrandProfile } from "@/features/branding/types";

export type ReportCapture = Database["public"]["Tables"]["capture_items"]["Row"];
export type ReportSignature = Database["public"]["Tables"]["signature_captures"]["Row"];
export type ReportDraft = Database["public"]["Tables"]["ai_report_drafts"]["Row"];
export type ReportSession =
  Database["public"]["Tables"]["documentation_sessions"]["Row"] & {
    organizations: { name: string } | null;
  };

export type ExportBranding = WorkspaceBrandProfile;

export type ExportImageAsset = {
  classification: "webSafeImage" | "nonWebSafeImage";
  mediaUrl?: string;
  originalMediaUrl?: string;
  reason?: string;
};
