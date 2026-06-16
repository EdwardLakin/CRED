import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getCaptureProcessingStatus,
  getRequiredEvidenceCompletion,
  getInspectionProgress,
} from "@/features/capture";
import {
  buildCustomerAssetRows,
  buildEvidencePackages,
  buildNormalizedReportModel,
  classifyReferenceDocumentTitle,
  deriveFormSectionsFromCaptures,
  getFormStructureSummary,
  sanitizeReportStructureForSession,
  isCustomerAssetSection,
  normalizeDraftSections,
  shouldRenderDetail,
  shouldRenderDraftSectionStandalone,
  splitRecommendationText,
  stripConfidenceText,
  getNormalizedInspectionStatus,
  getNormalizedFindingModels,
  getNormalizedRecommendedActions,
  isMeaningfulCustomerReportText,
} from "@/features/reports/report-structure";
import {
  createReportShareLink,
  disableReportShareLink,
  emailReport,
  generateAiReportDraft,
  markReportReviewed,
  saveReport,
  saveReportEdits,
} from "@/features/reports/actions";
import { formatDate, formatDateTime } from "@/features/sessions";
import { requireSessionWorkspace } from "@/features/sessions/data";
import { SignatureCaptureForm } from "@/features/signatures";
import { useSavedSignature } from "@/features/signatures/actions";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
type DocumentationSession = Tables["documentation_sessions"]["Row"];
type AiReportDraft = Tables["ai_report_drafts"]["Row"];
type AiReportDraftSection = Tables["ai_report_draft_sections"]["Row"];
type ReportShareToken = Tables["report_share_tokens"]["Row"];
type CaptureItem = Tables["capture_items"]["Row"];
type SignatureCapture = Tables["signature_captures"]["Row"];
type ServerAction = (formData: FormData) => void | Promise<void>;
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
      ([key, entryValue]) =>
        entryValue !== null && entryValue !== undefined && entryValue !== "" && !/confidence|classification|ocr|document_type|workflow|template/i.test(key),
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
  if (capture.media_kind === "document" && capture.storage_path?.match(/\.(jpg|jpeg|png|webp|gif|heic)$/i)) return "photo";
  if (capture.media_kind === "video" || capture.type === "video")
    return "video";
  if (capture.media_kind === "audio" || capture.type === "voice_note")
    return "audio";
  if (capture.media_kind === "document") return "document";
  return "file";
}

