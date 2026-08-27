/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReportStudioRoute } from "@/features/report-studio-v2/ReportStudioRoute";
import { normalizeBrandProfile } from "@/features/branding/types";
import { normalizeReportTemplate } from "@/features/branding/templates";
import { requireSessionWorkspace } from "@/features/sessions/data";
import {
  buildFinalReportSnapshot,
  type FinalReportDocument,
  type FinalReportItem,
  type FinalReportMedia,
} from "@/features/reports/final-report-snapshot";
async function signed(supabase: any, path: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage
    .from("documentation-branding")
    .createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

function isStudioDocument(capture: any) {
  const extracted =
    capture?.extracted_data && typeof capture.extracted_data === "object"
      ? capture.extracted_data
      : {};
  const metadata =
    extracted?.metadata && typeof extracted.metadata === "object"
      ? extracted.metadata
      : {};
  return (
    capture?.media_kind === "document" ||
    extracted.source_document === true ||
    extracted.reference_document === true ||
    metadata.source_document === true ||
    metadata.reference_document === true
  );
}

function studioMediaKind(capture: any): FinalReportMedia["kind"] {
  if (isStudioDocument(capture)) return "document";
  if (capture?.media_kind === "note" || capture?.type === "text_note")
    return "note";
  if (capture?.media_kind === "video" || capture?.type === "video")
    return "video";
  if (capture?.media_kind === "audio" || capture?.type === "voice_note")
    return "audio";
  if (
    capture?.media_kind === "image" ||
    capture?.type === "photo" ||
    /\.(?:jpe?g|png|webp|gif|heic)$/i.test(capture?.storage_path ?? "")
  )
    return "photo";
  return "file";
}

function studioItemText(capture: any) {
  return (
    capture?.customer_facing_observation?.trim() ||
    capture?.technician_note?.trim() ||
    capture?.transcript?.trim() ||
    ""
  );
}

function studioItemTitle(capture: any, index: number) {
  const note = studioItemText(capture);
  return (
    note.split(/[.;\n]/)[0]?.trim().slice(0, 90) ||
    `Documented item ${String(index + 1).padStart(2, "0")}`
  );
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
  const { data: draftRows } = sessionIds.length
    ? await (supabase.from("ai_report_drafts") as any)
        .select("id,documentation_session_id,status,summary,generated_at,created_at")
        .eq("organization_id", profile.organization_id)
        .in("documentation_session_id", sessionIds)
        .order("generated_at", { ascending: false })
        .order("created_at", { ascending: false })
    : { data: [] };
  const canonicalDraftBySession = new Map<string, any>();
  for (const draft of draftRows ?? []) {
    const current = canonicalDraftBySession.get(draft.documentation_session_id);
    if (!current || draft.status === "approved" || current.status === "superseded") {
      canonicalDraftBySession.set(draft.documentation_session_id, draft);
    }
  }
  const { data: captureRows } = sessionIds.length
    ? await (supabase.from("capture_items") as any)
        .select(
          "id,documentation_session_id,type,technician_note,customer_facing_observation,transcript,media_kind,thumbnail_path,storage_path,report_order,captured_at,observation_group_id,group_order,extracted_data,evidence_category",
        )
        .eq("organization_id", profile.organization_id)
        .in("documentation_session_id", sessionIds)
        .eq("include_in_report", true)
        .is("deleted_at", null)
        .order("report_order", { ascending: true, nullsFirst: false })
        .order("captured_at", { ascending: true })
    : { data: [] };
  const evidenceBySession = new Map<string, any[]>();
  const capturesBySession = new Map<string, any[]>();
  for (const c of captureRows ?? []) {
    const allItems = capturesBySession.get(c.documentation_session_id) ?? [];
    allItems.push(c);
    capturesBySession.set(c.documentation_session_id, allItems);
    const list = evidenceBySession.get(c.documentation_session_id) ?? [];
    if (list.length < 12) {
      const originalUrl = `/api/dashboard/sessions/${encodeURIComponent(c.documentation_session_id)}/evidence/${encodeURIComponent(c.id)}/media`;
      list.push({
        id: c.id,
        label: studioItemTitle(c, list.length),
        note: studioItemText(c) || null,
        mediaKind: c.media_kind,
        thumbnailUrl: c.storage_path ? originalUrl : null,
        originalUrl,
      });
    }
    evidenceBySession.set(c.documentation_session_id, list);
  }
  const sessions = (sessionRows ?? []).map((s: any) => {
    const sessionCaptures = capturesBySession.get(s.id) ?? [];
    const media: FinalReportMedia[] = sessionCaptures.map((capture) => ({
      id: capture.id,
      kind: studioMediaKind(capture),
      label: studioItemTitle(capture, 0),
      capturedAt: capture.captured_at ?? null,
    }));
    const itemGroups = new Map<string, any[]>();
    const documentCaptures: any[] = [];
    for (const capture of sessionCaptures) {
      if (isStudioDocument(capture)) {
        documentCaptures.push(capture);
        continue;
      }
      const key = capture.observation_group_id || capture.id;
      const group = itemGroups.get(key) ?? [];
      group.push(capture);
      itemGroups.set(key, group);
    }
    const items: FinalReportItem[] = Array.from(itemGroups.entries()).map(
      ([groupId, group], index) => {
        const ordered = [...group].sort(
          (left, right) =>
            Number(left.group_order ?? left.report_order ?? 0) -
            Number(right.group_order ?? right.report_order ?? 0),
        );
        const primary = ordered[0];
        const title = studioItemTitle(primary, index);
        const note = studioItemText(primary);
        return {
          id: groupId,
          title,
          description: note === title ? "" : note,
          category: primary?.evidence_category ?? null,
          details: [],
          recommendations: [],
          mediaIds: ordered
            .filter((capture) => studioMediaKind(capture) === "photo")
            .map((capture) => capture.id),
        };
      },
    );
    const documents: FinalReportDocument[] = documentCaptures.map(
      (capture, index) => ({
        id: capture.id,
        title: studioItemTitle(capture, index),
        summary: studioItemText(capture),
        details: [],
        mediaId: capture.id,
      }),
    );
    const draft = canonicalDraftBySession.get(s.id);
    const snapshot = buildFinalReportSnapshot({
      sourceDraftId: draft?.id ?? null,
      sessionId: s.id,
      reportId: s.display_id ?? s.id,
      organizationName: profile.organization.name,
      reportTitle: s.title || "Executive Report",
      reportType: "Documentation Report",
      reportDate: s.updated_at ?? new Date().toISOString(),
      summary: draft?.summary ?? null,
      identity: [
        { label: "Customer / Client", value: s.customer_name ?? "" },
        { label: "Asset / Equipment", value: s.asset_label ?? "" },
      ],
      media,
      items,
      documents,
      status: draft?.status ?? s.review_status ?? s.status,
      approved:
        draft?.status === "approved" || s.review_status === "ready_for_delivery",
    });
    return {
      id: s.id,
      display_id: s.display_id,
      title: s.title,
      status: s.status,
      review_status: s.review_status,
      updated_at: s.updated_at,
      customer_name: s.customer_name ?? null,
      asset_label: s.asset_label ?? null,
      report_draft_id: draft?.id ?? null,
      report_summary: draft?.summary ?? null,
      evidence: evidenceBySession.get(s.id) ?? [],
      snapshot,
    };
  });
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
