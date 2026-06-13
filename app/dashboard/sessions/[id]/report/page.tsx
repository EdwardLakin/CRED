import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
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
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
type DocumentationSession = Tables["documentation_sessions"]["Row"];
type AiReportDraft = Tables["ai_report_drafts"]["Row"];
type AiReportDraftSection = Tables["ai_report_draft_sections"]["Row"];
type ReportShareToken = Tables["report_share_tokens"]["Row"];
type ReportEvent = Tables["exports"]["Row"];
type ServerAction = (formData: FormData) => void | Promise<void>;
type EvidenceCounts = {
  ready: number;
  processing: number;
  needsReview: number;
};
type StatusItem = { label: string; complete: boolean };
type CoverageReminder = ReturnType<
  typeof getRequiredEvidenceCompletion
>["missing"][number];
type SessionSummaryRow = [label: string, value: string];

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


function getReportStatusVariant(status: string) {
  if (status === "approved") return "success";
  if (status === "failed") return "danger";
  if (status === "processing") return "info";
  return "neutral";
}

function getReportStatusLabel(status: string) {
  if (status === "approved") return "Approved";
  if (status === "failed") return "Review Required";
  if (status === "processing") return "Building Report";
  return "Review Required";
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
  const previewPath = `${reportPath}?preview=1`;
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
  const isReadyForExport = session.review_status === "ready_for_delivery";
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
    { label: "Report Generated", complete: Boolean(currentAiDraft) },
    {
      label: "Report Approved",
      complete: currentAiDraft?.status === "approved",
    },
    { label: "Ready", complete: isReadyForExport },
  ];
  const sessionSummaryRows: SessionSummaryRow[] = [
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
          <p className="eyebrow guided-eyebrow">Review</p>
          <h1>{session.title}</h1>
          <p className="muted">
            Review the professional report CRED built from your evidence. Approve it, then export.
          </p>
        </div>
        <div className="page-actions report-preview-actions">
          {isReadyForExport ? (
            <Link
              href={reportPath}
              className="button button-primary touch-target"
              target="_blank"
            >
              Print / Save
            </Link>
          ) : (
            <span
              className="button button-primary touch-target disabled-action"
              aria-disabled="true"
            >
              Print / Save
            </span>
          )}
          <Link
            href={`/dashboard/sessions/${session.id}/capture`}
            className="button button-secondary touch-target"
          >
            Capture More
          </Link>
          <Link
            href="/dashboard"
            className="button button-secondary touch-target"
          >
            Dashboard
          </Link>
        </div>
      </div>

      <div className="report-alert-stack">
        {status.error ? <p className="error">{status.error}</p> : null}
        {status.emailed ? (
          <p className="success">Report email sent.</p>
        ) : null}
        {status.shared ? (
          <p className="success">Secure share link generated.</p>
        ) : null}
        {status.saved ? (
          <p className="success">Report saved.</p>
        ) : null}
        {status.reviewed ? (
          <p className="success">Approved and ready to export.</p>
        ) : null}
        {status.draft ? (
          <p className="success">Report generated and ready for review.</p>
        ) : null}
        {status.approved_draft ? (
          <p className="success">Report approved and ready to export.</p>
        ) : null}
        {status.disabled ? (
          <p className="success">Share link disabled.</p>
        ) : null}
        {!isReadyForExport ? (
          <p className="notice info">
            Review and approve the report to unlock export.
          </p>
        ) : null}
      </div>

      <div className="report-review-layout">
        <div className="report-workspace-column">
          <ReportOverview
            draftFindingCount={draftFindingCount}
            session={session}
            visibleCaptureCount={visibleCaptures.length}
          />
          <PrintableReportPreview
            isReadyForExport={isReadyForExport}
            previewPath={previewPath}
            reportPath={reportPath}
            sessionTitle={session.title}
          />
          <AiDraftReview
            aiDraftSections={aiDraftSections ?? []}
            approveDraftAction={approveDraftAction}
            currentAiDraft={currentAiDraft}
            draftFindingCount={draftFindingCount}
            draftMeasurementCount={draftMeasurementCount}
            generateDraftAction={generateDraftAction}
            hasPendingEvidence={hasPendingEvidence}
            session={session}
            sourceFieldEntries={sourceFieldEntries}
            templateName={template?.name}
            unmappedEvidenceCount={unmappedEvidenceCount}
            visibleCaptureCount={visibleCaptures.length}
          />
          <IncludedCapturesSummary processingCounts={processingCounts} />
        </div>

        <ReportSidebar
          approveDraftAction={approveDraftAction}
          reminders={evidence.missing}
          currentAiDraft={currentAiDraft}
          generateDraftAction={generateDraftAction}
          isReadyForExport={isReadyForExport}
          markReviewedAction={markReviewedAction}
          missingEvidenceCount={evidence.missing.length}
          reportPath={reportPath}
          reportStatusItems={reportStatusItems}
          reviewedBy={reviewer?.full_name ?? session.reviewed_by}
          reviewedLabel={reviewedLabel}
          sessionId={session.id}
          sessionSummaryRows={sessionSummaryRows}
          signatureCount={(signatures ?? []).length}
          visibleCaptureCount={visibleCaptures.length}
        >
          <ExportCenter
            emailAction={emailAction}
            isReadyForExport={isReadyForExport}
            origin={origin}
            reportPath={reportPath}
            saveAction={saveAction}
            sessionId={session.id}
            shareAction={shareAction}
            shareTokens={shareTokens ?? []}
          />
          <ReportActivity
            currentAiDraft={currentAiDraft}
            isReadyForExport={isReadyForExport}
            reportEvents={reportEvents ?? []}
            shareTokenCount={(shareTokens ?? []).length}
          />
        </ReportSidebar>
      </div>
    </main>
  );
}