function getEvidenceTitle(item: CaptureItem) {
  const referenceTitle = classifyReferenceDocumentTitle(item);
  if (referenceTitle !== "Reference Document" || item.media_kind === "document") return referenceTitle;
  if (item.type === "text_note" || item.media_kind === "note")
    return "Technician Note";
  if (isPhotoCapture(item)) return "Inspection Photo";
  if (item.media_kind === "video" || item.type === "video")
    return "Inspection Video";
  if (item.media_kind === "audio" || item.type === "voice_note")
    return "Voice Note";
  return "Supporting Evidence";
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

  const { data: signatures } = await supabase
    .from("signature_captures")
    .select("*")
    .eq("documentation_session_id", session.id)
    .eq("organization_id", profile.organization_id)
    .order("signed_at", { ascending: false });

  const signatureUrls: Record<string, string> = {};
  await Promise.all(
    (signatures ?? []).map(async (signature) => {
      const { data } = await supabase.storage
        .from("documentation-signatures")
        .createSignedUrl(signature.signature_image_path, 60 * 10);
      if (data?.signedUrl) signatureUrls[signature.id] = data.signedUrl;
    }),
  );

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
        .eq("documentation_session_id", session.id)
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
  const visibleCaptures = allCaptures;
  const signedEvidenceUrls: Record<string, string> = {};
  await Promise.all(
    visibleCaptures.map(async (capture) => {
      const path = isPhotoCapture(capture) ? (capture.storage_path ?? capture.thumbnail_path) : (capture.thumbnail_path ?? capture.storage_path);
      if (!path) return;
      const { data } = await supabase.storage
        .from("documentation-captures")
        .createSignedUrl(path, 60 * 10);
      if (data?.signedUrl) signedEvidenceUrls[capture.id] = data.signedUrl;
    }),
  );
  const supportingEvidence = visibleCaptures.map((capture) => ({
    capture,
    signedUrl: signedEvidenceUrls[capture.id] ?? null,
    title: getEvidenceTitle(capture),
    note: getEvidenceNote(capture),
    kind: getEvidenceKind(capture),
  }));
  const visibleReportSections = (reportSections ?? []).filter((section) => !isHiddenFromReport(section.metadata));
  const normalizedReportSections = normalizeDraftSections(visibleReportSections, visibleCaptures);
  const derivedFormSections = deriveFormSectionsFromCaptures(visibleCaptures);
  const documentSections = normalizedReportSections.length > 0 ? normalizedReportSections : derivedFormSections;
  const sanitizedReportStructure = sanitizeReportStructureForSession(currentReport?.report_structure ?? null, visibleCaptures.map((capture) => capture.id));
  const formStructureSummary = getFormStructureSummary(sanitizedReportStructure, documentSections);
  const reviewDocument = buildNormalizedReportModel({
    captures: visibleCaptures,
    sections: documentSections,
    draftSections: visibleReportSections,
    measurements: currentReport?.measurements ?? [],
    findings: currentReport?.findings ?? [],
  });
  const evidencePackages = buildEvidencePackages(visibleCaptures, reviewDocument.findings.map((entry) => entry.group));
  const progress = getInspectionProgress(visibleCaptures, session.session_type, template?.required_evidence ?? null, (signatures ?? []).length);
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
    ? formatDateTime(session.reviewed_at, profile.timezone)
    : null;
  const markReviewedAction = markReportReviewed.bind(null, session.id);
  const saveAction = saveReport.bind(null, session.id);
  const emailAction = emailReport.bind(null, session.id);
  const shareAction = createReportShareLink.bind(null, session.id);
  const generateReportAction = generateAiReportDraft.bind(null, session.id);
  const saveReportEditsAction = currentReport
    ? saveReportEdits.bind(null, currentReport.id)
    : null;
  const sourceFieldEntries = getDisplayEntries(currentReport?.header_fields);
  const isEditingReport = Boolean(currentReport);
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
            currentReport={currentReport}
            isEditingReport={isEditingReport}
            generateReportAction={generateReportAction}
            hasPendingEvidence={hasPendingEvidence}
            noteEvidence={noteEvidence}
            otherEvidence={otherEvidence}
            photoEvidence={photoEvidence}
            documentSections={documentSections}
            formStructureSummary={formStructureSummary}
            reviewDocument={reviewDocument}
            evidencePackages={evidencePackages}
            customerAssetRows={buildCustomerAssetRows(documentSections, session as unknown as Record<string, unknown>)}
            supportingEvidence={supportingEvidence}
            session={session}
            saveReportEditsAction={saveReportEditsAction}
            sourceFieldEntries={sourceFieldEntries}
            visibleCaptureCount={visibleCaptures.length}
            progress={progress}
            facilityName={profile.company_profile?.facility_name ?? profile.company_profile?.company_name ?? profile.organization.name}
            facilityLocation={[profile.company_profile?.facility_city, profile.company_profile?.facility_region].filter(Boolean).join(", ")}
            timeZone={profile.timezone}
          />

          <InspectorFacilityPanel profile={profile} sessionId={session.id} signatures={signatures ?? []} signatureUrls={signatureUrls} />

        </div>

        <InlineReviewPanel
          isReadyForExport={isReadyForExport}
          markReviewedAction={markReviewedAction}
          missingEvidenceCount={evidence.missing.length}
          reviewedBy={reviewer?.full_name ?? session.reviewed_by}
          reviewedLabel={reviewedLabel}
        />

        <ExportPanel
          emailAction={emailAction}
          isReadyForExport={isReadyForExport}
          origin={origin}
          reportPath={reportPath}
          saveAction={saveAction}
          sessionId={session.id}
          shareAction={shareAction}
          shareTokens={shareTokens ?? []}
          timeZone={profile.timezone}
        />
      </div>
    </main>
  );
}

