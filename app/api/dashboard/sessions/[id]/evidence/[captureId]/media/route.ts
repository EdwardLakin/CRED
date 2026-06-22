import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";

import { requireSessionWorkspace } from "@/features/sessions/data";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const CAPTURE_BUCKET = "documentation-captures";

type RouteContext = {
  params: Promise<{ id: string; captureId: string }>;
};

type SessionRow = Database["public"]["Tables"]["documentation_sessions"]["Row"];

function cleanMediaError(status = 404) {
  return new Response("Media unavailable for this report.", {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function getSafeDownloadFilename(storagePath: string, fallbackId: string) {
  const rawName = storagePath.split('/').pop() || `evidence-${fallbackId}`;
  const safeName = rawName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return safeName || `evidence-${fallbackId}`;
}

async function validateShareTokenAccess(
  supabase: SupabaseClient<Database>,
  token: string,
  sessionId: string,
) {
  const { data: shareToken, error } = await supabase
    .from("report_share_tokens")
    .select("*, documentation_sessions(*)")
    .eq("token", token)
    .maybeSingle();

  const sharedSession = Array.isArray(shareToken?.documentation_sessions)
    ? shareToken.documentation_sessions[0]
    : shareToken?.documentation_sessions;

  if (
    error ||
    !shareToken ||
    !sharedSession ||
    shareToken.disabled_at ||
    sharedSession.id !== sessionId ||
    sharedSession.organization_id !== shareToken.organization_id ||
    (shareToken.expires_at && new Date(shareToken.expires_at) < new Date())
  ) {
    notFound();
  }

  return {
    session: sharedSession as SessionRow,
    organizationId: shareToken.organization_id,
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id, captureId } = await params;
  const requestUrl = new URL(request.url);
  const shareToken = requestUrl.searchParams.get("share_token");
  const download = requestUrl.searchParams.get("download") === "1";

  let supabase: SupabaseClient<Database>;
  let organizationId: string;

  try {
    if (shareToken) {
      supabase = createAdminClient();
      ({ organizationId } = await validateShareTokenAccess(supabase, shareToken, id));
    } else {
      const workspace = await requireSessionWorkspace();
      supabase = workspace.supabase;
      organizationId = workspace.profile.organization_id;

      const { data: session, error: sessionError } = await supabase
        .from("documentation_sessions")
        .select("id")
        .eq("id", id)
        .eq("organization_id", organizationId)
        .single();
      if (sessionError || !session) notFound();
    }

    const { data: capture, error: captureError } = await supabase
      .from("capture_items")
      .select("id, documentation_session_id, organization_id, storage_path, include_in_report, deleted_at, media_kind, type")
      .eq("id", captureId)
      .eq("documentation_session_id", id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (captureError || !capture || !capture.storage_path) {
      console.warn("[report-media-capture-unavailable]", {
        session_id: id,
        capture_id: captureId,
        storage_path_exists: Boolean(capture?.storage_path),
        error: captureError?.message ?? (!capture ? "Capture not found" : "Missing storage_path"),
      });
      return cleanMediaError(capture ? 410 : 404);
    }

    if (download) {
      const { data, error } = await supabase.storage
        .from(CAPTURE_BUCKET)
        .download(capture.storage_path);

      if (!data || error) {
        console.warn("[report-media-capture-download]", {
          session_id: id,
          capture_id: captureId,
          storage_path_exists: true,
          error: error?.message ?? "No file returned",
        });
        return cleanMediaError(410);
      }

      const filename = getSafeDownloadFilename(capture.storage_path, capture.id);
      return new Response(data.stream(), {
        status: 200,
        headers: {
          "Content-Type": data.type || "application/octet-stream",
          "Content-Length": String(data.size),
          "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const { data, error } = await supabase.storage
      .from(CAPTURE_BUCKET)
      .createSignedUrl(capture.storage_path, 60 * 10);

    if (!data?.signedUrl) {
      console.warn("[report-media-capture-signing]", {
        session_id: id,
        capture_id: captureId,
        storage_path_exists: true,
        error: error?.message ?? "No signed URL returned",
      });
      return cleanMediaError(410);
    }

    return Response.redirect(data.signedUrl, 302);
  } catch (error) {
    console.warn("[report-media-capture-error]", {
      session_id: id,
      capture_id: captureId,
      storage_path_exists: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return cleanMediaError(404);
  }
}
