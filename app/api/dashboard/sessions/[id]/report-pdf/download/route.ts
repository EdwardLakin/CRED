import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { requireActiveBillingAccess } from "@/features/billing";
import { getDisplayReportTitle } from "@/features/reports/report-title";
import { collectPdfImages, renderReportPdf } from "@/features/reports/export/pdf-generator";
import { safeReportPdfFileName } from "@/features/reports/export/filenames";
import { requireSessionWorkspace } from "@/features/sessions/data";
import { recordUsageEvent } from "@/features/usage";

export const runtime = "nodejs";

export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function getRequestOrigin(request: Request, headersList: Headers) {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ??
    process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");
  const requestUrl = new URL(request.url);
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, "")}`;
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? requestUrl.host;
  const protocol = headersList.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "") ?? "https";
  return `${protocol}://${host}`;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const workspace = await requireSessionWorkspace();
  const billingAccess = requireActiveBillingAccess(workspace.profile);

  if (!billingAccess.ok) {
    redirect(
      `/dashboard/sessions/${id}/report?error=${encodeURIComponent(billingAccess.message)}`,
    );
  }

  const { data: session, error: sessionError } = await workspace.supabase
    .from("documentation_sessions")
    .select("*, organizations(name)")
    .eq("id", id)
    .eq("organization_id", workspace.profile.organization_id)
    .single();

  if (sessionError || !session) notFound();

  const requestUrl = new URL(request.url);
  const internalPreview = requestUrl.searchParams.get("preview") === "1" && process.env.NODE_ENV !== "production";
  if (!internalPreview && session.review_status !== "ready_for_delivery") {
    redirect(
      `/dashboard/sessions/${id}/report?error=${encodeURIComponent("Approve this report before downloading the PDF.")}`,
    );
  }

  const { data: reportDrafts } = await workspace.supabase
    .from("ai_report_drafts")
    .select("*")
    .eq("documentation_session_id", session.id)
    .eq("organization_id", workspace.profile.organization_id)
    .order("generated_at", { ascending: false })
    .order("created_at", { ascending: false });
  const reportDraft =
    (reportDrafts ?? []).find((draft) => draft.status === "approved") ??
    (reportDrafts ?? []).find((draft) => draft.status !== "superseded") ??
    reportDrafts?.[0] ??
    null;
  const title = getDisplayReportTitle(reportDraft, session, { genericFallback: true });
  const generatedAt = new Date();
  const fileName = safeReportPdfFileName(title, generatedAt);
  const headersList = await headers();
  const origin = getRequestOrigin(request, headersList);
  const cookie = headersList.get("cookie") ?? "";
  const htmlUrl = `${origin}/api/dashboard/sessions/${encodeURIComponent(session.id)}/report-pdf?preview=1`;
  const forwardedHeaders: HeadersInit = cookie ? { cookie } : {};
  const htmlResponse = await fetch(htmlUrl, { headers: forwardedHeaders, cache: "no-store" });
  if (!htmlResponse.ok) {
    return new Response("Unable to render report HTML for PDF generation.", { status: 502 });
  }
  const html = await htmlResponse.text();
  const images = await collectPdfImages(html, origin, forwardedHeaders);
  const pdf = renderReportPdf({ html, title, images, generatedAt });

  await workspace.supabase.from("exports").insert({
    documentation_session_id: session.id,
    organization_id: workspace.profile.organization_id,
    export_type: "pdf_report_downloaded",
    status: "completed",
    created_by: workspace.profile.id,
    metadata: {
      item_count: images.length,
      format: "pdf",
      file_name: fileName,
      generated_at: generatedAt.toISOString(),
    },
  });
  await recordUsageEvent({
    supabase: workspace.supabase,
    organizationId: workspace.profile.organization_id,
    eventType: "pdf_report_downloaded",
    metadata: {
      session_id: session.id,
      item_count: images.length,
      format: "pdf",
      file_name: fileName,
      generated_at: generatedAt.toISOString(),
    },
    createdBy: workspace.profile.id,
  });

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