function ReportOverview({
  draftFindingCount,
  session,
  visibleCaptureCount,
}: {
  draftFindingCount: number;
  session: Pick<
    DocumentationSession,
    "asset_label" | "title" | "unit_number" | "vin"
  >;
  visibleCaptureCount: number;
}) {
  return (
    <section className="card detail-card report-command-card report-overview-card">
      <div>
        <p className="eyebrow">Report Preview</p>
        <h2>Professional report</h2>
        <p className="muted">
          CRED assembled this report from the evidence you captured.
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
          <strong>{visibleCaptureCount}</strong>
        </div>
      </div>
    </section>
  );
}

function PrintableReportPreview({
  isReadyForExport,
  previewPath,
  reportPath,
  sessionTitle,
}: {
  isReadyForExport: boolean;
  previewPath: string;
  reportPath: string;
  sessionTitle: string;
}) {
  return (
    <section
      className="card detail-card report-preview-card report-preview-card-primary"
      aria-label="CRED printable report preview"
    >
      <div className="report-preview-toolbar">
        <div>
          <strong>Live printable preview</strong>
          <p className="muted">
            Use your browser’s Print or Share menu from the printable report to
            save a printable copy.
          </p>
        </div>
        {isReadyForExport ? (
          <Link
            href={reportPath}
            className="button button-secondary touch-target"
            target="_blank"
          >
            Open full report
          </Link>
        ) : (
          <span className="status-pill neutral">Available after approval</span>
        )}
      </div>
      <iframe
        src={previewPath}
        title={`CRED printable report preview for ${sessionTitle}`}
        className="report-preview-frame"
      />
    </section>
  );
}

