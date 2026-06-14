import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getCaptureProcessingStatus,
  getRequiredEvidenceCompletion,
} from "@/features/capture";
import {
  buildEvidenceGroups,
  deriveFormSectionsFromCaptures,
  getFormStructureSummary,
  normalizeDraftSections,
} from "@/features/reports/report-structure";
import {
  approveAiReportDraft,
  createReportShareLink,
  disableReportShareLink,
  emailReport,
  generateAiReportDraft,
  markReportReviewed,
  saveReport,
  saveReportEdits,
} from "@/features/reports/actions";
import { formatDateTime } from "@/features/sessions";
import { requireSessionWorkspace } from "@/features/sessions/data";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
type DocumentationSession = Tables["documentation_sessions"]["Row"];
type AiReportDraft = Tables["ai_report_drafts"]["Row"];
type AiReportDraftSection = Tables["ai_report_draft_sections"]["Row"];
type ReportShareToken = Tables["report_share_tokens"]["Row"];
type CaptureItem = Tables["capture_items"]["Row"];
type ServerAction = (formData: FormData) => void | Promise<void>;
type CoverageReminder = ReturnType<
  typeof getRequiredEvidenceCompletion
>["missing"][number];
type SupportingEvidenceItem = {
  capture: CaptureItem;
  signedUrl: string | null;
  title: string;
  note: string | null;
  kind: "photo" | "video" | "audio" | "note" | "document" | "file";
};

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

function isHiddenFromReport(metadata: unknown) {
  return isRecord(metadata) && metadata.hidden_from_report === true;
}

function isPhotoCapture(capture: CaptureItem) {
  return (
    capture.media_kind === "image" ||
    capture.type === "photo" ||
    Boolean(capture.storage_path?.match(/\.(jpg|jpeg|png|webp|gif|heic)$/i))
  );
}

function getEvidenceKind(capture: CaptureItem): SupportingEvidenceItem["kind"] {
  if (capture.type === "text_note" || capture.media_kind === "note")
    return "note";
  if (isPhotoCapture(capture)) return "photo";
  if (capture.media_kind === "video" || capture.type === "video")
    return "video";
  if (capture.media_kind === "audio" || capture.type === "voice_note")
    return "audio";
  if (capture.media_kind === "document") return "document";
  return "file";
}

function getEvidenceTitle(item: CaptureItem, index: number) {
  if (item.type === "text_note" || item.media_kind === "note")
    return `Technician note ${index + 1}`;
  if (isPhotoCapture(item)) return `Photo ${index + 1}`;
  if (item.media_kind === "video" || item.type === "video")
    return `Video ${index + 1}`;
  if (item.media_kind === "audio" || item.type === "voice_note")
    return `Voice note ${index + 1}`;
  return `Evidence ${index + 1}`;
}

