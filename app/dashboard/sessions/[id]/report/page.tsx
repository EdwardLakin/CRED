import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ProcessPendingEvidenceButton,
  getCaptureProcessingStatus,
  getRequiredEvidenceCompletion,
} from "@/features/capture";
import {
  approveAiReportDraft,
  createReportShareLink,
  disableReportShareLink,
  emailReport,
  generateAiReportDraft,
  markReportReviewed,
  saveReport,
} from "@/features/reports/actions";
import { formatReportEventLabel } from "@/features/reports/labels";
import { formatDateTime } from "@/features/sessions";
import { requireSessionWorkspace } from "@/features/sessions/data";

function getReportOrigin(headersList: Headers) {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ??
    process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, "")}`;
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") ?? "https";
  return host ? `${protocol}://${host}` : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getDisplayEntries(value: unknown) {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .filter(
      ([, entryValue]) =>
        entryValue !== null && entryValue !== undefined && entryValue !== "",
    )
    .slice(0, 16);
}

function getArrayCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function formatWorkflowStatus(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getAiDraftStatusVariant(status: string) {
  if (status === "approved") return "success";
  if (status === "failed") return "danger";
  if (status === "processing") return "info";
  return "neutral";
}

export default async function SessionReportPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    approved_draft?: string;
    disabled?: string;
    draft?: string;
    emailed?: string;
    error?: string;
    reviewed?: string;
    saved?: string;
    shared?: string;
  }>;
}) {
  const { id } = await params;
  const status = await searchParams;
  const { supabase, profile } = await requireSessionWorkspace();
  const { data: session, error: sessionError } = await supabase
    .from("documentation_sessions")
    .select(
      "id, title, session_type, organization_id, workflow_template_id, review_status, reviewed_at, reviewed_by, asset_label, vin, unit_number, customer_name, updated_at",
    )
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .single();

  if (sessionError || !session) notFound();

  const { data: captures } = await supabase
    .from("capture_items")
    .select("*")
    .eq("documentation_session_id", session.id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null);

  const { data: template } = session.workflow_template_id
    ? await supabase
        .from("documentation_workflow_templates")
        .select("name, required_evidence")
        .eq("id", session.workflow_template_id)
        .eq("organization_id", profile.organization_id)
        .maybeSingle()
    : { data: null };

  const { data: signatures } = await supabase
    .from("signature_captures")
    .select("id")
    .eq("documentation_session_id", session.id)
    .eq("organization_id", profile.organization_id);

  const { data: reviewer } = session.reviewed_by
    ? await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", session.reviewed_by)
        .eq("organization_id", profile.organization_id)
        .maybeSingle()
    : { data: null };

  const { data: shareTokens } = await supabase
    .from("report_share_tokens")
    .select("*")
    .eq("documentation_session_id", session.id)
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false });

  const { data: reportEvents } = await supabase
    .from("exports")
    .select("*")
    .eq("documentation_session_id", session.id)
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: aiDrafts } = await supabase
    .from("ai_report_drafts")
    .select("*")
    .eq("documentation_session_id", session.id)
    .eq("organization_id", profile.organization_id)
    .order("generated_at", { ascending: false })
    .order("created_at", { ascending: false });

  const currentAiDraft =
    (aiDrafts ?? []).find((draft) => draft.status === "approved") ??
    (aiDrafts ?? []).find((draft) => draft.status !== "superseded") ??
    aiDrafts?.[0] ??
    null;
  const { data: aiDraftSections } = currentAiDraft
    ? await supabase
        .from("ai_report_draft_sections")
        .select("*")
        .eq("ai_report_draft_id", currentAiDraft.id)
        .eq("organization_id", profile.organization_id)
        .order("sort_order", { ascending: true })
    : { data: [] };

  const reportPath = `/api/dashboard/sessions/${session.id}/report-pdf`;
  const headersList = await headers();
  const origin = getReportOrigin(headersList);
  const evidence = getRequiredEvidenceCompletion(
    captures ?? [],
    session.session_type,
    template?.required_evidence ?? null,
  );
  const visibleCaptures = captures ?? [];
  const processingCounts = visibleCaptures.reduce(
    (counts, capture) => {
      const captureStatus = getCaptureProcessingStatus(capture);
      if (captureStatus === "extracted") counts.ready += 1;
      if (
        captureStatus === "processing" ||
        captureStatus === "pending" ||
        captureStatus === "ready_for_review"
      )
        counts.processing += 1;
      if (
        captureStatus === "needs_review" ||
        captureStatus === "failed" ||
        captureStatus === "blocked_by_limit"
      )
        counts.needsReview += 1;
      return counts;
    },
    { ready: 0, processing: 0, needsReview: 0 },
  );
  const hasPendingEvidence = processingCounts.processing > 0;
  const isReadyForDelivery = session.review_status === "ready_for_delivery";
  const reviewedLabel = session.reviewed_at
    ? formatDateTime(session.reviewed_at)
    : null;
  const markReviewedAction = markReportReviewed.bind(null, session.id);
  const saveAction = saveReport.bind(null, session.id);
  const emailAction = emailReport.bind(null, session.id);
  const shareAction = createReportShareLink.bind(null, session.id);
  const generateDraftAction = generateAiReportDraft.bind(null, session.id);
  const approveDraftAction = currentAiDraft
    ? approveAiReportDraft.bind(null, currentAiDraft.id)
    : null;
  const sourceFieldEntries = getDisplayEntries(currentAiDraft?.header_fields);
  const draftFindingCount = getArrayCount(currentAiDraft?.findings);
  const draftMeasurementCount = getArrayCount(currentAiDraft?.measurements);
  const unmappedEvidenceCount = getArrayCount(
    currentAiDraft?.unmapped_evidence,
  );

  const reportStatusItems = [
    { label: "Draft Generated", complete: Boolean(currentAiDraft) },
    {
      label: "AI Draft Approved",
      complete: currentAiDraft?.status === "approved",
    },
    { label: "Ready for Delivery", complete: isReadyForDelivery },
  ];
  const hasNeedsReviewEvidence = processingCounts.needsReview > 0;
  const processingSummaryVariant = hasPendingEvidence
    ? "info"
    : hasNeedsReviewEvidence
      ? "attention"
      : "success";
  const processingSummaryTitle = hasPendingEvidence
    ? "Evidence Processing"
    : hasNeedsReviewEvidence
      ? "Review / Retry Evidence"
      : "✓ Evidence Processed";
  const processingSummaryCopy = hasPendingEvidence
    ? "Some captures are still processing. Refresh status or generate with available evidence."
    : hasNeedsReviewEvidence
      ? "Some evidence needs review or retry before you rely on the draft."
      : `${processingCounts.ready} capture${processingCounts.ready === 1 ? "" : "s"} ready for report review.`;
  const sessionSummaryRows = [
    ["VIN", session.vin ?? "Not captured"],
    [
      "Unit Number",
      session.unit_number ?? session.asset_label ?? "Not captured",
    ],
    ["Customer", session.customer_name ?? "Not captured"],
    ["Capture Count", String(visibleCaptures.length)],
    [
      "Last Updated",
      session.updated_at ? formatDateTime(session.updated_at) : "Not recorded",
    ],
  ];

  return (
    <main className="page-shell dashboard-shell report-preview-shell report-review-shell">
      <div className="section-header page-header report-preview-header report-review-header">
        <div>
          <p className="eyebrow guided-eyebrow">Report review workspace</p>
          <h1>{session.title}</h1>
          <p className="muted">
            Review the inspection report, confirm coverage, and deliver a
            polished printable report. Form Profile:{" "}
            {template?.name ?? "No Form Profile / Evidence Package"}.
          </p>
        </div>
        <div className="page-actions report-preview-actions">
          {isReadyForDelivery ? (
            <Link
              href={reportPath}
              className="button button-primary touch-target"
              target="_blank"
            >
              Open Printable Report
            </Link>
          ) : (
            <span
              className="button button-primary touch-target disabled-action"
              aria-disabled="true"
            >
              Open Printable Report
            </span>
          )}
          <Link
            href={`/dashboard/sessions/${session.id}`}
            className="button button-secondary touch-target"
          >
            Back to Session
          </Link>
          <Link
            href="/dashboard"
            className="button button-secondary touch-target"
          >
            Finish
          </Link>
        </div>
      </div>

      <div className="report-alert-stack">
        {status.error ? <p className="error">{status.error}</p> : null}
        {status.emailed ? (
          <p className="success">Printable report email sent.</p>
        ) : null}
        {status.shared ? (
          <p className="success">Secure share link generated.</p>
        ) : null}
        {status.saved ? (
          <p className="success">Report saved indefinitely unless deleted.</p>
        ) : null}
        {status.reviewed ? (
          <p className="success">Reviewed and ready to deliver.</p>
        ) : null}
        {status.draft ? (
          <p className="success">AI Draft generated and ready for review.</p>
        ) : null}
        {status.approved_draft ? (
          <p className="success">AI Draft approved and ready for delivery.</p>
        ) : null}
        {status.disabled ? (
          <p className="success">Share link disabled.</p>
        ) : null}
        {!isReadyForDelivery ? (
          <p className="notice info">
            Approve the AI Draft and complete the ready-for-delivery checklist
            to unlock delivery.
          </p>
        ) : null}
      </div>

      <div className="report-review-layout">
        <div className="report-workspace-column">
          <section className="card detail-card report-command-card report-overview-card">
            <div>
              <p className="eyebrow">Report Preview</p>
              <h2>Printable inspection report</h2>
              <p className="muted">
                The generated report is now the primary workspace. Use the draft
                review and extracted details below to validate the final
                customer-facing output.
              </p>
            </div>
            <div className="report-identity-grid">
              <div>
                <span>Vehicle / Asset</span>
                <strong>
                  {session.asset_label ?? session.unit_number ?? session.title}
                </strong>
              </div>
              <div>
                <span>VIN</span>
                <strong>{session.vin ?? "Not captured"}</strong>
              </div>
              <div>
                <span>Findings</span>
                <strong>{draftFindingCount}</strong>
              </div>
              <div>
                <span>Photos / Evidence</span>
                <strong>{visibleCaptures.length}</strong>
              </div>
            </div>
          </section>

          <section
            className="card detail-card report-preview-card report-preview-card-primary"
            aria-label="CRED printable report preview"
          >
            <div className="report-preview-toolbar">
              <div>
                <strong>Live printable preview</strong>
                <p className="muted">
                  Use your browser’s Print or Share menu from the printable
                  report to save as PDF.
                </p>
              </div>
              {isReadyForDelivery ? (
                <Link
                  href={reportPath}
                  className="button button-secondary touch-target"
                  target="_blank"
                >
                  Open full report
                </Link>
              ) : (
                <span className="status-pill neutral">
                  Available after approval
                </span>
              )}
            </div>
            <iframe
              src={`${reportPath}?preview=1`}
              title={`CRED printable report preview for ${session.title}`}
              className="report-preview-frame"
            />
          </section>

          <section className="card detail-card report-command-card form-stack">
            <div className="report-section-heading">
              <div>
                <p className="eyebrow">Draft Narrative</p>
                <h2>AI Draft Review</h2>
                <p className="muted">
                  CRED organizes captured evidence using the selected Form
                  Profile as Report Context. Review before delivery.
                </p>
              </div>
              {currentAiDraft ? (
                <p
                  className={`status-pill ${getAiDraftStatusVariant(currentAiDraft.status)}`}
                >
                  AI Draft: {formatWorkflowStatus(currentAiDraft.status)}
                </p>
              ) : (
                <p className="status-pill neutral">No draft yet</p>
              )}
            </div>
            {!currentAiDraft ? (
              <form action={generateDraftAction} className="form-stack">
                <div className="required-evidence-grid compact-reminder-grid">
                  <p className="checkline complete">
                    ✓ Report Context:{" "}
                    {template?.name ?? "No Form Profile / Evidence Package"}
                  </p>
                  <p
                    className={
                      (captures ?? []).length > 0
                        ? "checkline complete"
                        : "checkline neutral"
                    }
                  >
                    {(captures ?? []).length > 0 ? "✓" : "○"} Evidence captures
                    available
                  </p>
                  <p className="checkline complete">
                    ✓ Source Documents and extracted details included when
                    available
                  </p>
                </div>
                <div className="form-actions report-inline-actions">
                  <button className="button button-primary touch-target">
                    {hasPendingEvidence
                      ? "Generate Draft with Available Evidence"
                      : "Generate AI Draft"}
                  </button>
                  <Link
                    href={`/dashboard/sessions/${session.id}/capture`}
                    className="button button-secondary touch-target"
                  >
                    Capture More Evidence
                  </Link>
                </div>
              </form>
            ) : (
              <div className="form-stack">
                <div className="report-draft-summary">
                  <h3>{currentAiDraft.title ?? session.title}</h3>
                  {currentAiDraft.summary ? (
                    <p>{currentAiDraft.summary}</p>
                  ) : (
                    <p className="muted">No draft summary supplied.</p>
                  )}
                  <p className="muted">
                    Generated:{" "}
                    {currentAiDraft.generated_at
                      ? formatDateTime(currentAiDraft.generated_at)
                      : "Not recorded"}{" "}
                    · Confidence:{" "}
                    {typeof currentAiDraft.confidence === "number"
                      ? `${Math.round(currentAiDraft.confidence * 100)}%`
                      : "Not available"}
                  </p>
                  {currentAiDraft.status === "approved" ? (
                    <p className="success compact-success">
                      This is the approved AI Draft used for delivery.
                    </p>
                  ) : null}
                </div>

                <div className="required-evidence-grid compact-reminder-grid">
                  <p className="checkline complete">
                    Grouped findings: {draftFindingCount}
                  </p>
                  <p className="checkline complete">
                    Measurements: {draftMeasurementCount}
                  </p>
                  <p
                    className={
                      unmappedEvidenceCount > 0
                        ? "checkline attention"
                        : "checkline complete"
                    }
                  >
                    Unmapped evidence: {unmappedEvidenceCount}
                  </p>
                </div>

                <section className="report-subsection">
                  <div>
                    <h3>Findings & recommendations</h3>
                    <p className="muted">
                      Draft sections are presented as the report narrative for
                      quick professional review.
                    </p>
                  </div>
                  <div className="signature-list report-section-list">
                    {(aiDraftSections ?? []).map((section) => (
                      <article
                        key={section.id}
                        className="signature-list-item report-section-item"
                      >
                        <div className="form-stack">
                          <div>
                            <strong>{section.title}</strong>
                            {section.status ? (
                              <span className="status-pill neutral compact">
                                {section.status.replace(/_/g, " ")}
                              </span>
                            ) : null}
                            {typeof section.confidence === "number" ? (
                              <span className="muted">
                                {" "}
                                Confidence:{" "}
                                {Math.round(section.confidence * 100)}%
                              </span>
                            ) : null}
                          </div>
                          {section.body ? (
                            <p className="muted">{section.body}</p>
                          ) : null}
                          {section.source_capture_ids.length > 0 ? (
                            <p className="muted">
                              Source capture references:{" "}
                              {section.source_capture_ids.join(", ")}
                            </p>
                          ) : (
                            <p className="muted">
                              Source capture references: none supplied; review
                              before relying on this section.
                            </p>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="report-subsection">
                  <div>
                    <h3>Extracted details</h3>
                    <p className="muted">
                      Source documents provide identity/header fields for
                      review. Work order line descriptions are not findings
                      unless a technician note asks to include them.
                    </p>
                  </div>
                  <div className="required-evidence-grid compact-reminder-grid">
                    {sourceFieldEntries.length > 0 ? (
                      sourceFieldEntries.map(([key, value]) => (
                        <p key={key} className="checkline complete">
                          {key.replace(/_/g, " ")}: {String(value)}
                        </p>
                      ))
                    ) : (
                      <p className="muted">
                        No source/header fields extracted yet.
                      </p>
                    )}
                  </div>
                </section>

                {Array.isArray(currentAiDraft.unmapped_evidence) &&
                currentAiDraft.unmapped_evidence.length > 0 ? (
                  <details className="report-activity-details">
                    <summary>Unmapped Evidence</summary>
                    <pre className="muted">
                      {JSON.stringify(
                        currentAiDraft.unmapped_evidence,
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                ) : null}
                <p className="muted">
                  TODO: Add inline edit, move, merge, and source-reference
                  controls for future AI Draft review.
                </p>
                <div className="form-actions report-inline-actions">
                  <form action={generateDraftAction}>
                    <button className="button button-secondary touch-target">
                      {hasPendingEvidence
                        ? "Generate new draft with available evidence"
                        : "Generate new draft"}
                    </button>
                  </form>
                  {currentAiDraft.status !== "approved" &&
                  approveDraftAction ? (
                    <form action={approveDraftAction}>
                      <button className="button button-primary touch-target">
                        Approve Draft
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          <section className="card detail-card report-command-card form-stack">
            <div>
              <p className="eyebrow">Photos & Evidence</p>
              <h2>Included captures</h2>
              <p className="muted">
                Evidence remains attached to the report. Processing state is
                summarized without taking over the review workspace.
              </p>
            </div>
            <div className="required-evidence-grid compact-reminder-grid">
              <p className="checkline complete">
                Ready for review: {processingCounts.ready}
              </p>
              <p
                className={
                  processingCounts.processing > 0
                    ? "checkline neutral"
                    : "checkline complete"
                }
              >
                Processing or pending: {processingCounts.processing}
              </p>
              <p
                className={
                  processingCounts.needsReview > 0
                    ? "checkline attention"
                    : "checkline complete"
                }
              >
                Needs review / retry: {processingCounts.needsReview}
              </p>
            </div>
          </section>
        </div>

        <aside className="report-sidebar" aria-label="Report review controls">
          <section className="card detail-card report-sidebar-card form-stack">
            <div>
              <p className="eyebrow">Report Status</p>
              <h2>
                {isReadyForDelivery
                  ? "Ready for Delivery"
                  : currentAiDraft
                    ? "Draft in Review"
                    : "Draft Needed"}
              </h2>
            </div>
            <div className="report-status-list">
              {reportStatusItems.map((item) => (
                <p
                  key={item.label}
                  className={
                    item.complete ? "checkline complete" : "checkline neutral"
                  }
                >
                  {item.complete ? "✓" : "○"} {item.label}
                </p>
              ))}
            </div>
          </section>

          <section
            className={`card detail-card report-sidebar-card compact-status-card ${processingSummaryVariant}`}
          >
            <div>
              <p className="eyebrow">Processing</p>
              <h2>{processingSummaryTitle}</h2>
              <p className="muted">{processingSummaryCopy}</p>
            </div>
            {hasPendingEvidence || hasNeedsReviewEvidence ? (
              <div className="form-actions report-inline-actions">
                <Link
                  href={`/dashboard/sessions/${session.id}/report`}
                  className="button button-secondary touch-target"
                >
                  Refresh
                </Link>
                <ProcessPendingEvidenceButton sessionId={session.id} />
              </div>
            ) : null}
          </section>

          <section className="card detail-card report-sidebar-card form-stack">
            <div>
              <p className="eyebrow">Coverage Reminders</p>
              <h2>
                {evidence.missing.length > 0
                  ? `${evidence.missing.length} suggested item${evidence.missing.length === 1 ? "" : "s"}`
                  : "Coverage complete"}
              </h2>
            </div>
            <div className="coverage-reminder-list">
              {evidence.missing.length > 0 ? (
                evidence.missing.map((row) => (
                  <p key={row.rule.key}>• {row.rule.label}</p>
                ))
              ) : (
                <p>✓ All coverage suggestions are resolved.</p>
              )}
            </div>
            <Link
              href={`/dashboard/sessions/${session.id}/capture`}
              className="button button-secondary touch-target"
            >
              Capture More Evidence
            </Link>
          </section>

          <section
            id="ready-for-delivery"
            className="card detail-card report-sidebar-card form-stack"
          >
            <div>
              <p className="eyebrow">Ready for Delivery</p>
              <h2>
                {isReadyForDelivery
                  ? "Pre-flight complete"
                  : "Pre-flight checklist"}
              </h2>
              {reviewedLabel ? (
                <p className="success compact-success">
                  Reviewed {reviewedLabel}
                  {reviewer?.full_name
                    ? ` by ${reviewer.full_name}`
                    : session.reviewed_by
                      ? ` by ${session.reviewed_by}`
                      : ""}
                  .
                </p>
              ) : null}
            </div>
            <div className="report-status-list">
              <p className="checkline complete">✓ Evidence reviewed</p>
              <p
                className={
                  currentAiDraft ? "checkline complete" : "checkline neutral"
                }
              >
                {currentAiDraft ? "✓" : "○"} AI findings reviewed
              </p>
              <p
                className={
                  (captures ?? []).length > 0
                    ? "checkline complete"
                    : "checkline neutral"
                }
              >
                {(captures ?? []).length > 0 ? "✓" : "○"} Included captures
                reviewed
              </p>
              <p
                className={
                  (signatures ?? []).length > 0
                    ? "checkline complete"
                    : "checkline neutral"
                }
              >
                {(signatures ?? []).length > 0 ? "✓" : "○"} Signatures reviewed
                if required
              </p>
              <p
                className={
                  evidence.missing.length === 0
                    ? "checkline complete"
                    : "checkline neutral"
                }
              >
                {evidence.missing.length === 0 ? "✓" : "○"} Coverage suggestions
                acknowledged
              </p>
            </div>
            {!isReadyForDelivery ? (
              <form action={markReviewedAction} className="form-stack">
                <input
                  type="hidden"
                  name="missing_evidence_count"
                  value={evidence.missing.length}
                />
                {evidence.missing.length > 0 ? (
                  <label className="checkline neutral acknowledgement-row">
                    <input
                      type="checkbox"
                      name="missing_evidence_acknowledged"
                      required
                    />
                    I reviewed the optional coverage suggestions and approve
                    this draft as-is.
                  </label>
                ) : null}
                <div className="form-actions report-inline-actions">
                  <button className="button button-primary touch-target">
                    {evidence.missing.length > 0
                      ? "Approve with reminders"
                      : "Approve Report"}
                  </button>
                </div>
              </form>
            ) : null}
          </section>

          <section className="card detail-card report-sidebar-card form-stack">
            <div>
              <p className="eyebrow">Session Summary</p>
              <h2>Inspection details</h2>
            </div>
            <dl className="report-summary-list">
              {sessionSummaryRows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card detail-card report-sidebar-card form-stack">
            <div>
              <p className="eyebrow">Actions</p>
              <h2>Report controls</h2>
            </div>
            <div className="sidebar-action-stack">
              <form action={generateDraftAction}>
                <button className="button button-secondary touch-target">
                  {currentAiDraft ? "Regenerate Draft" : "Generate Draft"}
                </button>
              </form>
              {currentAiDraft &&
              currentAiDraft.status !== "approved" &&
              approveDraftAction ? (
                <form action={approveDraftAction}>
                  <button className="button button-primary touch-target">
                    Approve AI Draft
                  </button>
                </form>
              ) : null}
              {!isReadyForDelivery ? (
                <Link
                  href="#ready-for-delivery"
                  className="button button-primary touch-target"
                >
                  Approve Report
                </Link>
              ) : null}
              <Link
                href={`/dashboard/sessions/${session.id}/capture`}
                className="button button-secondary touch-target"
              >
                Capture More Evidence
              </Link>
              {isReadyForDelivery ? (
                <Link
                  href={reportPath}
                  className="button button-secondary touch-target"
                  target="_blank"
                >
                  Open Printable Report
                </Link>
              ) : (
                <span
                  className="button button-secondary touch-target disabled-action"
                  aria-disabled="true"
                >
                  Open Printable Report
                </span>
              )}
            </div>
          </section>

          <section className="card detail-card report-sidebar-card report-delivery-tabs form-stack">
            <div>
              <p className="eyebrow">Delivery</p>
              <h2>Deliver Report</h2>
              {!isReadyForDelivery ? (
                <p className="muted delivery-helper">
                  Available after draft approval and pre-flight review.
                </p>
              ) : null}
            </div>
            <input
              className="delivery-tab-radio"
              type="radio"
              id="delivery-email"
              name="delivery-tabs"
              defaultChecked
            />
            <input
              className="delivery-tab-radio"
              type="radio"
              id="delivery-share"
              name="delivery-tabs"
            />
            <input
              className="delivery-tab-radio"
              type="radio"
              id="delivery-save"
              name="delivery-tabs"
            />
            <div
              className="delivery-tab-list"
              role="tablist"
              aria-label="Delivery methods"
            >
              <label htmlFor="delivery-email" role="tab">
                Email
              </label>
              <label htmlFor="delivery-share" role="tab">
                Share Link
              </label>
              <label htmlFor="delivery-save" role="tab">
                Save PDF
              </label>
            </div>
            <div className="delivery-tab-panel delivery-panel-email">
              <form action={emailAction} className="form-stack">
                <div className="field-stack">
                  <label htmlFor="recipients" className="label">
                    Customer email / recipients
                  </label>
                  <input
                    id="recipients"
                    name="recipients"
                    className="input"
                    placeholder="customer@example.com, manager@example.com"
                    required
                  />
                </div>
                <div className="field-stack">
                  <label htmlFor="message" className="label">
                    Custom message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    className="input text-area"
                    placeholder="Please review the printable report."
                  />
                </div>
                <button
                  className="button button-primary touch-target"
                  disabled={!isReadyForDelivery}
                >
                  Email Printable Report
                </button>
              </form>
            </div>
            <div className="delivery-tab-panel delivery-panel-share">
              <form action={shareAction} className="form-stack">
                <div className="field-stack">
                  <label htmlFor="expires_at" className="label">
                    Expiration date
                  </label>
                  <input
                    id="expires_at"
                    name="expires_at"
                    className="input"
                    type="datetime-local"
                  />
                </div>
                <button
                  className="button button-secondary touch-target"
                  disabled={!isReadyForDelivery}
                >
                  Create Share Link
                </button>
              </form>
              <div className="compact-token-list">
                {(shareTokens ?? []).map((token) => {
                  const shareUrl = origin
                    ? `${origin}/reports/share/${token.token}`
                    : `/reports/share/${token.token}`;
                  return (
                    <article key={token.id} className="compact-token-item">
                      <div>
                        <strong>{shareUrl}</strong>
                        <p className="muted">
                          Views: {token.view_count} · Expires:{" "}
                          {token.expires_at
                            ? formatDateTime(token.expires_at)
                            : "No expiration"}{" "}
                          · {token.disabled_at ? "Disabled" : "Active"}
                        </p>
                      </div>
                      {!token.disabled_at ? (
                        <form
                          action={disableReportShareLink.bind(
                            null,
                            session.id,
                            token.id,
                          )}
                        >
                          <button className="button button-secondary touch-target">
                            Disable
                          </button>
                        </form>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>
            <div className="delivery-tab-panel delivery-panel-save">
              <p className="muted">
                Saved reports remain accessible indefinitely unless deleted.
                Open the printable report to use your browser’s Save as PDF
                workflow.
              </p>
              <form action={saveAction}>
                <button
                  className="button button-primary touch-target"
                  disabled={!isReadyForDelivery}
                >
                  Save Report
                </button>
              </form>
              {isReadyForDelivery ? (
                <Link
                  href={reportPath}
                  className="button button-secondary touch-target"
                  target="_blank"
                >
                  Open Printable Report
                </Link>
              ) : null}
            </div>
          </section>

          <section className="card detail-card report-sidebar-card form-stack">
            <div>
              <p className="eyebrow">Report Activity</p>
              <h2>Recent events</h2>
            </div>
            <div className="report-activity-compact">
              {currentAiDraft ? (
                <p>✓ Draft generated</p>
              ) : (
                <p>○ Draft pending</p>
              )}
              {currentAiDraft?.status === "approved" ? (
                <p>✓ AI draft approved</p>
              ) : (
                <p>○ AI draft approval pending</p>
              )}
              {isReadyForDelivery ? (
                <p>✓ Report approved</p>
              ) : (
                <p>○ Report approval pending</p>
              )}
              {(reportEvents ?? []).slice(0, 2).map((event) => (
                <p key={event.id}>
                  ✓ {formatReportEventLabel(event.export_type, event.status)}
                </p>
              ))}
              {(shareTokens ?? []).length > 0 ? (
                <p>✓ Share link created</p>
              ) : null}
            </div>
            <details className="report-activity-details">
              <summary>Full history</summary>
              <div className="signature-list compact-history-list">
                {(reportEvents ?? []).map((event) => (
                  <article key={event.id} className="signature-list-item">
                    <strong>
                      {formatReportEventLabel(event.export_type, event.status)}
                    </strong>
                    <span>{event.status}</span>
                    <span className="muted">
                      {formatDateTime(event.created_at)}
                    </span>
                  </article>
                ))}
                {(reportEvents ?? []).length === 0 ? (
                  <p className="muted">No delivery events recorded yet.</p>
                ) : null}
              </div>
            </details>
          </section>
        </aside>
      </div>
    </main>
  );
}
