import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";

import { requireSessionWorkspace } from "@/features/sessions/data";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const SIGNATURE_BUCKET = "documentation-signatures";
const DEFAULT_SIGNATURE_ID = "__default_signature";

type RouteContext = {
  params: Promise<{ id: string; signatureId: string }>;
};

type SessionRow = Database["public"]["Tables"]["documentation_sessions"]["Row"];

function cleanMediaError(status = 404) {
  return new Response("Media unavailable for this report.", {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
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
    .eq("link_kind", "report")
    .is("deliverable_id", null)
    .maybeSingle();

  const sharedSession = Array.isArray(shareToken?.documentation_sessions)
    ? shareToken.documentation_sessions[0]
    : shareToken?.documentation_sessions;

  if (
    error ||
    !shareToken ||
    !sharedSession ||
    shareToken.disabled_at ||
    sharedSession.deleted_at ||
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
  const { id, signatureId } = await params;
  const requestUrl = new URL(request.url);
  const shareToken = requestUrl.searchParams.get("share_token");
  const download = requestUrl.searchParams.get("download") === "1";

  let supabase: SupabaseClient<Database>;
  let organizationId: string;
  let session: Pick<SessionRow, "id" | "created_by">;

  try {
    if (shareToken) {
      supabase = createAdminClient();
      const access = await validateShareTokenAccess(supabase, shareToken, id);
      organizationId = access.organizationId;
      session = access.session;
    } else {
      const workspace = await requireSessionWorkspace();
      supabase = workspace.supabase;
      organizationId = workspace.profile.organization_id;

      const { data: ownedSession, error: sessionError } = await supabase
        .from("documentation_sessions")
        .select("id, created_by")
        .eq("id", id)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .single();
      if (sessionError || !ownedSession) notFound();
      session = ownedSession;
    }

    let storagePath: string | null | undefined;

    if (signatureId === DEFAULT_SIGNATURE_ID) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("default_signature_path, use_default_signature")
        .eq("id", session.created_by)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (profileError || !profile?.use_default_signature) storagePath = null;
      else storagePath = profile.default_signature_path;
    } else {
      const { data: signature, error: signatureError } = await supabase
        .from("signature_captures")
        .select("id, documentation_session_id, organization_id, signature_image_path")
        .eq("id", signatureId)
        .eq("documentation_session_id", id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (signatureError) throw signatureError;
      storagePath = signature?.signature_image_path;
    }

    if (!storagePath) {
      console.warn("[report-media-signature-unavailable]", {
        session_id: id,
        signature_id: signatureId,
        storage_path_exists: false,
        error: "Missing signature storage path",
      });
      return cleanMediaError(404);
    }

    const { data, error } = await supabase.storage
      .from(SIGNATURE_BUCKET)
      .createSignedUrl(storagePath, 60 * 10, { download: download || undefined });

    if (!data?.signedUrl) {
      console.warn("[report-media-signature-signing]", {
        session_id: id,
        signature_id: signatureId,
        storage_path_exists: true,
        error: error?.message ?? "No signed URL returned",
      });
      return cleanMediaError(410);
    }

    return Response.redirect(data.signedUrl, 302);
  } catch (error) {
    console.warn("[report-media-signature-error]", {
      session_id: id,
      signature_id: signatureId,
      storage_path_exists: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return cleanMediaError(404);
  }
}