function getEvidenceNote(capture: CaptureItem) {
  return capture.technician_note?.trim() || capture.transcript?.trim() || null;
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
    edit?: string;
    edited?: string;
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
    .is("deleted_at", null)
    .order("report_order", { ascending: true, nullsFirst: false })
    .order("captured_at", { ascending: true });

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

  const { data: aiDrafts } = await supabase
    .from("ai_report_drafts")
    .select("*")
    .eq("documentation_session_id", session.id)
    .eq("organization_id", profile.organization_id)
    .order("generated_at", { ascending: false })
    .order("created_at", { ascending: false });

  const currentReport =
    (aiDrafts ?? []).find((draft) => draft.status === "approved") ??
    (aiDrafts ?? []).find((draft) => draft.status !== "superseded") ??
    aiDrafts?.[0] ??
    null;
  const { data: reportSections } = currentReport
    ? await supabase
        .from("ai_report_draft_sections")
        .select("*")
        .eq("ai_report_draft_id", currentReport.id)
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
  const allCaptures = captures ?? [];
  const includedCaptures = allCaptures.filter(
    (capture) => capture.include_in_report,
  );
  const visibleCaptures = status.edit ? allCaptures : includedCaptures;
  const signedEvidenceUrls: Record<string, string> = {};
  await Promise.all(
    visibleCaptures.map(async (capture) => {
      const path = capture.thumbnail_path ?? capture.storage_path;
      if (!path) return;
      const { data } = await supabase.storage
        .from("documentation-captures")
        .createSignedUrl(path, 60 * 10);
      if (data?.signedUrl) signedEvidenceUrls[capture.id] = data.signedUrl;
    }),
  );
  const supportingEvidence = visibleCaptures.map((capture, index) => ({
    capture,
    signedUrl: signedEvidenceUrls[capture.id] ?? null,
    title: getEvidenceTitle(capture, index),
    note: getEvidenceNote(capture),
    kind: getEvidenceKind(capture),
  }));
  const visibleReportSections = (reportSections ?? []).filter((section) => !isHiddenFromReport(section.metadata));
  const normalizedReportSections = normalizeDraftSections(visibleReportSections, visibleCaptures);
  const derivedFormSections = deriveFormSectionsFromCaptures(visibleCaptures);
  const documentSections = normalizedReportSections.length > 0 ? normalizedReportSections : derivedFormSections;
  const formStructureSummary = getFormStructureSummary(currentReport?.report_structure ?? null, documentSections);
  const evidenceGroups = buildEvidenceGroups(visibleCaptures, visibleReportSections);
  const photoEvidence = supportingEvidence.filter(
    (item) => item.kind === "photo",
  );
  const noteEvidence = supportingEvidence.filter(
    (item) =>
      Boolean(item.note) || item.kind === "note" || item.kind === "audio",
  );
  const otherEvidence = supportingEvidence.filter(
    (item) => item.kind !== "photo" && !noteEvidence.includes(item),
  );
  const hasPendingEvidence = visibleCaptures.some((capture) => {
    const captureStatus = getCaptureProcessingStatus(capture);
    return (
      captureStatus === "processing" ||
      captureStatus === "pending" ||
      captureStatus === "ready_for_review"
    );
  });
  const isReadyForExport = session.review_status === "ready_for_delivery";
  const reviewedLabel = session.reviewed_at
    ? formatDateTime(session.reviewed_at)
    : null;
  const markReviewedAction = markReportReviewed.bind(null, session.id);
  const saveAction = saveReport.bind(null, session.id);
  const emailAction = emailReport.bind(null, session.id);
  const shareAction = createReportShareLink.bind(null, session.id);
  const generateReportAction = generateAiReportDraft.bind(null, session.id);
  const approveReportContentAction = currentReport
    ? approveAiReportDraft.bind(null, currentReport.id)
    : null;
  const saveReportEditsAction = currentReport
    ? saveReportEdits.bind(null, currentReport.id)
    : null;
  const sourceFieldEntries = getDisplayEntries(currentReport?.header_fields);
  const isEditingReport = status.edit === "1";
  return (
    <main className="page-shell dashboard-shell report-preview-shell report-review-shell">
      <div className="section-header page-header report-preview-header report-review-header">
        <div>
          <p className="eyebrow guided-eyebrow">Review</p>
          <h1>{session.title}</h1>
          <p className="muted">
            Review the professional report CRED built from your evidence.
            Approve it, then export.
          </p>
        </div>
        <div className="page-actions report-preview-actions compact-report-actions">
          <span className={isReadyForExport ? "status-pill success" : "status-pill neutral"}>
            {isReadyForExport ? "Ready" : "Review Required"}
          </span>
          <Link href={`/dashboard/sessions/${session.id}/capture`} className="button button-secondary touch-target">
            Continue Capturing
          </Link>
          {currentReport && !isEditingReport ? (
            <Link href={`/dashboard/sessions/${session.id}/report?edit=1`} className="button button-secondary touch-target">
              Edit Report
            </Link>
          ) : null}
          {!isReadyForExport ? (
            <Link href="#approval" className="button button-primary touch-target">
              Approve Report
            </Link>
          ) : null}
          <Link href="#export-report" className="button button-secondary touch-target">
            Export
          </Link>
        </div>
      </div>

      <div className="report-alert-stack">
        {status.error ? <p className="error">{status.error}</p> : null}
        {status.emailed ? <p className="success">Report email sent.</p> : null}
        {status.shared ? (
          <p className="success">Secure share link generated.</p>
        ) : null}
        {status.saved ? <p className="success">Report saved.</p> : null}
        {status.edited ? (
          <p className="success">Report changes saved.</p>
        ) : null}
        {status.reviewed ? (
          <p className="success">Approved and ready to export.</p>
        ) : null}
        {status.draft ? (
          <p className="success">Report is ready for review.</p>
        ) : null}
        {status.approved_draft ? (
          <p className="success">Report approved and ready to export.</p>
        ) : null}
        {status.disabled ? (
          <p className="success">Share link disabled.</p>
        ) : null}
        {!isReadyForExport ? (
          <p className="notice info">Approve this report before exporting.</p>
        ) : null}
      </div>

      <div className="report-review-layout report-document-layout">
        <div className="report-workspace-column">
          <GeneratedReportReview
            reportSections={reportSections ?? []}
            approveReportContentAction={approveReportContentAction}
            currentReport={currentReport}
            isEditingReport={isEditingReport}
            generateReportAction={generateReportAction}
            hasPendingEvidence={hasPendingEvidence}
            noteEvidence={noteEvidence}
            otherEvidence={otherEvidence}
            photoEvidence={photoEvidence}
            documentSections={documentSections}
            formStructureSummary={formStructureSummary}
            evidenceGroups={evidenceGroups}
            supportingEvidence={supportingEvidence}
            session={session}
            saveReportEditsAction={saveReportEditsAction}
            sourceFieldEntries={sourceFieldEntries}
            visibleCaptureCount={visibleCaptures.length}
          />
        </div>

        <InlineReviewPanel
          reminders={evidence.missing}
          currentReport={currentReport}
          isReadyForExport={isReadyForExport}
          markReviewedAction={markReviewedAction}
          missingEvidenceCount={evidence.missing.length}
          reviewedBy={reviewer?.full_name ?? session.reviewed_by}
          reviewedLabel={reviewedLabel}
          sessionId={session.id}
          signatureCount={(signatures ?? []).length}
          visibleCaptureCount={visibleCaptures.length}
        >
          <ExportPanel
            emailAction={emailAction}
            isReadyForExport={isReadyForExport}
            origin={origin}
            reportPath={reportPath}
            saveAction={saveAction}
            sessionId={session.id}
            shareAction={shareAction}
            shareTokens={shareTokens ?? []}
          />
        </InlineReviewPanel>
      </div>
    </main>
  );
}

