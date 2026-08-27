import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { getPlanLimits, parseBillingPlan } from "@/features/billing";
import { AddCaptureForm, RecentCapturesList } from "@/features/capture";
import { CaptureSessionSnapshot } from "@/features/offline/CaptureSessionSnapshot";
import { completeCaptureAndPrepareReport } from "@/features/reports/actions";
import { getDisplayReportTitle } from "@/features/reports/report-title";
import { PendingActionButton } from "@/features/reports/review/PendingActionButton";
import { requireSessionWorkspace } from "@/features/sessions/data";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CaptureRoute404Reason =
  | "malformed_session_id"
  | "session_not_found_or_inaccessible"
  | "session_deleted"
  | "session_outside_current_organization";

function isLikelyPrefetch(requestHeaders: Headers) {
  return (
    requestHeaders.get("next-router-prefetch") === "1" ||
    requestHeaders.get("purpose") === "prefetch" ||
    requestHeaders.get("sec-purpose")?.includes("prefetch") === true
  );
}

function logCaptureRoute404(details: {
  reason: CaptureRoute404Reason;
  prefetched: boolean;
  supabaseCode?: string;
}) {
  console.warn("capture_route_session_404", {
    route: "/dashboard/sessions/[id]/capture",
    reason: details.reason,
    prefetched: details.prefetched,
    supabaseCode: details.supabaseCode,
  });
}

export default async function GuidedCapturePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    addTo?: string;
    captureSaved?: string;
    error?: "item_check_failed" | "no_items";
  }>;
}) {
  const { id } = await params;
  const { captureSaved, addTo, error } = await searchParams;
  const requestHeaders = await headers();
  const prefetched = isLikelyPrefetch(requestHeaders);
  const { supabase, profile } = await requireSessionWorkspace();

  if (!UUID_PATTERN.test(id)) {
    logCaptureRoute404({
      reason: "malformed_session_id",
      prefetched,
    });
    notFound();
  }

  const { data: session, error: sessionError } = await supabase
    .from("documentation_sessions")
    .select("*")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (sessionError || !session) {
    const { data: visibleSession } = await supabase
      .from("documentation_sessions")
      .select("organization_id, deleted_at")
      .eq("id", id)
      .maybeSingle();
    const reason = visibleSession?.deleted_at
      ? "session_deleted"
      : visibleSession?.organization_id && visibleSession.organization_id !== profile.organization_id
        ? "session_outside_current_organization"
        : "session_not_found_or_inaccessible";

    logCaptureRoute404({
      reason,
      prefetched,
      supabaseCode: sessionError?.code,
    });
    notFound();
  }

  if (session.deleted_at) {
    logCaptureRoute404({
      reason: "session_deleted",
      prefetched,
    });
    notFound();
  }

  const { data: captures } = await supabase
    .from("capture_items")
    .select("*")
    .eq("documentation_session_id", session.id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .order("captured_at", { ascending: false });

  const captureItems = captures ?? [];
  const { count: capturedItemCount } = await supabase
    .from("documentation_items")
    .select("id", { count: "exact", head: true })
    .eq("documentation_session_id", session.id)
    .eq("organization_id", profile.organization_id)
    .eq("item_kind", "observation")
    .is("deleted_at", null);
  const signedUrls: Record<string, string> = {};
  await Promise.all(
    captureItems.map(async (capture) => {
      if (!capture.storage_path) return;

      const { data } = await supabase.storage
        .from("documentation-captures")
        .createSignedUrl(capture.storage_path, 60 * 10);

      if (data?.signedUrl) {
        signedUrls[capture.id] = data.signedUrl;
      }
    }),
  );

  const planLimits = getPlanLimits(parseBillingPlan(profile.organization.plan));
  const displaySessionTitle = getDisplayReportTitle(null, session);
  const captureReturnPath =
    `/dashboard/sessions/${session.id}/capture#main-capture-card`;
  const captureDonePath =
    `/dashboard/sessions/${session.id}/report`;
  const completeCaptureAction = completeCaptureAndPrepareReport.bind(
    null,
    session.id,
  );

  return (
    <main className="page-shell dashboard-shell focused-capture-shell">
      <CaptureSessionSnapshot
        sessionId={session.id}
        organizationId={session.organization_id}
        userId={profile.user_id}
        title={displaySessionTitle}
        sessionType={session.session_type}
        data={{
          captureTitle: addTo
            ? "Add photos"
            : "Capture items",
          returnPath: captureReturnPath,
          donePath: captureDonePath,
          observationGroupId: addTo ?? null,
          maxCaptureFileSizeBytes:
            planLimits.maxCaptureFileSizeBytes,
          maxVideoFileSizeBytes:
            planLimits.maxVideoFileSizeBytes,
        }}
      />
      <div className="section-header page-header focused-capture-header">
        <div>
          <h1>{addTo ? "Add photos" : "Capture"}</h1>
          <p className="muted">{displaySessionTitle}</p>
          <p className="muted">
            Keep photos of the same subject together. Forms stay separate.
          </p>
        </div>
      </div>

      {captureSaved ? (
        <p className="success">
          Saved. Keep capturing or continue to review.
        </p>
      ) : null}
      {error === "no_items" ? (
        <p className="error">Save at least one item before continuing.</p>
      ) : null}
      {error === "item_check_failed" ? (
        <p className="error">
          CRED could not verify your saved items. Try again.
        </p>
      ) : null}

      <section
        className="card detail-card focused-capture-card"
        id="main-capture-card"
      >
        <AddCaptureForm
          sessionId={session.id}
          organizationId={session.organization_id}
          userId={profile.user_id}
          sessionType={session.session_type}
          returnPath={captureReturnPath}
          captureButtonLabel="Camera"
          helperText="Capture photos or choose media from your gallery."
          commonCaptureText=""
          showSuggestedCaptureText={false}
          maxCaptureFileSizeBytes={planLimits.maxCaptureFileSizeBytes}
          maxVideoFileSizeBytes={planLimits.maxVideoFileSizeBytes}
          observationGroupId={addTo ?? null}
        />
        <form action={completeCaptureAction} className="form-actions">
          <PendingActionButton
            className="button button-primary touch-target"
            pendingLabel="Preparing review…"
          >
            Review items
          </PendingActionButton>
        </form>
      </section>

      <section className="card detail-card recent-captures-card">
        <div className="captures-section-header">
          <div>
            <h2>Captured</h2>
            <p className="muted">
              Items, forms and notes are organized for review.
            </p>
          </div>
          <span className="status-pill neutral">
            {capturedItemCount ?? 0} item
            {capturedItemCount === 1 ? "" : "s"}
          </span>
        </div>
        <RecentCapturesList
          captures={captureItems}
          signedUrls={signedUrls}
          timeZone={profile.timezone}
        />
      </section>
    </main>
  );
}