function AiDraftReview({
  aiDraftSections,
  approveDraftAction,
  currentAiDraft,
  draftFindingCount,
  draftMeasurementCount,
  generateDraftAction,
  hasPendingEvidence,
  session,
  sourceFieldEntries,
  templateName,
  unmappedEvidenceCount,
  visibleCaptureCount,
}: {
  aiDraftSections: AiReportDraftSection[];
  approveDraftAction: ServerAction | null;
  currentAiDraft: AiReportDraft | null;
  draftFindingCount: number;
  draftMeasurementCount: number;
  generateDraftAction: ServerAction;
  hasPendingEvidence: boolean;
  session: Pick<DocumentationSession, "id" | "title">;
  sourceFieldEntries: [string, unknown][];
  templateName?: string;
  unmappedEvidenceCount: number;
  visibleCaptureCount: number;
}) {
  return (
    <section className="card detail-card report-command-card form-stack">
      <div className="report-section-heading">
        <div>
          <p className="eyebrow">Report</p>
          <h2>Generated Report</h2>
          <p className="muted">
            Review the findings, recommendations, photos, notes, form fields, and report structure before export.
          </p>
        </div>
        {currentAiDraft ? (
          <p
            className={`status-pill ${getReportStatusVariant(currentAiDraft.status)}`}
          >
            Report: {getReportStatusLabel(currentAiDraft.status)}
          </p>
        ) : (
          <p className="status-pill neutral">No report yet</p>
        )}
      </div>
      {!currentAiDraft ? (
        <form action={generateDraftAction} className="form-stack">
          <div className="required-evidence-grid compact-reminder-grid">
            <p className="checkline complete">
              ✓ Report Context:{" "}
              {templateName ?? "Evidence only"}
            </p>
            <p
              className={
                visibleCaptureCount > 0
                  ? "checkline complete"
                  : "checkline neutral"
              }
            >
              {visibleCaptureCount > 0 ? "✓" : "○"} Photos and notes available
            </p>
            <p className="checkline complete">
              ✓ Form fields included when available
            </p>
          </div>
          <div className="form-actions report-inline-actions">
            <button className="button button-primary touch-target">
              Generate Report
            </button>
            <Link
              href={`/dashboard/sessions/${session.id}/capture`}
              className="button button-secondary touch-target"
            >
              Capture More
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
              <p className="muted">No summary supplied yet.</p>
            )}
            <p className="muted">
              Created:{" "}
              {currentAiDraft.generated_at
                ? formatDateTime(currentAiDraft.generated_at)
                : "Not recorded"}
            </p>
            {currentAiDraft.status === "approved" ? (
              <p className="success compact-success">
                This report is approved for export.
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
              Extra evidence: {unmappedEvidenceCount}
            </p>
          </div>

          <section className="report-subsection">
            <div>
              <h3>Findings & recommendations</h3>
              <p className="muted">
                Review the report narrative before export.
              </p>
            </div>
            <div className="signature-list report-section-list">
              {aiDraftSections.map((section) => (
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
                        Evidence references: none supplied; review before
                        relying on this section.
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="report-subsection">
            <div>
              <h3>Form Fields</h3>
              <p className="muted">
                Review the fields CRED found from the captured evidence and paper forms.
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
                <p className="muted">No form fields found yet.</p>
              )}
            </div>
          </section>

          <div className="form-actions report-inline-actions">
            <form action={generateDraftAction}>
              <button className="button button-secondary touch-target">
                {hasPendingEvidence
                  ? "Regenerate Report"
                  : "Regenerate Report"}
              </button>
            </form>
            {currentAiDraft.status !== "approved" && approveDraftAction ? (
              <form action={approveDraftAction}>
                <button className="button button-primary touch-target">
                  Approve Report
                </button>
              </form>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function IncludedCapturesSummary({
  processingCounts,
}: {
  processingCounts: EvidenceCounts;
}) {
  return (
    <section className="card detail-card report-command-card form-stack">
      <div>
        <p className="eyebrow">Photos</p>
        <h2>Photos and notes</h2>
        <p className="muted">
          Evidence remains attached to the report for review.
        </p>
      </div>
      <div className="required-evidence-grid compact-reminder-grid">
        <p className="checkline complete">
          Included: {processingCounts.ready}
        </p>
        <p
          className={
            processingCounts.processing > 0
              ? "checkline neutral"
              : "checkline complete"
          }
        >
          Still being added: {processingCounts.processing}
        </p>
        <p
          className={
            processingCounts.needsReview > 0
              ? "checkline attention"
              : "checkline complete"
          }
        >
          Needs attention: {processingCounts.needsReview}
        </p>
      </div>
    </section>
  );
}

function ReportSidebar({
  approveDraftAction,
  children,
  reminders,
  currentAiDraft,
  generateDraftAction,
  isReadyForExport,
  markReviewedAction,
  missingEvidenceCount,
  reportPath,
  reportStatusItems,
  reviewedBy,
  reviewedLabel,
  sessionId,
  sessionSummaryRows,
  signatureCount,
  visibleCaptureCount,
}: {
  approveDraftAction: ServerAction | null;
  children: React.ReactNode;
  reminders: CoverageReminder[];
  currentAiDraft: AiReportDraft | null;
  generateDraftAction: ServerAction;
  isReadyForExport: boolean;
  markReviewedAction: ServerAction;
  missingEvidenceCount: number;
  reportPath: string;
  reportStatusItems: StatusItem[];
  reviewedBy: string | null;
  reviewedLabel: string | null;
  sessionId: string;
  sessionSummaryRows: SessionSummaryRow[];
  signatureCount: number;
  visibleCaptureCount: number;
}) {
  return (
    <aside className="report-sidebar" aria-label="Report review controls">
      <section className="card detail-card report-sidebar-card form-stack">
        <div>
          <p className="eyebrow">Review</p>
          <h2>
            {isReadyForExport
              ? "Ready"
              : currentAiDraft
                ? "Review Required"
                : "Report Needed"}
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

      <section className="card detail-card report-sidebar-card form-stack">
        <div>
          <p className="eyebrow">Optional Reminders</p>
          <h2>
            {reminders.length > 0
              ? `${reminders.length} suggested item${reminders.length === 1 ? "" : "s"}`
              : "All set"}
          </h2>
        </div>
        <div className="coverage-reminder-list">
          {reminders.length > 0 ? (
            reminders.map((row) => (
              <p key={row.rule.key}>• {row.rule.label}</p>
            ))
          ) : (
            <p>✓ All reminders are resolved.</p>
          )}
        </div>
        <Link
          href={`/dashboard/sessions/${sessionId}/capture`}
          className="button button-secondary touch-target"
        >
          Capture More
        </Link>
      </section>

      <section
        id="ready-for-delivery"
        className="card detail-card report-sidebar-card form-stack"
      >
        <div>
          <p className="eyebrow">Ready</p>
          <h2>
            {isReadyForExport
              ? "Approved"
              : "Approve Report"}
          </h2>
          {reviewedLabel ? (
            <p className="success compact-success">
              Reviewed {reviewedLabel}
              {reviewedBy ? ` by ${reviewedBy}` : ""}.
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
            {currentAiDraft ? "✓" : "○"} Findings reviewed
          </p>
          <p
            className={
              visibleCaptureCount > 0
                ? "checkline complete"
                : "checkline neutral"
            }
          >
            {visibleCaptureCount > 0 ? "✓" : "○"} Photos and notes reviewed
          </p>
          <p
            className={
              signatureCount > 0 ? "checkline complete" : "checkline neutral"
            }
          >
            {signatureCount > 0 ? "✓" : "○"} Signatures reviewed if required
          </p>
          <p
            className={
              missingEvidenceCount === 0
                ? "checkline complete"
                : "checkline neutral"
            }
          >
            {missingEvidenceCount === 0 ? "✓" : "○"} Optional reminders acknowledged
          </p>
        </div>
        {!isReadyForExport ? (
          <form action={markReviewedAction} className="form-stack">
            <input
              type="hidden"
              name="missing_evidence_count"
              value={missingEvidenceCount}
            />
            {missingEvidenceCount > 0 ? (
              <label className="checkline neutral acknowledgement-row">
                <input
                  type="checkbox"
                  name="missing_evidence_acknowledged"
                  required
                />
                I reviewed the optional reminders and approve this report.
              </label>
            ) : null}
            <div className="form-actions report-inline-actions">
              <button className="button button-primary touch-target">
                Approve Report
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="card detail-card report-sidebar-card form-stack">
        <div>
          <p className="eyebrow">Session Summary</p>
          <h2>Session details</h2>
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
          <h2>Report actions</h2>
        </div>
        <div className="sidebar-action-stack">
          <form action={generateDraftAction}>
            <button className="button button-secondary touch-target">
              {currentAiDraft ? "Regenerate Report" : "Generate Report"}
            </button>
          </form>
          {currentAiDraft &&
          currentAiDraft.status !== "approved" &&
          approveDraftAction ? (
            <form action={approveDraftAction}>
              <button className="button button-primary touch-target">
                Approve Report
              </button>
            </form>
          ) : null}
          {!isReadyForExport ? (
            <Link
              href="#ready-for-delivery"
              className="button button-primary touch-target"
            >
              Approve Report
            </Link>
          ) : null}
          <Link
            href={`/dashboard/sessions/${sessionId}/capture`}
            className="button button-secondary touch-target"
          >
            Capture More
          </Link>
          {isReadyForExport ? (
            <Link
              href={reportPath}
              className="button button-secondary touch-target"
              target="_blank"
            >
              Print / Save
            </Link>
          ) : (
            <span
              className="button button-secondary touch-target disabled-action"
              aria-disabled="true"
            >
              Print / Save
            </span>
          )}
        </div>
      </section>

      {children}
    </aside>
  );
}

function ExportCenter({
  emailAction,
  isReadyForExport,
  origin,
  reportPath,
  saveAction,
  sessionId,
  shareAction,
  shareTokens,
}: {
  emailAction: ServerAction;
  isReadyForExport: boolean;
  origin: string;
  reportPath: string;
  saveAction: ServerAction;
  sessionId: string;
  shareAction: ServerAction;
  shareTokens: ReportShareToken[];
}) {
  return (
    <section className="card detail-card report-sidebar-card report-delivery-tabs form-stack">
      <div>
        <p className="eyebrow">Export</p>
        <h2>Export Report</h2>
        {!isReadyForExport ? (
          <p className="muted delivery-helper">
            Available after report approval.
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
        aria-label="Export methods"
      >
        <label htmlFor="delivery-email" role="tab">
          Email
        </label>
        <label htmlFor="delivery-share" role="tab">
          Share Link
        </label>
        <label htmlFor="delivery-save" role="tab">
          Save Report
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
            disabled={!isReadyForExport}
          >
            Email Report
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
            disabled={!isReadyForExport}
          >
            Share Link
          </button>
        </form>
        <div className="compact-token-list">
          {shareTokens.map((token) => {
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
                      sessionId,
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
          Saved reports remain accessible indefinitely unless deleted. Open the report to print or save a copy.
        </p>
        <form action={saveAction}>
          <button
            className="button button-primary touch-target"
            disabled={!isReadyForExport}
          >
            Save Report
          </button>
        </form>
        {isReadyForExport ? (
          <Link
            href={reportPath}
            className="button button-secondary touch-target"
            target="_blank"
          >
            Print / Save
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function ReportActivity({
  currentAiDraft,
  isReadyForExport,
  reportEvents,
  shareTokenCount,
}: {
  currentAiDraft: AiReportDraft | null;
  isReadyForExport: boolean;
  reportEvents: ReportEvent[];
  shareTokenCount: number;
}) {
  return (
    <section className="card detail-card report-sidebar-card form-stack">
      <div>
        <p className="eyebrow">Export History</p>
        <h2>Recent events</h2>
      </div>
      <div className="report-activity-compact">
        {currentAiDraft ? <p>✓ Report generated</p> : <p>○ Report pending</p>}
        {currentAiDraft?.status === "approved" ? (
          <p>✓ Report approved</p>
        ) : (
          <p>○ Report approval pending</p>
        )}
        {isReadyForExport ? (
          <p>✓ Report approved</p>
        ) : (
          <p>○ Report approval pending</p>
        )}
        {reportEvents.slice(0, 2).map((event) => (
          <p key={event.id}>
            ✓ {formatReportEventLabel(event.export_type, event.status)}
          </p>
        ))}
        {shareTokenCount > 0 ? <p>✓ Share link created</p> : null}
      </div>
      <details className="report-activity-details">
        <summary>Full history</summary>
        <div className="signature-list compact-history-list">
          {reportEvents.map((event) => (
            <article key={event.id} className="signature-list-item">
              <strong>
                {formatReportEventLabel(event.export_type, event.status)}
              </strong>
              <span>{event.status}</span>
              <span className="muted">{formatDateTime(event.created_at)}</span>
            </article>
          ))}
          {reportEvents.length === 0 ? (
            <p className="muted">No export history yet.</p>
          ) : null}
        </div>
      </details>
    </section>
  );
}