function GeneratedReportReview({
  reportSections,
  approveReportContentAction,
  currentReport,
  generateReportAction,
  hasPendingEvidence,
  isEditingReport,
  noteEvidence,
  otherEvidence,
  photoEvidence,
  documentSections,
  formStructureSummary,
  evidenceGroups,
  supportingEvidence,
  session,
  saveReportEditsAction,
  sourceFieldEntries,
  visibleCaptureCount,
}: {
  reportSections: AiReportDraftSection[];
  approveReportContentAction: ServerAction | null;
  currentReport: AiReportDraft | null;
  generateReportAction: ServerAction;
  hasPendingEvidence: boolean;
  isEditingReport: boolean;
  noteEvidence: SupportingEvidenceItem[];
  otherEvidence: SupportingEvidenceItem[];
  photoEvidence: SupportingEvidenceItem[];
  documentSections: ReturnType<typeof normalizeDraftSections>;
  formStructureSummary: ReturnType<typeof getFormStructureSummary>;
  evidenceGroups: ReturnType<typeof buildEvidenceGroups>;
  supportingEvidence: SupportingEvidenceItem[];
  session: Pick<DocumentationSession, "id" | "title">;
  saveReportEditsAction: ServerAction | null;
  sourceFieldEntries: [string, unknown][];
  visibleCaptureCount: number;
}) {
  const editableSections = reportSections;
  const includedEvidenceCount = [
    ...photoEvidence,
    ...noteEvidence,
    ...otherEvidence,
  ].filter((item) => item.capture.include_in_report).length;

  return (
    <section className="card detail-card report-command-card form-stack generated-report-card">
      <div className="report-section-heading generated-report-heading">
        <div>
          <p className="eyebrow">Summary</p>
          <h2>{currentReport?.title ?? session.title}</h2>
          <p className="muted">
            A document-style review of the captured form, notes, photos, and recommendations.
          </p>
        </div>
        {currentReport?.status === "approved" ? (
          <p className="status-pill success">Ready</p>
        ) : currentReport ? (
          <p className="status-pill neutral">Review Required</p>
        ) : (
          <p className="status-pill neutral">Review Required</p>
        )}
      </div>

      <div className="report-story-card">
        <p className="eyebrow">Summary</p>
        <h3>{currentReport?.title ?? session.title}</h3>
        {currentReport?.summary ? (
          <p>{currentReport.summary}</p>
        ) : (
          <p className="muted">
            Building your report… Your evidence is saved. CRED is preparing the
            report so you can review it here.
          </p>
        )}
        {hasPendingEvidence ? (
          <p className="notice info compact-report-notice">
            Your evidence is saved. CRED is preparing the report. You can
            continue capturing while this finishes.
          </p>
        ) : null}
      </div>

      {!currentReport ? (
        <form action={generateReportAction} className="empty-report-shell">
          <div>
            <h3>Building your report…</h3>
            <p className="muted">
              {visibleCaptureCount > 0
                ? "Your evidence is saved. CRED is preparing the report. You can refresh this page or continue capturing while this finishes."
                : "No evidence has been added yet. Continue capturing to build the report."}
            </p>
          </div>
          <div className="form-actions report-inline-actions">
            <Link
              href={`/dashboard/sessions/${session.id}/capture`}
              className="button button-primary touch-target"
            >
              Continue Capturing
            </Link>
            <Link
              href={`/dashboard/sessions/${session.id}/report`}
              className="button button-secondary touch-target"
            >
              Refresh
            </Link>
            <button className="button button-secondary touch-target">
              Prepare Report
            </button>
          </div>
        </form>
      ) : null}

      {currentReport && isEditingReport && saveReportEditsAction ? (
        <form
          action={saveReportEditsAction}
          className="form-stack report-edit-form"
        >
          <div className="report-subsection report-edit-panel">
            <div className="report-section-title-row">
              <div>
                <h3>Edit report</h3>
                <p className="muted">
                  Make quick corrections before approval or export.
                </p>
              </div>
              <button className="button button-primary touch-target">
                Save Changes
              </button>
            </div>
            <label className="field-stack">
              <span className="label">Report title</span>
              <input
                className="input"
                name="report_title"
                defaultValue={currentReport.title ?? session.title}
              />
            </label>
            <label className="field-stack">
              <span className="label">Summary</span>
              <textarea
                className="input text-area"
                name="report_summary"
                rows={5}
                defaultValue={currentReport.summary ?? ""}
              />
            </label>
          </div>

          <div className="report-content-grid">
            {editableSections.map((section) => {
              const included = !isHiddenFromReport(section.metadata);
              return (
                <article
                  key={section.id}
                  className="report-edit-panel report-edit-item"
                >
                  <label className="report-visibility-toggle">
                    <input
                      type="checkbox"
                      name={`section_include_${section.id}`}
                      defaultChecked={included}
                    />
                    <span>
                      {included ? "Hide from report" : "Show in report"}
                    </span>
                  </label>
                  <label className="field-stack">
                    <span className="label">Heading</span>
                    <input
                      className="input"
                      name={`section_title_${section.id}`}
                      defaultValue={section.title}
                    />
                  </label>
                  <label className="field-stack">
                    <span className="label">Report text</span>
                    <textarea
                      className="input text-area"
                      name={`section_body_${section.id}`}
                      rows={5}
                      defaultValue={section.body ?? ""}
                    />
                  </label>
                </article>
              );
            })}
          </div>

          <section className="report-subsection report-edit-panel">
            <div>
              <h3>Supporting material</h3>
              <p className="muted">
                Edit notes and choose what appears in the final report.
              </p>
            </div>
            <EvidenceGallery
              isEditingReport
              noteEvidence={noteEvidence}
              otherEvidence={otherEvidence}
              photoEvidence={photoEvidence}
            />
          </section>

          <section className="report-subsection report-edit-panel">
            <div>
              <h3>Form fields</h3>
              <p className="muted">
                Correct form details that should appear in the report.
              </p>
            </div>
            <input
              type="hidden"
              name="field_count"
              value={sourceFieldEntries.length}
            />
            <div className="report-field-grid">
              {sourceFieldEntries.length > 0 ? (
                sourceFieldEntries.map(([key, value], index) => (
                  <div
                    key={key}
                    className="report-field-card report-edit-field-card"
                  >
                    <input
                      type="hidden"
                      name={`field_key_${index}`}
                      value={key}
                    />
                    <label className="report-visibility-toggle">
                      <input
                        type="checkbox"
                        name={`field_include_${index}`}
                        defaultChecked
                      />
                      <span>Show in report</span>
                    </label>
                    <label className="field-stack">
                      <span className="label">{key.replace(/_/g, " ")}</span>
                      <input
                        className="input"
                        name={`field_value_${index}`}
                        defaultValue={String(value)}
                      />
                    </label>
                  </div>
                ))
              ) : (
                <p className="muted">No saved form fields yet.</p>
              )}
            </div>
          </section>

          <div className="form-actions report-inline-actions report-primary-flow">
            <button className="button button-primary touch-target">
              Save Changes
            </button>
            <Link
              href={`/dashboard/sessions/${session.id}/report`}
              className="button button-secondary touch-target"
            >
              Cancel
            </Link>
            <Link
              href={`/dashboard/sessions/${session.id}/capture`}
              className="button button-secondary touch-target"
            >
              Continue Capturing
            </Link>
          </div>
        </form>
      ) : null}

      {!isEditingReport ? (
        <>
          <section className="report-subsection report-document-section">
            <div className="report-section-title-row">
              <div>
                <h3>{documentSections.length > 0 ? "Captured form" : "Evidence report"}</h3>
                <p className="muted">
                  {documentSections.length > 0
                    ? "Related fields are grouped under the same headings a customer would expect on the paper form."
                    : "Evidence is grouped with its notes, details, findings, and recommendations."}
                </p>
              </div>
            </div>
            {formStructureSummary.guidance.length > 0 ? (
              <div className="missing-form-guidance">
                {formStructureSummary.guidance.map((item) => (
                  <Link key={item} href={`/dashboard/sessions/${session.id}/capture`} className="suggestion-chip">{item}</Link>
                ))}
              </div>
            ) : null}
            {documentSections.length > 0 ? (
              <div className="report-document-flow">
                {documentSections.map((section) => (
                  <article key={section.key} className="report-document-card">
                    <h4>{section.title}</h4>
                    {section.body ? <p>{section.body}</p> : null}
                    {getProfessionalFields(section.fields).length > 0 ? (
                      <div className="report-field-grid">
                        {getProfessionalFields(section.fields).map((field) => (
                          <div key={`${section.key}-${field.key}`} className="report-field-card">
                            <span>{field.label}</span>
                            <strong>{field.value}</strong>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <EvidenceGroupList
                      captureIds={section.related_capture_ids}
                      evidenceGroups={evidenceGroups}
                      supportingEvidence={supportingEvidence}
                    />
                  </article>
                ))}
              </div>
            ) : (
              <EvidenceGroupList
                evidenceGroups={evidenceGroups}
                supportingEvidence={supportingEvidence}
              />
            )}
          </section>

          {documentSections.length > 0 ? (
            <section className="report-subsection report-supporting-section">
              <div className="report-section-title-row">
                <div>
                  <h3>Supporting evidence</h3>
                  <p className="muted">Evidence not already tied to a form section stays grouped here.</p>
                </div>
                <span className="status-pill neutral compact">{includedEvidenceCount} included</span>
              </div>
              <EvidenceGroupList evidenceGroups={evidenceGroups} supportingEvidence={supportingEvidence} />
            </section>
          ) : null}
        </>
      ) : null}

      <div className="form-actions report-inline-actions report-primary-flow">
        <Link
          href={`/dashboard/sessions/${session.id}/capture`}
          className="button button-secondary touch-target"
        >
          Continue Capturing
        </Link>
        {currentReport && !isEditingReport ? (
          <Link
            href={`/dashboard/sessions/${session.id}/report?edit=1`}
            className="button button-secondary touch-target"
          >
            Edit Report
          </Link>
        ) : null}
        {currentReport ? (
          <form action={generateReportAction}>
            <button className="button button-secondary touch-target">
              Update Report
            </button>
          </form>
        ) : null}
        {currentReport?.status !== "approved" && approveReportContentAction ? (
          <form action={approveReportContentAction}>
            <button className="button button-primary touch-target">
              Approve Report
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}


function getProfessionalFields<T extends { value: string }>(fields: T[]) {
  const captured = fields.filter((field) => field.value && !/^(not captured|pending|unknown)$/i.test(field.value.trim()));
  if (captured.length > 0) return captured;
  return fields.filter((field) => field.value).slice(0, 4);
}

function EvidenceGroupList({
  captureIds,
  evidenceGroups,
  supportingEvidence,
}: {
  captureIds?: string[];
  evidenceGroups: ReturnType<typeof buildEvidenceGroups>;
  supportingEvidence: SupportingEvidenceItem[];
}) {
  const evidenceById = new Map(supportingEvidence.map((item) => [item.capture.id, item]));
  const allowedIds = captureIds && captureIds.length > 0 ? new Set(captureIds) : null;
  const groups = evidenceGroups.filter((group) => !allowedIds || allowedIds.has(group.capture_id));

  if (groups.length === 0) return <p className="muted">No supporting evidence attached yet.</p>;

  return (
    <div className="evidence-first-list">
      {groups.map((group) => {
        const item = evidenceById.get(group.capture_id);
        if (!item) return null;
        return (
          <article key={group.capture_id} className="evidence-first-card">
            <div className="evidence-first-media">
              {item.kind === "photo" && item.signedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed evidence URLs are short-lived Supabase links and should render exactly as captured.
                <img src={item.signedUrl} alt={item.title} />
              ) : (
                <div className="review-evidence-placeholder">{item.title}</div>
              )}
            </div>
            <div className="evidence-first-body">
              <h4>{item.title}</h4>
              {group.details.map((detail, index) => (
                <p key={`${detail.label}-${index}`}><strong>{detail.label}:</strong> {detail.value}</p>
              ))}
              {group.findings.length > 0 ? (
                <div><strong>Observed condition</strong>{group.findings.map((finding, index) => <p key={`finding-${index}`} className="muted">{finding}</p>)}</div>
              ) : null}
              {group.recommendations.length > 0 ? (
                <div><strong>Recommendation</strong>{group.recommendations.map((recommendation, index) => <p key={`recommendation-${index}`} className="muted">{recommendation}</p>)}</div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function EvidenceGallery({
  isEditingReport = false,
  noteEvidence,
  otherEvidence,
  photoEvidence,
}: {
  isEditingReport?: boolean;
  noteEvidence: SupportingEvidenceItem[];
  otherEvidence: SupportingEvidenceItem[];
  photoEvidence: SupportingEvidenceItem[];
}) {
  if (isEditingReport) {
    const evidenceItems = [
      ...photoEvidence,
      ...noteEvidence,
      ...otherEvidence,
    ].filter(
      (item, index, items) =>
        items.findIndex(
          (candidate) => candidate.capture.id === item.capture.id,
        ) === index,
    );

    return (
      <div className="review-note-list report-edit-evidence-list">
        {evidenceItems.length > 0 ? (
          evidenceItems.map((item) => (
            <article
              key={item.capture.id}
              className="review-note-card report-edit-evidence-card"
            >
              <label className="report-visibility-toggle">
                <input
                  type="checkbox"
                  name={`capture_include_${item.capture.id}`}
                  defaultChecked={item.capture.include_in_report}
                />
                <span>
                  {item.capture.include_in_report
                    ? "Hide from report"
                    : "Show in report"}
                </span>
              </label>
              <div className="report-edit-evidence-preview">
                {item.kind === "photo" && item.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed evidence URLs are short-lived Supabase links and should render exactly as captured.
                  <img src={item.signedUrl} alt={item.title} />
                ) : null}
                <strong>{item.title}</strong>
              </div>
              <label className="field-stack">
                <span className="label">
                  Technician notes / evidence caption
                </span>
                <textarea
                  className="input text-area"
                  name={`capture_note_${item.capture.id}`}
                  rows={3}
                  defaultValue={item.note ?? ""}
                />
              </label>
            </article>
          ))
        ) : (
          <p className="muted">No supporting material added yet.</p>
        )}
      </div>
    );
  }

  return (
    <div className="evidence-gallery-shell">
      <div>
        <h4>Photos</h4>
        {photoEvidence.length > 0 ? (
          <div className="review-photo-grid">
            {photoEvidence.slice(0, 8).map((item) => (
              <article key={item.capture.id} className="review-photo-card">
                {item.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed evidence URLs are short-lived Supabase links and should render exactly as captured.
                  <img src={item.signedUrl} alt={item.title} />
                ) : (
                  <div className="review-evidence-placeholder">Photo saved</div>
                )}
                <div>
                  <strong>{item.title}</strong>
                  <p className="muted">{item.note ?? "Supporting photo"}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">No photos added yet.</p>
        )}
      </div>

      <div>
        <h4>Technician notes</h4>
        {noteEvidence.length > 0 ? (
          <div className="review-note-list">
            {noteEvidence.slice(0, 8).map((item) => (
              <article key={item.capture.id} className="review-note-card">
                <strong>{item.title}</strong>
                <p>{item.note ?? "Text note saved for this report."}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">No technician notes added yet.</p>
        )}
      </div>

      {otherEvidence.length > 0 ? (
        <div>
          <h4>Additional files</h4>
          <div className="review-note-list">
            {otherEvidence.slice(0, 6).map((item) => (
              <article key={item.capture.id} className="review-note-card">
                <strong>{item.title}</strong>
                <p className="muted">{item.note ?? "Saved with the report."}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InlineReviewPanel({
  children,
  reminders,
  currentReport,
  isReadyForExport,
  markReviewedAction,
  missingEvidenceCount,
  reviewedBy,
  reviewedLabel,
  sessionId,
  signatureCount,
  visibleCaptureCount,
}: {
  children: React.ReactNode;
  reminders: CoverageReminder[];
  currentReport: AiReportDraft | null;
  isReadyForExport: boolean;
  markReviewedAction: ServerAction;
  missingEvidenceCount: number;
  reviewedBy: string | null;
  reviewedLabel: string | null;
  sessionId: string;
  signatureCount: number;
  visibleCaptureCount: number;
}) {
  return (
    <aside className="report-inline-review-panel" aria-label="Report review controls">
      <section className="card detail-card report-sidebar-card form-stack">
        <div>
          <p className="eyebrow">Ways to improve</p>
          <h2>
            {reminders.length > 0
              ? `${reminders.length} suggestion${reminders.length === 1 ? "" : "s"}`
              : "All set"}
          </h2>
        </div>
        <div className="coverage-reminder-list">
          {reminders.length > 0 ? (
            reminders.map((row) => <p key={row.rule.key}>• {row.rule.label}</p>)
          ) : (
            <p>✓ The report has the expected supporting material.</p>
          )}
        </div>
        <Link
          href={`/dashboard/sessions/${sessionId}/capture`}
          className="button button-secondary touch-target"
        >
          Continue Capturing
        </Link>
      </section>

      <section
        id="approval"
        className="card detail-card report-sidebar-card form-stack"
      >
        <div>
          <p className="eyebrow">Ready</p>
          <h2>{isReadyForExport ? "Approved" : "Approve Report"}</h2>
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
              currentReport ? "checkline complete" : "checkline neutral"
            }
          >
            {currentReport ? "✓" : "○"} Findings reviewed
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
            {missingEvidenceCount === 0 ? "✓" : "○"} Suggested additions
            considered
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
                I considered the suggestions and approve this report.
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

      {children}
    </aside>
  );
}

function ExportPanel({
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
  const activeShareTokens = shareTokens.filter((token) => !token.disabled_at);

  return (
    <section
      id="export-report"
      className="card detail-card report-sidebar-card report-delivery-tabs export-panel form-stack"
    >
      <div>
        <p className="eyebrow">Export</p>
        <h2>Export Report</h2>
        <p className="muted delivery-helper">
          {isReadyForExport
            ? "Send, share, print, or save the approved report with your latest edits."
            : "Approve this report before exporting."}
        </p>
      </div>

      <div className="export-action-stack" aria-label="Export actions">
        <form action={emailAction} className="form-stack export-action-card">
          <div>
            <h3>Email</h3>
            <p className="muted">Send a secure report link to recipients.</p>
          </div>
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
              disabled={!isReadyForExport}
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
              disabled={!isReadyForExport}
            />
          </div>
          <button
            className="button button-primary touch-target"
            disabled={!isReadyForExport}
          >
            Email Report
          </button>
        </form>

        <form action={shareAction} className="form-stack export-action-card">
          <div>
            <h3>Share Link</h3>
            <p className="muted">Create a secure link for this report.</p>
          </div>
          <div className="field-stack">
            <label htmlFor="expires_at" className="label">
              Expiration date
            </label>
            <input
              id="expires_at"
              name="expires_at"
              className="input"
              type="datetime-local"
              disabled={!isReadyForExport}
            />
          </div>
          <button
            className="button button-secondary touch-target"
            disabled={!isReadyForExport}
          >
            Copy Share Link
          </button>
        </form>

        <div className="export-action-card export-button-grid">
          <div>
            <h3>Print</h3>
            <p className="muted">Open the printable report in a new tab.</p>
          </div>
          {isReadyForExport ? (
            <Link
              href={reportPath}
              className="button button-secondary touch-target"
              target="_blank"
            >
              Print
            </Link>
          ) : (
            <span
              className="button button-secondary touch-target disabled-action"
              aria-disabled="true"
            >
              Print
            </span>
          )}
        </div>

        <div className="export-action-card export-button-grid">
          <div>
            <h3>Save</h3>
            <p className="muted">
              Save a PDF copy or keep this report in CRED.
            </p>
          </div>
          {isReadyForExport ? (
            <Link
              href={reportPath}
              className="button button-secondary touch-target"
              target="_blank"
            >
              Save PDF
            </Link>
          ) : (
            <span
              className="button button-secondary touch-target disabled-action"
              aria-disabled="true"
            >
              Save PDF
            </span>
          )}
          <form action={saveAction}>
            <button
              className="button button-primary touch-target"
              disabled={!isReadyForExport}
            >
              Save Report
            </button>
          </form>
        </div>
      </div>

      {activeShareTokens.length > 0 ? (
        <div
          className="compact-token-list export-share-list"
          aria-label="Current share links"
        >
          {activeShareTokens.map((token) => {
            const shareUrl = origin
              ? `${origin}/reports/share/${token.token}`
              : `/reports/share/${token.token}`;
            return (
              <article key={token.id} className="compact-token-item">
                <div>
                  <strong>{shareUrl}</strong>
                  <p className="muted">
                    {token.expires_at
                      ? `Expires ${formatDateTime(token.expires_at)}`
                      : "No expiration"}
                  </p>
                </div>
                <form
                  action={disableReportShareLink.bind(
                    null,
                    sessionId,
                    token.id,
                  )}
                >
                  <button className="button button-secondary touch-target">
                    Remove Link
                  </button>
                </form>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
