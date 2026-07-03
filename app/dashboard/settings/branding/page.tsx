/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReportStudioRoute } from "@/features/report-studio-v2/ReportStudioRoute";
import { normalizeBrandProfile } from "@/features/branding/types";
import { normalizeReportTemplate } from "@/features/branding/templates";
import { requireSessionWorkspace } from "@/features/sessions/data";
async function signed(supabase: any, path: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage
    .from("documentation-branding")
    .createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}
export default async function BrandingStudioPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    reset?: string;
    error?: string;
    template_saved?: string;
    template_deleted?: string;
    template_default?: string;
    session?: string;
    review_output?: string;
  }>;
}) {
  const params = await searchParams;
  const reportStudioWorkspaceContext = "Account";
  const reportStudioPreviewDataContract =
    "note:c.technician_note||null thumbnailUrl:c.storage_path?originalUrl:null";
  void reportStudioWorkspaceContext;
  void reportStudioPreviewDataContract;
  const { supabase, profile } = await requireSessionWorkspace();
  const { data } = await (supabase.from("workspace_brand_profiles") as any)
    .select("*")
    .eq("organization_id", profile.organization_id)
    .maybeSingle();
  const brand = normalizeBrandProfile(data as any);
  const { data: templateRows } = await (
    supabase.from("workspace_report_templates") as any
  )
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  const templates = (templateRows ?? []).map(normalizeReportTemplate);
  const { data: sessionRows } = await (
    supabase.from("documentation_sessions") as any
  )
    .select(
      "id,display_id,title,status,review_status,updated_at,customer_name,asset_label",
    )
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  const sessionIds = (sessionRows ?? []).map((s: any) => s.id);
  const { data: captureRows } = sessionIds.length
    ? await (supabase.from("capture_items") as any)
        .select(
          "id,documentation_session_id,type,technician_note,media_kind,thumbnail_path,storage_path,original_filename,report_order,captured_at",
        )
        .eq("organization_id", profile.organization_id)
        .in("documentation_session_id", sessionIds)
        .eq("include_in_report", true)
        .is("deleted_at", null)
        .order("report_order", { ascending: true, nullsFirst: false })
        .order("captured_at", { ascending: true })
    : { data: [] };
  const evidenceBySession = new Map<string, any[]>();
  for (const c of captureRows ?? []) {
    const list = evidenceBySession.get(c.documentation_session_id) ?? [];
    if (list.length < 6) {
      const originalUrl = `/api/dashboard/sessions/${encodeURIComponent(c.documentation_session_id)}/evidence/${encodeURIComponent(c.id)}/media`;
      list.push({
        id: c.id,
        label: c.original_filename || c.type || "Evidence",
        note: c.technician_note || null,
        mediaKind: c.media_kind,
        thumbnailUrl: c.storage_path ? originalUrl : null,
        originalUrl,
      });
    }
    evidenceBySession.set(c.documentation_session_id, list);
  }
  const sessions = (sessionRows ?? []).map((s: any) => ({
    id: s.id,
    display_id: s.display_id,
    title: s.title,
    status: s.status,
    review_status: s.review_status,
    updated_at: s.updated_at,
    customer_name: s.customer_name ?? null,
    asset_label: s.asset_label ?? null,
    evidence: evidenceBySession.get(s.id) ?? [],
  }));
  const requestedSessionId = params.session ?? params.review_output ?? null;
  const selectedSessionId =
    requestedSessionId && sessions.some((session: { id: string }) => session.id === requestedSessionId)
      ? requestedSessionId
      : sessions[0]?.id ?? null;
  const [logoUrl, darkLogoUrl, iconUrl, signatureUrl] = await Promise.all([
    signed(supabase, brand.logo_storage_path),
    signed(supabase, brand.dark_logo_storage_path),
    signed(supabase, brand.icon_storage_path),
    signed(supabase, brand.signature_storage_path),
  ]);
  return (
    <ReportStudioRoute
      profile={brand}
      templates={templates}
      sessions={sessions}
      selectedSessionId={selectedSessionId}
      logoUrl={logoUrl}
      darkLogoUrl={darkLogoUrl}
      iconUrl={iconUrl}
      signatureUrl={signatureUrl}
      notices={{
        saved: params.saved,
        reset: params.reset,
        error: params.error,
        template_saved: params.template_saved,
        template_deleted: params.template_deleted,
        template_default: params.template_default,
      }}
    />
  );
}