function GeneratedReportReview({
  reportSections,
  currentReport,
  generateReportAction,
  hasPendingEvidence,
  isEditingReport,
  noteEvidence,
  otherEvidence,
  photoEvidence,
  documentSections,
  formStructureSummary,
  reviewDocument,
  evidencePackages,
  customerAssetRows,
  supportingEvidence,
  session,
  saveReportEditsAction,
  sourceFieldEntries,
  visibleCaptureCount,
  progress,
  facilityName,
  facilityLocation,
  timeZone,
}: {
  reportSections: AiReportDraftSection[];
  currentReport: AiReportDraft | null;
  generateReportAction: ServerAction;
  hasPendingEvidence: boolean;
  isEditingReport: boolean;
  noteEvidence: SupportingEvidenceItem[];
  otherEvidence: SupportingEvidenceItem[];
  photoEvidence: SupportingEvidenceItem[];
  documentSections: ReturnType<typeof normalizeDraftSections>;
  formStructureSummary: ReturnType<typeof getFormStructureSummary>;
  reviewDocument: ReturnType<typeof buildNormalizedReportModel<CaptureItem>>;
  evidencePackages: ReturnType<typeof buildEvidencePackages>;
  customerAssetRows: ReturnType<typeof buildCustomerAssetRows>;
  supportingEvidence: SupportingEvidenceItem[];
  session: Pick<DocumentationSession, "id" | "title">;
  saveReportEditsAction: ServerAction | null;
  sourceFieldEntries: [string, unknown][];
  visibleCaptureCount: number;
  progress: ReturnType<typeof getInspectionProgress>;
  facilityName: string;
  facilityLocation: string;
  timeZone: string | null;
}) {
  const editableSections = reportSections;
  const includedEvidenceCount = [
    ...photoEvidence,
    ...noteEvidence,
    ...otherEvidence,
  ].filter((item) => item.capture.include_in_report).length;
  const findings = reviewDocument.findingModels;
  const actions = reviewDocument.recommendedActions;
  const severityBreakdown = reviewDocument.summary.severityBreakdown;

  return (
    <section className="card detail-card report-command-card form-stack generated-report-card">
      <div className="report-section-heading generated-report-heading">
        <div>
          <p className="eyebrow">Summary</p>
          <h2>{stripConfidenceText(currentReport?.title ?? session.title)}</h2>
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

      <div className="report-cover-card">
        <div className="report-logo-mark" aria-hidden="true">{facilityName.slice(0, 1).toUpperCase()}</div>
        <div>
          <p className="eyebrow">Professional Inspection Report</p>
          <h3>{stripConfidenceText(currentReport?.title ?? session.title)}</h3>
          <p className="muted">{facilityName}{facilityLocation ? ` · ${facilityLocation}` : ""}</p>
        </div>
      </div>

      <section className="inspection-summary-card">
        <div className="report-section-title-row">
          <div>
            <p className="eyebrow">Inspection Summary</p>
            <h3>Inspection completed on {formatDate(new Date().toISOString(), timeZone)}</h3>
          </div>
          <span className="status-pill attention">{getNormalizedInspectionStatus(findings)}</span>
        </div>
        {currentReport?.summary ? <p>{stripConfidenceText(currentReport.summary)}</p> : null}
        <div className="inspection-metric-grid">
          <div><span>Total Findings</span><strong>{findings.length}</strong></div>
          <div><span>Critical Findings</span><strong>{reviewDocument.summary.criticalFindings}</strong></div>
          <div><span>Reference Documents Captured</span><strong>{reviewDocument.referenceDocuments.length}</strong></div>
          <div><span>Evidence Items Captured</span><strong>{includedEvidenceCount}</strong></div>
        </div>
        <div className="inspection-metric-grid">
          <div><span>Evidence Completeness</span><strong>{progress.evidenceCompleteness}%</strong></div>
          <div><span>Finding Confidence</span><strong>{progress.findingConfidence}%</strong></div>
          <div><span>Report Readiness</span><strong>{progress.reportReadiness}%</strong></div>
          <div><span>Remaining Required Items</span><strong>{progress.remainingRequiredItems}</strong></div>
        </div>
        {progress.missingReadinessItems.length > 0 ? (
          <p className="notice info">Final verification remaining: {progress.missingReadinessItems.join(', ')}. AI cannot auto approve, certify, or sign this report.</p>
        ) : null}
        <div className="summary-columns">
          <div>
            <h4>Findings Identified</h4>
            {severityBreakdown.length > 0 ? <ul>{severityBreakdown.map((item) => <li key={item.key}>{item.count} {item.label}</li>)}</ul> : <p className="muted">No findings identified from included evidence.</p>}
          </div>
          <div>
            <h4>Recommended Actions</h4>
            {actions.length > 0 ? <ul>{actions.map((item) => <li key={item.action}>{item.action}</li>)}</ul> : <p className="muted">No recommended actions captured.</p>}
          </div>
        </div>
      </section>
      {hasPendingEvidence ? (
        <p className="notice info compact-report-notice">
          Your evidence is saved. CRED is preparing the report. You can
          continue capturing while this finishes.
        </p>
      ) : null}

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
                <h3>Review and correct report</h3>
                <p className="muted">
                  Edit this report directly, then save changes before approval or export.
                </p>
              </div>
            </div>
            <label className="field-stack">
              <span className="label">Report title</span>
              <input
                className="input"
                name="report_title"
                defaultValue={stripConfidenceText(currentReport.title ?? session.title)}
              />
            </label>
            <label className="field-stack">
              <span className="label">Summary</span>
              <textarea
                className="input text-area"
                name="report_summary"
                rows={5}
                defaultValue={stripConfidenceText(currentReport.summary ?? "")}
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
                      defaultValue={stripConfidenceText(section.title)}
                    />
                  </label>
                  <label className="field-stack">
                    <span className="label">Report text</span>
                    <textarea
                      className="input text-area"
                      name={`section_body_${section.id}`}
                      rows={5}
                      defaultValue={stripConfidenceText(section.body ?? "")}
                    />
                  </label>
                  {normalizeDraftSections([section], []).flatMap((item) => item.fields).length > 0 ? (
                    <div className="report-field-grid">
                      <input type="hidden" name={`section_field_count_${section.id}`} value={normalizeDraftSections([section], []).flatMap((item) => item.fields).length} />
                      {normalizeDraftSections([section], []).flatMap((item) => item.fields).map((field, fieldIndex) => (
                        <div key={`${section.id}-${field.key}-${fieldIndex}`} className="report-field-card report-edit-field-card">
                          <input type="hidden" name={`section_field_key_${section.id}_${fieldIndex}`} value={field.key} />
                          <input type="hidden" name={`section_field_label_${section.id}_${fieldIndex}`} value={field.label} />
                          <label className="report-visibility-toggle">
                            <input type="checkbox" name={`section_field_include_${section.id}_${fieldIndex}`} defaultChecked />
                            <span>Show field</span>
                          </label>
                          <label className="field-stack">
                            <span className="label">{field.label}</span>
                            <input className="input" name={`section_field_value_${section.id}_${fieldIndex}`} defaultValue={stripConfidenceText(field.value)} />
                          </label>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <section className="report-subsection report-edit-panel">
            <div>
              <h3>Report evidence</h3>
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
                <h3>Customer / Asset Details</h3>
                <p className="muted">
                  {documentSections.length > 0
                    ? "Related fields are grouped under familiar report headings."
                    : "Evidence is grouped with notes, details, observations, and recommendations."}
                </p>
              </div>
            </div>
            {formStructureSummary.guidance.length > 0 ? (
              <div className="missing-form-guidance">
                {formStructureSummary.isFormStructured ? <span className="status-pill neutral compact">Based on captured form</span> : null}
                {formStructureSummary.guidance.map((item) => (
                  <Link key={item} href={`/dashboard/sessions/${session.id}/capture`} className="suggestion-chip">{item}</Link>
                ))}
              </div>
            ) : null}
            {customerAssetRows.length > 0 ? (
              <div className="report-field-grid">{customerAssetRows.map((field) => <div key={field.label} className="report-field-card"><span>{field.label}</span><strong>{stripConfidenceText(field.value)}</strong></div>)}</div>
            ) : null}
            {documentSections.filter((section) => shouldRenderDraftSectionStandalone(section) && !isCustomerAssetSection(section) && !/supporting details|supporting evidence/i.test(section.title)).length > 0 ? (
              <div className="report-document-flow">
                {documentSections.filter((section) => shouldRenderDraftSectionStandalone(section) && !isCustomerAssetSection(section) && !/supporting details|supporting evidence/i.test(section.title)).map((section) => (
                  <article key={section.key} className="report-document-card">
                    <h4>{stripConfidenceText(/supporting details/i.test(section.title) ? "Supporting Evidence" : section.title)}</h4>
                    {section.body ? (/recommend/i.test(section.title) ? <ul>{splitRecommendationText(section.body).map((item, index) => <li key={index}>{stripConfidenceText(item)}</li>)}</ul> : <p>{stripConfidenceText(section.body)}</p>) : null}
                    {getProfessionalFields(section.fields).length > 0 ? (
                      <div className="report-field-grid">
                        {getProfessionalFields(section.fields).map((field) => (
                          <div key={`${section.key}-${field.key}`} className="report-field-card">
                            <span>{field.label}</span>
                            <strong>{stripConfidenceText(field.value)}</strong>
                          </div>
                        ))}
                      </div>
                    ) : null}

                  </article>
                ))}
              </div>
            ) : (
              <EvidenceGroupList
                items={reviewDocument.findings}
                supportingEvidence={supportingEvidence}
              />
            )}
          </section>

          {documentSections.length > 0 ? (
            <section className="report-subsection report-supporting-section">
              <div className="report-section-title-row">
                <div>
                  <h3>Inspection Findings</h3>
                  <p className="muted">Issue and condition evidence tied to findings, measurements, and recommendations.</p>
                </div>
                <span className="status-pill neutral compact">{includedEvidenceCount} included</span>
              </div>
              <EvidencePackageList packages={evidencePackages} supportingEvidence={supportingEvidence} />
              <FindingCardList items={reviewDocument.findings} supportingEvidence={supportingEvidence} />
              <RecommendedActionsTable findings={findings} />
              {reviewDocument.referenceDocuments.length > 0 ? <><h3>Reference Documents</h3><ReferenceDocumentList items={reviewDocument.referenceDocuments} supportingEvidence={supportingEvidence} /></> : null}
              {reviewDocument.additionalNotes.some((entry) => isMeaningfulCustomerReportText([entry.capture.technician_note, entry.capture.transcript, ...entry.group.findings, ...entry.group.recommendations].filter(Boolean).join(" "))) ? <><h3>Additional Notes</h3><EvidenceGroupList items={reviewDocument.additionalNotes.filter((entry) => isMeaningfulCustomerReportText([entry.capture.technician_note, entry.capture.transcript, ...entry.group.findings, ...entry.group.recommendations].filter(Boolean).join(" ")))} supportingEvidence={supportingEvidence} /></> : null}
              {reviewDocument.supportingEvidence.length > 0 ? <><h3>Supporting Evidence</h3><EvidenceGroupList items={reviewDocument.supportingEvidence} supportingEvidence={supportingEvidence} /></> : null}
              {reviewDocument.unattachedDetails.length > 0 ? (
                <div className="evidence-first-card">
                  <div className="evidence-first-body">
                    <h4>Supporting Evidence</h4>
                    {reviewDocument.unattachedDetails.map((detail, index) => (
                      <p key={`${detail.label}-${index}`}><strong>{detail.label}:</strong> {stripConfidenceText(detail.value)}</p>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

    </section>
  );
}



function InspectorFacilityPanel({
  profile,
  sessionId,
  signatures,
  signatureUrls,
}: {
  profile: Awaited<ReturnType<typeof requireSessionWorkspace>>["profile"];
  sessionId: string;
  signatures: SignatureCapture[];
  signatureUrls: Record<string, string>;
}) {
  const facility = profile.company_profile;
  const address = [facility?.facility_address_line_1, facility?.facility_address_line_2, facility?.facility_city, facility?.facility_region, facility?.facility_postal_code, facility?.facility_country].filter(Boolean).join(', ');
  const latestSignature = signatures.find((signature) => /inspector|technician/i.test(signature.signature_type)) ?? signatures[0];
  const canUseSavedSignature = Boolean(profile.use_default_signature && profile.default_signature_path && !latestSignature);
  const useSavedSignatureAction = useSavedSignature.bind(null, sessionId);
  const rows = [
    ['Inspector name', profile.full_name],
    ['Role/title', profile.inspector_role_or_title],
    ['Technician licence number', profile.technician_license_number],
    ['Facility name', facility?.facility_name ?? facility?.company_name],
    ['Facility number', facility?.facility_number],
    ['Facility address', address],
    ['Permit number', facility?.permit_number],
    ['Certification number', facility?.certification_number],
  ].filter(([, value]) => typeof value === 'string' && value.trim());
  return (
    <section className="card detail-card report-command-card form-stack signature-review-panel">
      <div className="report-section-heading generated-report-heading"><div><p className="eyebrow">Report details</p><h2>Inspector / Facility Details</h2><p className="muted">Autofilled from Settings and included in the export.</p></div></div>
      {rows.length > 0 ? <div className="report-field-grid">{rows.map(([label, value]) => <div key={label} className="report-field-card"><span>{label}</span><strong>{value}</strong></div>)}</div> : <p className="muted">No inspector or facility details saved yet.</p>}
      <p className="muted">Saved default signature: {profile.default_signature_path ? (profile.use_default_signature ? "Available and enabled" : "Available but disabled") : "Not saved"}.</p>
      {canUseSavedSignature ? <form action={useSavedSignatureAction}><button className="button button-secondary touch-target">Use saved signature</button></form> : null}
      {latestSignature && signatureUrls[latestSignature.id] ? (
        <div className="saved-signature-card">
          <strong>Signature</strong>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed signature URLs are short-lived Supabase links and should render exactly as captured. */}
          <img className="saved-signature-image" src={signatureUrls[latestSignature.id]} alt="Saved report signature" />
        </div>
      ) : <p className="muted">No report-specific signature captured.</p>}
      <SignatureCaptureForm sessionId={sessionId} />
    </section>
  );
}

function getProfessionalFields<T extends { value: string }>(fields: T[]) {
  const captured = fields.filter((field) => field.value && !/^(not captured|pending|unknown)$/i.test(field.value.trim()));
  if (captured.length > 0) return captured;
  return fields.filter((field) => field.value).slice(0, 4);
}



function EvidencePackageList({
  packages,
  supportingEvidence,
}: {
  packages: ReturnType<typeof buildEvidencePackages>;
  supportingEvidence: SupportingEvidenceItem[];
}) {
  const evidenceById = new Map(supportingEvidence.map((item) => [item.capture.id, item]));
  if (packages.length === 0) return <p className="muted">No evidence groups available yet.</p>;
  return (
    <section className="evidence-package-section">
      <div className="report-section-title-row"><div><h3>Evidence Groups</h3><p className="muted">Related captures are grouped into reviewable evidence packages with findings, source values, and traceability.</p></div></div>
      <div className="evidence-package-list">
        {packages.map((group) => (
          <details key={group.id} className="evidence-package-card" open>
            <summary><span><strong>{group.title}</strong><span className="muted">({group.capture_ids.length} capture{group.capture_ids.length === 1 ? "" : "s"})</span></span><span className="status-pill neutral compact">{Math.round(group.confidence * 100)}%</span></summary>
            <p>{group.summary}</p>
            {group.duplicate_flags.length > 0 ? <p className="notice warning">Possible Duplicate — review flagged captures before delivery.</p> : null}
            <div className="finding-card-grid"><div><strong>Finding</strong><p>{group.generated_finding.text}</p><p className="muted">Severity: {group.generated_finding.severity} · Confidence {Math.round(group.generated_finding.confidence * 100)}%</p></div><div><strong>Source values</strong>{group.generated_finding.source_values.length > 0 ? <ul>{group.generated_finding.source_values.map((field) => <li key={`${group.id}-${field.key}-${field.display_value}`}>{field.label}: {field.display_value} <span className="muted">({field.source_capture_ids.length} source{field.source_capture_ids.length === 1 ? "" : "s"})</span></li>)}</ul> : <p className="muted">No normalized readings extracted.</p>}</div></div>
            {group.recommendations.length > 0 ? <div><strong>Recommendations</strong><ul>{group.recommendations.map((item) => <li key={item.text}>{item.text} <span className="muted">Supported by {item.supporting_capture_ids.length} capture{item.supporting_capture_ids.length === 1 ? "" : "s"}</span></li>)}</ul></div> : null}
            <details className="finding-evidence-details"><summary>Supporting Evidence</summary><div className="evidence-chip-list">{group.capture_ids.map((id) => { const item = evidenceById.get(id); return item ? <span key={id} className="status-pill neutral compact">{item.title}</span> : null })}</div></details>
          </details>
        ))}
      </div>
    </section>
  );
}

function FindingCardList({
  items,
  supportingEvidence,
}: {
  items: ReturnType<typeof buildNormalizedReportModel<CaptureItem>>["findings"];
  supportingEvidence: SupportingEvidenceItem[];
}) {
  const evidenceById = new Map(supportingEvidence.map((item) => [item.capture.id, item]));
  const findings = getNormalizedFindingModels(items);
  if (findings.length === 0) return <p className="muted">No inspection findings attached yet.</p>;
  return <div className="finding-card-list">{findings.map((finding, index) => {
    const evidence = evidenceById.get(finding.id);
    return <article key={finding.id} className="professional-finding-card">
      <div className="finding-card-header"><div><p className="eyebrow">Finding {index + 1}</p><h4>Finding {index + 1} — {finding.title}</h4></div><span className="severity-badge">{finding.severity.label}</span></div>
      <div className="finding-card-grid">
        <div><strong>Observed Condition</strong>{finding.observations.length > 0 ? finding.observations.map((item) => <p key={item}>{item}</p>) : <p className="muted">Condition documented in supporting evidence.</p>}</div>
        <div><strong>Recommendation</strong>{finding.recommendations.length > 0 ? <ul>{finding.recommendations.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">No recommendation captured.</p>}</div>
      </div>
      <details className="finding-evidence-details"><summary>Supporting Evidence · {finding.evidenceCount} item{finding.evidenceCount === 1 ? "" : "s"}</summary>{evidence ? <EvidenceGroupList items={items.filter((entry) => entry.group.capture_id === finding.id)} supportingEvidence={supportingEvidence} /> : <p className="muted">Evidence item captured.</p>}</details>
    </article>;
  })}</div>;
}

function RecommendedActionsTable({ findings }: { findings: ReturnType<typeof buildNormalizedReportModel<CaptureItem>>["findingModels"] }) {
  const actions = getNormalizedRecommendedActions(findings);
  if (actions.length === 0) return null;
  return <section className="recommended-actions-card"><h3>Recommended Actions</h3><div className="actions-table"><div><strong>Priority</strong><strong>Action</strong></div>{actions.map((item) => <div key={item.action}><span>{item.priority}</span><span>{item.action}</span></div>)}</div></section>;
}

function ReferenceDocumentList({ items, supportingEvidence }: { items: ReturnType<typeof buildNormalizedReportModel<CaptureItem>>["findings"]; supportingEvidence: SupportingEvidenceItem[] }) {
  return <div className="reference-document-list">{items.map((entry) => {
    const details = entry.group.details.filter((detail) => isMeaningfulCustomerReportText(detail.value));
    return <article key={entry.group.capture_id} className="reference-document-card"><h4>{getEvidenceTitle(entry.capture)}</h4>{details.length > 0 ? <div className="report-field-grid">{details.map((detail, index) => <div key={`${detail.label}-${index}`} className="report-field-card"><span>{detail.label}</span><strong>{stripConfidenceText(detail.value)}</strong></div>)}</div> : <p className="muted">Reference captured for inspection support.</p>}<details><summary>View Original Reference</summary><EvidenceGroupList items={[entry]} supportingEvidence={supportingEvidence} /></details></article>;
  })}</div>;
}

function EvidenceGroupList({
  items,
  supportingEvidence,
  emptyMessage = "No supporting evidence attached yet.",
}: {
  items: ReturnType<typeof buildNormalizedReportModel<CaptureItem>>["findings"];
  supportingEvidence: SupportingEvidenceItem[];
  emptyMessage?: string;
}) {
  const evidenceById = new Map(supportingEvidence.map((item) => [item.capture.id, item]));
  const groups = items.map((entry) => entry.group);

  if (groups.length === 0) return <p className="muted">{emptyMessage}</p>;

  return (
    <div className="evidence-first-list">
      {groups.map((group) => {
        const item = evidenceById.get(group.capture_id);
        if (!item) return null;
        return (
          <article key={group.capture_id} className="evidence-first-card">
            <div className="evidence-first-media">
              {item.kind === "note" || item.kind === "audio" ? <div className="review-note-card"><strong>{item.kind === "audio" ? "Voice Note" : "Technician Note"}</strong><p>{stripConfidenceText(item.note ?? "Note saved for this report.")}</p></div> : item.kind === "photo" && item.signedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed evidence URLs are short-lived Supabase links and should render exactly as captured.
                <img src={item.signedUrl} alt={item.title} />
              ) : (
                <div className="review-evidence-placeholder">{item.title}</div>
              )}
            </div>
            <div className="evidence-first-body">
              <h4>{item.title}</h4>
              {(() => {
                const renderedText: string[] = [];
                const details = group.details.filter((detail) => {
                  const visible = shouldRenderDetail(detail.label, detail.value, renderedText);
                  if (visible) renderedText.push(detail.value);
                  return visible;
                });
                const findings = group.findings.filter((finding) => {
                  const visible = shouldRenderDetail("Observed condition", finding, renderedText);
                  if (visible) renderedText.push(finding);
                  return visible;
                });
                const recommendations = group.recommendations.flatMap(splitRecommendationText).filter((recommendation) => {
                  const visible = shouldRenderDetail("Recommendation", recommendation, renderedText);
                  if (visible) renderedText.push(recommendation);
                  return visible;
                });
                return (
                  <>
                    {details.map((detail, index) => (
                      <p key={`${detail.label}-${index}`}><strong>{detail.label}:</strong> {stripConfidenceText(detail.value)}</p>
                    ))}
                    {findings.length > 0 ? (
                      <div><strong>Observed condition</strong>{findings.map((finding, index) => <p key={`finding-${index}`} className="muted">{stripConfidenceText(finding)}</p>)}</div>
                    ) : null}
                    {recommendations.length > 0 ? (
                      <div><strong>Recommendation</strong><ul>{recommendations.map((recommendation, index) => <li key={`recommendation-${index}`}>{stripConfidenceText(recommendation)}</li>)}</ul></div>
                    ) : null}
                  </>
                );
              })()}
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
                  defaultValue={stripConfidenceText(item.note ?? "")}
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
                  <p className="muted">{stripConfidenceText(item.note ?? "Supporting photo")}</p>
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
                <p className="muted">{stripConfidenceText(item.note ?? "Saved with the report.")}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InlineReviewPanel({
  isReadyForExport,
  markReviewedAction,
  missingEvidenceCount,
  reviewedBy,
  reviewedLabel,
}: {
  isReadyForExport: boolean;
  markReviewedAction: ServerAction;
  missingEvidenceCount: number;
  reviewedBy: string | null;
  reviewedLabel: string | null;
}) {
  return (
    <section id="approval" className="card detail-card report-sidebar-card form-stack compact-approval-panel">
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
        <p className="muted">Confirm the report is ready for delivery after reviewing the summary, sections, evidence, and signatures.</p>
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
  timeZone,
}: {
  emailAction: ServerAction;
  isReadyForExport: boolean;
  origin: string;
  reportPath: string;
  saveAction: ServerAction;
  sessionId: string;
  shareAction: ServerAction;
  shareTokens: ReportShareToken[];
  timeZone: string | null;
}) {
  const activeShareTokens = shareTokens.filter((token) => !token.disabled_at);

  return (
    <details
      id="export-report"
      className="card detail-card report-sidebar-card report-delivery-tabs export-panel form-stack compact-export-panel"
    >
      <summary className="export-summary-row">Export Report</summary>
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
                      ? `Expires ${formatDateTime(token.expires_at, timeZone)}`
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
    </details>
  );
}
