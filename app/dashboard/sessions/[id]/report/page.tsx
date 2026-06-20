import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getCaptureProcessingStatus,
  getRequiredEvidenceCompletion,
} from "@/features/capture";
import {
  asDiagnosticRecordArray,
  getDiagnosticProcedureProgress,
  getDiagnosticStepCompleteness,
} from "@/features/diagnostic-procedures/progress";
import {
  buildNormalizedReportModel,
  classifyReferenceDocumentTitle,
  deriveFormSectionsFromCaptures,
  getFormStructureSummary,
  sanitizeReportStructureForSession,
  normalizeDraftSections,
  shouldRenderDetail,
  splitRecommendationText,
  stripConfidenceText,
  getNormalizedFindingModels,
  isMeaningfulCustomerReportText,
  sanitizeCapturesForImageAiAssist,
} from "@/features/reports/report-structure";
import { buildUniversalReportDocument } from "@/features/reports/report-document";
import {
  getDisplayReportTitle,
  getReportInfoValue,
} from "@/features/reports/report-title";
import {
  createReportShareLink,
  disableReportShareLink,
  emailReport,
  generateAiReportDraft,
  generateFinalNotesForSession,
  markReportReviewed,
  saveFinalNotes,
  saveReport,
  saveReportEdits,
} from "@/features/reports/actions";
import { updateSessionMetadata } from "@/features/sessions/actions";
import { formatDateTime } from "@/features/sessions";
import {
  SESSION_METADATA_FIELDS,
  normalizeSessionMetadata,
} from "@/features/sessions/report-types";
import { requireSessionWorkspace } from "@/features/sessions/data";
import { SignatureCaptureForm } from "@/features/signatures";
import { useSavedSignature } from "@/features/signatures/actions";
import type { Database } from "@/lib/supabase/database.types";
import { FinalNotesEditor } from "@/features/reports/components/FinalNotesEditor";
import { PdfDownloadButton } from "@/features/reports/components/PdfDownloadButton";
import { DeleteEvidenceButton } from "@/features/capture/components/DeleteEvidenceButton";

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
        entryValue !== null &&
        entryValue !== undefined &&
        entryValue !== "" &&
        !/confidence|classification|ocr|document_type|workflow|template/i.test(
          key,
        ),
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
  if (
    capture.media_kind === "document" &&
    capture.storage_path?.match(/\.(jpg|jpeg|png|webp|gif|heic)$/i)
  )
    return "photo";
  if (capture.media_kind === "video" || capture.type === "video")
    return "video";
  if (capture.media_kind === "audio" || capture.type === "voice_note")
    return "audio";
  if (capture.media_kind === "document") return "document";
  return "file";
}

function getShortTechnicianTitle(item: CaptureItem) {
  const note = getEvidenceNote(item);
  if (!note) return null;
  const firstSentence = note.split(/(?<=[.!?])\s+/)[0]?.trim() ?? note.trim();
  const clean = stripConfidenceText(firstSentence).replace(/\s+/g, " ").trim();
  if (
    !clean ||
    clean.length > 72 ||
    /\b(recommend|severity|diagnos|fault|failed|root cause)\b/i.test(clean)
  )
    return null;
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function getEvidenceTitle(item: CaptureItem) {
  const technicianTitle = getShortTechnicianTitle(item);
  if (
    technicianTitle &&
    (isPhotoCapture(item) ||
      item.media_kind === "video" ||
      item.type === "video")
  )
    return technicianTitle;
  const referenceTitle = classifyReferenceDocumentTitle(item);
  if (referenceTitle !== "Reference Document" || item.media_kind === "document")
    return referenceTitle;
  if (item.type === "text_note" || item.media_kind === "note")
    return "Technician Note";
  if (isPhotoCapture(item)) return "Evidence Photo";
  if (item.media_kind === "video" || item.type === "video")
    return "Evidence Video";
  if (item.media_kind === "audio" || item.type === "voice_note")
    return "Voice Note";
  return "Supporting Evidence";
}

function getEvidenceNote(capture: CaptureItem) {
  return capture.technician_note?.trim() || capture.transcript?.trim() || null;
}

function getDiagnosticStepMetadata(section: AiReportDraftSection) {
  return isRecord(section.metadata)
    ? (section.metadata as Record<string, unknown>)
    : {};
}

function getDiagnosticProcedureInfo(draft: AiReportDraft | null) {
  if (
    !draft ||
    !isRecord(draft.report_structure) ||
    draft.report_structure.mode !== "diagnostic_procedure"
  )
    return null;
  const procedure = isRecord(draft.report_structure.procedure)
    ? draft.report_structure.procedure
    : {};
  return {
    title:
      typeof procedure.title === "string"
        ? procedure.title
        : (draft.title ?? "Procedure documentation"),
    manufacturer:
      typeof procedure.manufacturer === "string"
        ? procedure.manufacturer
        : null,
    documentType:
      typeof procedure.document_type === "string"
        ? procedure.document_type.replace(/_/g, " ")
        : null,
    sourceFile:
      typeof procedure.source_file_name === "string"
        ? procedure.source_file_name
        : null,
    signedOff: draft.report_structure.signed_off === true,
    signOffName:
      typeof draft.report_structure.sign_off_name === "string"
        ? draft.report_structure.sign_off_name
        : null,
    signedOffAt:
      typeof draft.report_structure.signed_off_at === "string"
        ? draft.report_structure.signed_off_at
        : null,
    signOffStatement:
      typeof draft.report_structure.sign_off_statement === "string"
        ? draft.report_structure.sign_off_statement
        : null,
  };
}

function getDiagnosticEvidenceRole(capture: CaptureItem) {
  if (
    !isRecord(capture.extracted_data) ||
    !isRecord(capture.extracted_data.diagnostic_step)
  )
    return "other";
  const role = capture.extracted_data.diagnostic_step.evidence_role;
  return typeof role === "string" ? role : "other";
}

function formatDiagnosticEvidenceRole(role: string) {
  return role.replace(/_/g, " ");
}

function captureMatchesDiagnosticStep(capture: CaptureItem, stepId: string) {
  return (
    isRecord(capture.extracted_data) &&
    isRecord(capture.extracted_data.diagnostic_step) &&
    capture.extracted_data.diagnostic_step.step_id === stepId
  );
}

function DiagnosticProcedureReport({
  session,
  currentReport,
  sections,
  captures,
  supportingEvidence,
  reportPath,
  origin,
  markReviewedAction,
  timeZone,
}: {
  session: Pick<
    DocumentationSession,
    "id" | "title" | "created_at" | "updated_at" | "reviewed_at"
  >;
  currentReport: AiReportDraft;
  sections: AiReportDraftSection[];
  captures: CaptureItem[];
  supportingEvidence: SupportingEvidenceItem[];
  reportPath: string;
  origin: string;
  markReviewedAction: ServerAction;
  timeZone: string | null;
}) {
  const info = getDiagnosticProcedureInfo(currentReport);
  const steps = sections.filter((section) => {
    const metadata = getDiagnosticStepMetadata(section);
    return (
      metadata.section_type === "diagnostic_procedure_step" &&
      metadata.visible !== false
    );
  });
  const progress = getDiagnosticProcedureProgress(steps, captures);
  const referencedCaptureCount = new Set(
    sections
      .flatMap((section) => section.source_capture_ids ?? [])
      .filter((id) => captures.some((capture) => capture.id === id)),
  ).size;
  const hasUnlinkedIncludedEvidence = captures.length > referencedCaptureCount;
  return (
    <main className="page-shell dashboard-shell report-preview-shell report-review-shell">
      <div className="section-header page-header report-preview-header report-review-header">
        <div>
          <p className="eyebrow guided-eyebrow">Procedure Report</p>
          <h1>{info?.title ?? session.title}</h1>
          <p className="notice info">
            <strong>Documentation support only.</strong> Follow OEM procedure.
            Technician owns all conclusions and recommendations.
          </p>
          <p className="muted">
            {[info?.manufacturer, info?.documentType, info?.sourceFile]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {info?.signedOff ? (
            <p className="notice success">
              <strong>Signed off by {info.signOffName ?? "technician"}</strong>
              {info.signedOffAt
                ? ` at ${formatDateTime(info.signedOffAt, timeZone)}`
                : ""}
              . {info.signOffStatement}
            </p>
          ) : (
            <p className="notice warning">
              <strong>Technician sign-off pending.</strong> Complete sign-off in
              the procedure documentation before final delivery.
            </p>
          )}
        </div>
        <div className="page-actions report-preview-actions compact-report-actions">
          <Link
            href={`/dashboard/sessions/${session.id}/diagnostic-procedure`}
            className="button button-secondary touch-target"
          >
            Edit Procedure Details
          </Link>
          <a
            className="button button-primary touch-target"
            href={`${origin}${reportPath}?preview=1`}
            target="_blank"
            rel="noreferrer"
          >
            Printable Report
          </a>
        </div>
      </div>
      <section className="card detail-card report-command-card form-stack">
        <div className="report-section-heading generated-report-heading">
          <div>
            <p className="eyebrow">Procedure documentation</p>
            <h2>Procedure Results</h2>
            <p className="muted">
              Statuses, readings, notes, and attachments are technician-entered
              documentation. OEM flow text is reference text only.
            </p>
          </div>
          <span
            className={
              progress.reportReady
                ? "status-pill success"
                : "status-pill attention"
            }
          >
            {progress.reportReady
              ? "Documentation ready"
              : "Documentation incomplete"}
          </span>
        </div>

        <details className="report-subsection report-supporting-section">
          <summary className="report-section-title-row">
            <div>
              <p className="eyebrow">Procedure details</p>
              <h3>Advanced documentation details</h3>
              <p className="muted">
                Document-readiness details for technician review.
              </p>
            </div>
          </summary>
          <section className="inspection-summary-card">
            <div className="inspection-metric-grid">
              <div>
                <span>Steps documented</span>
                <strong>
                  {progress.totalVisibleSteps - progress.incompleteSteps} of{" "}
                  {progress.totalVisibleSteps}
                </strong>
              </div>
              <div>
                <span>Needs attention</span>
                <strong>
                  {progress.incompleteSteps + progress.blockedSteps}
                </strong>
              </div>
              <div>
                <span>Required items remaining</span>
                <strong>{progress.missingRequiredDocumentationCount}</strong>
              </div>
              <div>
                <span>Evidence linked to sections</span>
                <strong>{referencedCaptureCount}</strong>
              </div>
            </div>
            {hasUnlinkedIncludedEvidence ? (
              <p className="notice warning">
                Some included evidence is not linked to a procedure step and is
                retained in the compact evidence index.
              </p>
            ) : null}
          </section>
        </details>
        <div className="report-document-flow">
          {steps.length === 0 ? (
            <p className="notice warning">
              No visible procedure steps are included in this diagnostic report.
            </p>
          ) : null}
          {steps.map((section) => {
            const metadata = getDiagnosticStepMetadata(section);
            const stepId =
              typeof metadata.step_id === "string"
                ? metadata.step_id
                : section.section_key;
            const readings = asDiagnosticRecordArray(
              metadata.technician_readings,
            );
            const stepCaptures = captures.filter((capture) =>
              captureMatchesDiagnosticStep(capture, stepId),
            );
            const completeness = getDiagnosticStepCompleteness(
              section,
              captures,
            );
            return (
              <article key={section.id} className="report-document-card">
                <h3>{section.title}</h3>
                <p>
                  <strong>Status:</strong>{" "}
                  {typeof metadata.technician_status === "string"
                    ? metadata.technician_status.replace(/_/g, " ")
                    : "not tested"}
                </p>
                <p>
                  <strong>Documentation notes:</strong>{" "}
                  {completeness.badges.length
                    ? completeness.badges.join(", ")
                    : "Incomplete"}
                </p>
                {typeof metadata.technician_selected_branch === "string" &&
                metadata.technician_selected_branch ? (
                  <p>
                    <strong>Technician-selected branch:</strong>{" "}
                    {metadata.technician_selected_branch}
                  </p>
                ) : null}
                <p>
                  {stripConfidenceText(
                    String(metadata.instruction ?? section.body ?? ""),
                  )}
                </p>
                {typeof metadata.oem_flow_text === "string" &&
                metadata.oem_flow_text ? (
                  <p>
                    <strong>OEM flow text:</strong> {metadata.oem_flow_text}
                  </p>
                ) : null}
                {readings.length > 0 ? (
                  <div className="report-field-grid">
                    {readings.map((reading, index) => (
                      <div
                        key={`${section.id}-reading-${index}`}
                        className="report-field-card"
                      >
                        <span>
                          {String(reading.label ?? `Reading ${index + 1}`)}
                        </span>
                        <strong>
                          {String(reading.value ?? "")}
                          {reading.unit ? ` ${String(reading.unit)}` : ""}
                        </strong>
                      </div>
                    ))}
                  </div>
                ) : null}
                {typeof metadata.technician_notes === "string" &&
                metadata.technician_notes ? (
                  <p>
                    <strong>Technician notes:</strong>{" "}
                    {metadata.technician_notes}
                  </p>
                ) : null}
                {typeof metadata.technician_conclusion === "string" &&
                metadata.technician_conclusion ? (
                  <p>
                    <strong>Technician conclusion:</strong>{" "}
                    {metadata.technician_conclusion}
                  </p>
                ) : null}
                {stepCaptures.length > 0 ? (
                  <div>
                    <strong>Attached evidence</strong>
                    {Array.from(
                      new Set(stepCaptures.map(getDiagnosticEvidenceRole)),
                    ).map((role) => (
                      <div key={`${section.id}-${role}`}>
                        <p className="muted">
                          {formatDiagnosticEvidenceRole(role)}
                        </p>
                        <ul>
                          {stepCaptures
                            .filter(
                              (capture) =>
                                getDiagnosticEvidenceRole(capture) === role,
                            )
                            .map((capture) => {
                              const item = supportingEvidence.find(
                                (entry) => entry.capture.id === capture.id,
                              );
                              return (
                                <li key={capture.id}>
                                  {item?.title ?? "Evidence"}
                                  {capture.technician_note
                                    ? ` — ${capture.technician_note}`
                                    : ""}
                                </li>
                              );
                            })}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No step evidence attached.</p>
                )}
              </article>
            );
          })}
        </div>
        {info?.signedOff ? (
          <form
            action={markReviewedAction}
            className="form-actions report-inline-actions"
          >
            <button className="button button-primary touch-target">
              Approve documentation for export
            </button>
          </form>
        ) : (
          <p className="notice warning">
            <strong>Export approval blocked:</strong> technician sign-off is
            required before approving diagnostic documentation for export.
          </p>
        )}
      </section>
    </main>
  );
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
    notes?: string;
    notes_generated?: string;
    prepare?: string;
  }>;
}) {
  const { id } = await params;
  const status = await searchParams;
  const { supabase, profile } = await requireSessionWorkspace();
  const { data: session, error: sessionError } = await supabase
    .from("documentation_sessions")
    .select(
      "id, title, session_type, session_metadata, organization_id, workflow_template_id, review_status, reviewed_at, reviewed_by, asset_label, vin, unit_number, customer_name, suggested_details, final_notes, final_notes_ai_generated, final_notes_updated_at, final_notes_edited_by_user, include_final_notes_in_export, created_at, updated_at",
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
  if (
    profile.use_default_signature &&
    profile.default_signature_path &&
    !(signatures ?? []).length
  ) {
    const { data } = await supabase.storage
      .from("documentation-signatures")
      .createSignedUrl(profile.default_signature_path, 60 * 10);
    if (data?.signedUrl) signatureUrls.__default_signature = data.signedUrl;
  }

  const currentReport =
    (aiDrafts ?? []).find((draft) => draft.status === "approved") ??
    (aiDrafts ?? []).find((draft) => draft.status !== "superseded") ??
    aiDrafts?.[0] ??
    null;

  if (status.prepare && !currentReport) {
    await generateAiReportDraft(session.id);
  }
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
  const pdfDownloadPath = `${reportPath}/download`;
  const headersList = await headers();
  const origin = getReportOrigin(headersList);
  const evidence = getRequiredEvidenceCompletion(
    captures ?? [],
    session.session_type,
    template?.required_evidence ?? null,
  );
  const allCaptures = sanitizeCapturesForImageAiAssist(captures ?? [], true);
  const visibleCaptures = allCaptures.filter(
    (capture) => capture.include_in_report,
  );
  const signedEvidenceUrls: Record<string, string> = {};
  await Promise.all(
    visibleCaptures.map(async (capture) => {
      const path = isPhotoCapture(capture)
        ? (capture.storage_path ?? capture.thumbnail_path)
        : (capture.thumbnail_path ?? capture.storage_path);
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
  const visibleReportSections = (reportSections ?? []).filter(
    (section) => !isHiddenFromReport(section.metadata),
  );
  const normalizedReportSections = normalizeDraftSections(
    visibleReportSections,
    visibleCaptures,
  );
  const derivedFormSections = deriveFormSectionsFromCaptures(visibleCaptures);
  const documentSections =
    normalizedReportSections.length > 0
      ? normalizedReportSections
      : derivedFormSections;
  const sanitizedReportStructure = sanitizeReportStructureForSession(
    currentReport?.report_structure ?? null,
    visibleCaptures.map((capture) => capture.id),
  );
  const formStructureSummary = getFormStructureSummary(
    sanitizedReportStructure,
    documentSections,
  );
  const reviewDocument = buildNormalizedReportModel({
    captures: visibleCaptures,
    sections: documentSections,
    draftSections: visibleReportSections,
    measurements: currentReport?.measurements ?? [],
    findings: currentReport?.findings ?? [],
  });
  const reportDocument = buildUniversalReportDocument({
    captures: visibleCaptures,
    timeZone: profile.timezone,
  });
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
  const generateFinalNotesAction = generateFinalNotesForSession.bind(
    null,
    session.id,
  );
  const saveFinalNotesAction = saveFinalNotes.bind(null, session.id);
  const saveReportEditsAction = currentReport
    ? saveReportEdits.bind(null, currentReport.id)
    : null;
  const sourceFieldEntries = getDisplayEntries(currentReport?.header_fields);
  const isGenericEvidenceReport =
    formStructureSummary.source === "generic_fallback";
  const displayReportTitle = getDisplayReportTitle(currentReport, session, {
    genericFallback: isGenericEvidenceReport,
  });
  const isEditingReport = Boolean(currentReport && status.edit);
  if (currentReport && getDiagnosticProcedureInfo(currentReport)) {
    return (
      <DiagnosticProcedureReport
        session={session}
        currentReport={currentReport}
        sections={visibleReportSections}
        captures={visibleCaptures}
        supportingEvidence={supportingEvidence}
        reportPath={reportPath}
        origin={origin}
        markReviewedAction={markReviewedAction}
        timeZone={profile.timezone}
      />
    );
  }
  return (
    <main className="page-shell dashboard-shell report-preview-shell report-review-shell">
      <div className="section-header page-header report-preview-header report-review-header">
        <div>
          <p className="eyebrow guided-eyebrow">Review</p>
          <h1>Your Report</h1>
          <p className="muted">
            Review the finished report built from your captured evidence.
          </p>
        </div>
        <div className="page-actions report-preview-actions compact-report-actions">
          <span
            className={
              isReadyForExport ? "status-pill success" : "status-pill neutral"
            }
          >
            {isReadyForExport ? "Ready" : "Review Required"}
          </span>
          {currentReport ? (
            <Link
              href={
                isEditingReport
                  ? `/dashboard/sessions/${session.id}/report`
                  : `/dashboard/sessions/${session.id}/report?edit=1`
              }
              className="button button-secondary touch-target"
            >
              {isEditingReport ? "View Report" : "Edit Report"}
            </Link>
          ) : null}
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
        {status.notes ? <p className="success">Final notes saved.</p> : null}
        {status.notes_generated ? (
          <p className="success">Final notes prepared.</p>
        ) : null}
      </div>

      <div className="report-review-layout report-document-layout">
        <div className="report-workspace-column">
          <ReportReview
            reportSections={reportSections ?? []}
            currentReport={currentReport}
            isEditingReport={isEditingReport}
            generateReportAction={generateReportAction}
            hasPendingEvidence={hasPendingEvidence}
            hasPrepareError={Boolean(status.error)}
            noteEvidence={noteEvidence}
            otherEvidence={otherEvidence}
            photoEvidence={photoEvidence}
            documentSections={documentSections}
            reviewDocument={reviewDocument}
            supportingEvidence={supportingEvidence}
            session={session}
            saveReportEditsAction={saveReportEditsAction}
            sourceFieldEntries={sourceFieldEntries}
            facilityName={
              profile.company_profile?.facility_name ??
              profile.company_profile?.company_name ??
              profile.organization.name
            }
            facilityLocation={[
              profile.company_profile?.facility_city,
              profile.company_profile?.facility_region,
            ]
              .filter(Boolean)
              .join(", ")}
            displayReportTitle={displayReportTitle}
            isGenericEvidenceReport={isGenericEvidenceReport}
            reportDocument={reportDocument}
            timeZone={profile.timezone}
          />

          {isEditingReport ? (
            <FinalNotesEditor
              defaultValue={session.final_notes ?? ""}
              editedByUser={session.final_notes_edited_by_user}
              includeInExport={session.include_final_notes_in_export}
              generateAction={generateFinalNotesAction}
              saveAction={saveFinalNotesAction}
            />
          ) : null}

          <InspectorFacilityPanel
            profile={profile}
            sessionId={session.id}
            signatures={signatures ?? []}
            signatureUrls={signatureUrls}
            isEditingReport={isEditingReport}
          />
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
          pdfDownloadPath={pdfDownloadPath}
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

function ReportReview({
  reportSections,
  currentReport,
  generateReportAction,
  hasPendingEvidence,
  hasPrepareError,
  isEditingReport,
  noteEvidence,
  otherEvidence,
  photoEvidence,
  documentSections,
  reviewDocument,
  supportingEvidence,
  session,
  saveReportEditsAction,
  sourceFieldEntries,
  facilityName,
  facilityLocation,
  displayReportTitle,
  isGenericEvidenceReport,
  reportDocument,
  timeZone,
}: {
  reportSections: AiReportDraftSection[];
  currentReport: AiReportDraft | null;
  generateReportAction: ServerAction;
  hasPendingEvidence: boolean;
  hasPrepareError: boolean;
  isEditingReport: boolean;
  noteEvidence: SupportingEvidenceItem[];
  otherEvidence: SupportingEvidenceItem[];
  photoEvidence: SupportingEvidenceItem[];
  documentSections: ReturnType<typeof normalizeDraftSections>;
  reviewDocument: ReturnType<typeof buildNormalizedReportModel<CaptureItem>>;
  supportingEvidence: SupportingEvidenceItem[];
  session: Pick<
    DocumentationSession,
    | "id"
    | "title"
    | "session_type"
    | "session_metadata"
    | "asset_label"
    | "customer_name"
    | "suggested_details"
    | "created_at"
    | "updated_at"
    | "reviewed_at"
  >;
  saveReportEditsAction: ServerAction | null;
  sourceFieldEntries: [string, unknown][];
  facilityName: string;
  facilityLocation: string;
  displayReportTitle: string;
  isGenericEvidenceReport: boolean;
  reportDocument: ReturnType<typeof buildUniversalReportDocument<CaptureItem>>;
  timeZone: string | null;
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
          <p className="eyebrow">Review Report</p>
          <h2>{displayReportTitle}</h2>
          <p className="muted">{reportDocument.trustStatement}</p>
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
        <div className="report-logo-mark" aria-hidden="true">
          {facilityName.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <p className="eyebrow">Professional Evidence Report</p>
          <h3>{displayReportTitle}</h3>
          <p className="muted">
            {facilityName}
            {facilityLocation ? ` · ${facilityLocation}` : ""}
          </p>
        </div>
      </div>

      {hasPendingEvidence ? (
        <p className="notice info compact-report-notice">
          Saved. Ready for review. You can continue capturing while preparing
          the report.
        </p>
      ) : null}

      {!currentReport ? (
        <form action={generateReportAction} className="empty-report-shell">
          <div>
            <h3>Preparing your report…</h3>
            <p className="muted">
              CRED is organizing your evidence into a professional report.
            </p>
          </div>
          <div className="form-actions report-inline-actions">
            <Link
              href={`/dashboard/sessions/${session.id}/capture`}
              className="button button-primary touch-target"
            >
              Continue Capturing
            </Link>
            {hasPrepareError ? (
              <button className="button button-secondary touch-target">
                Try Again
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {!isEditingReport ? (
        <ReportDetailsSummary
          currentReport={currentReport}
          session={session}
          displayReportTitle={displayReportTitle}
          timeZone={timeZone}
        />
      ) : (
        <details className="report-subsection report-document-section" open>
          <summary className="report-section-title-row">
            <div>
              <h3>Edit Report Information</h3>
              <p className="muted">
                Report metadata used in export when present.
              </p>
            </div>
          </summary>
          <form
            action={updateSessionMetadata.bind(null, session.id)}
            className="form-stack report-edit-form"
          >
            <div className="report-field-grid">
              {SESSION_METADATA_FIELDS.map((field) => {
                const metadata = normalizeSessionMetadata(
                  session.session_metadata,
                  session,
                );
                return (
                  <label className="field-stack" key={field.name}>
                    <span className="label">{field.label}</span>
                    <input
                      className="input"
                      name={field.name}
                      maxLength={field.maxLength}
                      defaultValue={metadata[field.name]}
                    />
                  </label>
                );
              })}
            </div>
            <div className="form-actions">
              <button className="button button-secondary touch-target">
                Save report information
              </button>
            </div>
          </form>
        </details>
      )}

      {reviewDocument.referenceDocuments.length > 0 ? (
        <ReferenceDocumentList
          items={reviewDocument.referenceDocuments}
          supportingEvidence={supportingEvidence}
        />
      ) : null}

      {currentReport && isEditingReport && saveReportEditsAction ? (
        <form
          action={saveReportEditsAction}
          className="form-stack report-edit-form"
        >
          <details className="report-subsection report-edit-panel">
            <summary className="report-section-title-row">
              <div>
                <h3>Advanced report editing</h3>
                <p className="muted">
                  Optional raw section and field editing. Use only when you need
                  to change the assembled report structure.
                </p>
              </div>
            </summary>
            <label className="field-stack">
              <span className="label">Report title</span>
              <input
                className="input"
                name="report_title"
                defaultValue={displayReportTitle}
              />
            </label>
            <div className="report-field-grid">
              <label className="field-stack">
                <span className="label">Subject Name</span>
                <input
                  className="input"
                  name="subject_name"
                  defaultValue={getReportInfoValue(
                    currentReport,
                    session,
                    "subject_name",
                  )}
                />
              </label>
              <label className="field-stack">
                <span className="label">Customer / Client</span>
                <input
                  className="input"
                  name="customer_client"
                  defaultValue={
                    getReportInfoValue(
                      currentReport,
                      session,
                      "customer_client",
                    ) ||
                    session.customer_name ||
                    ""
                  }
                />
              </label>
              <label className="field-stack">
                <span className="label">Asset / Equipment</span>
                <input
                  className="input"
                  name="asset_equipment"
                  defaultValue={
                    getReportInfoValue(
                      currentReport,
                      session,
                      "asset_equipment",
                    ) ||
                    session.asset_label ||
                    ""
                  }
                />
              </label>
              <label className="field-stack">
                <span className="label">Location</span>
                <input
                  className="input"
                  name="location"
                  defaultValue={getReportInfoValue(
                    currentReport,
                    session,
                    "location",
                  )}
                />
              </label>
              <label className="field-stack">
                <span className="label">Reference Number</span>
                <input
                  className="input"
                  name="reference_number"
                  defaultValue={getReportInfoValue(
                    currentReport,
                    session,
                    "reference_number",
                  )}
                />
              </label>
            </div>
            <label className="field-stack">
              <span className="label">Summary</span>
              <textarea
                className="input text-area"
                name="report_summary"
                rows={5}
                defaultValue={stripConfidenceText(currentReport.summary ?? "")}
              />
            </label>
          </details>

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
                    <span>Include in report</span>
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
                  {normalizeDraftSections([section], []).flatMap(
                    (item) => item.fields,
                  ).length > 0 ? (
                    <div className="report-field-grid">
                      <input
                        type="hidden"
                        name={`section_field_count_${section.id}`}
                        value={
                          normalizeDraftSections([section], []).flatMap(
                            (item) => item.fields,
                          ).length
                        }
                      />
                      {normalizeDraftSections([section], [])
                        .flatMap((item) => item.fields)
                        .map((field, fieldIndex) => (
                          <div
                            key={`${section.id}-${field.key}-${fieldIndex}`}
                            className="report-field-card report-edit-field-card"
                          >
                            <input
                              type="hidden"
                              name={`section_field_key_${section.id}_${fieldIndex}`}
                              value={field.key}
                            />
                            <input
                              type="hidden"
                              name={`section_field_label_${section.id}_${fieldIndex}`}
                              value={field.label}
                            />
                            <label className="report-visibility-toggle">
                              <input
                                type="checkbox"
                                name={`section_field_include_${section.id}_${fieldIndex}`}
                                defaultChecked
                              />
                              <span>Include in report</span>
                            </label>
                            <label className="field-stack">
                              <span className="label">{field.label}</span>
                              <input
                                className="input"
                                name={`section_field_value_${section.id}_${fieldIndex}`}
                                defaultValue={stripConfidenceText(field.value)}
                              />
                            </label>
                          </div>
                        ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <details className="report-subsection report-edit-panel">
            <summary>
              <h3>Report evidence</h3>
              <p className="muted">
                Edit notes and choose what appears in the final report.
              </p>
            </summary>
            <EvidenceGallery
              isEditingReport
              noteEvidence={noteEvidence}
              otherEvidence={otherEvidence}
              photoEvidence={photoEvidence}
            />
          </details>

          <details className="report-subsection report-edit-panel">
            <summary>
              <h3>Form fields</h3>
              <p className="muted">
                Correct form details that should appear in the report.
              </p>
            </summary>
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
                      <span>Include in report</span>
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
          </details>

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
          {documentSections.length > 0 || reviewDocument.findings.length > 0 ? (
            <section className="report-subsection report-supporting-section">
              <div className="report-section-title-row">
                <div>
                  <h3>Findings & Recommendations</h3>
                  <p className="muted">
                    Customer-ready findings, recommendations, notes, and
                    supporting evidence.
                  </p>
                </div>
                <span className="status-pill neutral compact">
                  {includedEvidenceCount} included
                </span>
              </div>
              <FindingCardList
                items={reviewDocument.findings}
                supportingEvidence={supportingEvidence}
              />
              {reviewDocument.additionalNotes.some((entry) =>
                isMeaningfulCustomerReportText(
                  [
                    entry.capture.technician_note,
                    entry.capture.transcript,
                    ...entry.group.findings,
                    ...entry.group.recommendations,
                  ]
                    .filter(Boolean)
                    .join(" "),
                ),
              ) ? (
                <>
                  <h3>Additional Notes</h3>
                  <EvidenceGroupList
                    items={reviewDocument.additionalNotes.filter((entry) =>
                      isMeaningfulCustomerReportText(
                        [
                          entry.capture.technician_note,
                          entry.capture.transcript,
                          ...entry.group.findings,
                          ...entry.group.recommendations,
                        ]
                          .filter(Boolean)
                          .join(" "),
                      ),
                    )}
                    supportingEvidence={supportingEvidence}
                  />
                </>
              ) : null}
              {reviewDocument.supportingEvidence.length > 0 ? (
                <>
                  <h3>Supporting Evidence</h3>
                  <EvidenceGroupList
                    items={reviewDocument.supportingEvidence}
                    supportingEvidence={supportingEvidence}
                  />
                </>
              ) : null}
              {reviewDocument.unattachedDetails.length > 0 ? (
                <div className="evidence-first-card">
                  <div className="evidence-first-body">
                    <h4>Supporting Evidence</h4>
                    {reviewDocument.unattachedDetails.map((detail, index) => (
                      <p key={`${detail.label}-${index}`}>
                        <strong>{detail.label}:</strong>{" "}
                        {stripConfidenceText(detail.value)}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
          <EvidenceAppendix
            supportingEvidence={supportingEvidence}
            reportDocument={reportDocument}
            isGenericEvidenceReport={isGenericEvidenceReport}
            preferCompact={!isGenericEvidenceReport}
          />
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
  isEditingReport,
}: {
  profile: Awaited<ReturnType<typeof requireSessionWorkspace>>["profile"];
  sessionId: string;
  signatures: SignatureCapture[];
  signatureUrls: Record<string, string>;
  isEditingReport: boolean;
}) {
  const facility = profile.company_profile;
  const address = [
    facility?.facility_address_line_1,
    facility?.facility_address_line_2,
    facility?.facility_city,
    facility?.facility_region,
    facility?.facility_postal_code,
    facility?.facility_country,
  ]
    .filter(Boolean)
    .join(", ");
  const latestSignature =
    signatures.find((signature) =>
      /inspector|technician/i.test(signature.signature_type),
    ) ?? signatures[0];
  const defaultSignatureUrl = profile.default_signature_path
    ? signatureUrls.__default_signature
    : null;
  const displayedSignatureUrl = latestSignature
    ? signatureUrls[latestSignature.id]
    : defaultSignatureUrl;
  const canUseSavedSignature = Boolean(
    profile.use_default_signature &&
    profile.default_signature_path &&
    !latestSignature,
  );
  const useSavedSignatureAction = useSavedSignature.bind(null, sessionId);
  const rows = [
    ["Inspector Name", profile.full_name],
    ["Organization Name", facility?.company_name ?? facility?.facility_name],
    ["Role / Title", profile.inspector_role_or_title],
    ["Email", profile.inspector_email ?? facility?.facility_email],
    ["Phone", profile.inspector_phone ?? facility?.facility_phone],
    ["Organization Address", address],
    ["Licence Number", profile.technician_license_number],
    ["Permit Number", facility?.permit_number],
    ["Certification Number", facility?.certification_number],
  ].filter(([, value]) => typeof value === "string" && value.trim());
  if (!isEditingReport) {
    return (
      <section className="card detail-card report-command-card form-stack signature-review-panel">
        <div className="report-section-heading generated-report-heading">
          <div>
            <p className="eyebrow">Signoff</p>
            <h2>Report Signature</h2>
            <p className="muted">
              Signature retained with the finished report.
            </p>
          </div>
        </div>
        {displayedSignatureUrl ? (
          <div className="saved-signature-card">
            <strong>
              {latestSignature?.signer_name ?? profile.full_name ?? "Signed"}
            </strong>
            {/* eslint-disable-next-line @next/next/no-img-element -- signed signature URLs are short-lived Supabase links and should render exactly as captured. */}
            <img
              className="saved-signature-image"
              src={displayedSignatureUrl}
              alt="Saved report signature"
            />
          </div>
        ) : (
          <p className="muted">No report-specific signature captured.</p>
        )}
      </section>
    );
  }

  return (
    <details
      className="card detail-card report-command-card form-stack signature-review-panel"
      open
    >
      <summary className="report-section-heading generated-report-heading">
        <div>
          <p className="eyebrow">Signature Settings</p>
          <h2>Report Signature</h2>
          <p className="muted">
            Signature and organization details included with the finished
            report.
          </p>
        </div>
      </summary>
      {rows.length > 0 ? (
        <div className="report-field-grid">
          {rows.map(([label, value]) => (
            <div key={label} className="report-field-card">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No inspector or facility details saved yet.</p>
      )}
      <p className="muted">
        Saved default signature:{" "}
        {profile.default_signature_path
          ? profile.use_default_signature
            ? "Available and enabled"
            : "Available but disabled"
          : "Not saved"}
        .
      </p>
      {canUseSavedSignature ? (
        <form action={useSavedSignatureAction}>
          <button className="button button-secondary touch-target">
            Use saved signature
          </button>
        </form>
      ) : null}
      {displayedSignatureUrl ? (
        <div className="saved-signature-card">
          <strong>
            {latestSignature
              ? "Report-specific signature"
              : "Default saved signature"}
          </strong>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed signature URLs are short-lived Supabase links and should render exactly as captured. */}
          <img
            className="saved-signature-image"
            src={displayedSignatureUrl}
            alt="Saved report signature"
          />
        </div>
      ) : (
        <p className="muted">No report-specific signature captured.</p>
      )}
      <SignatureCaptureForm sessionId={sessionId} />
    </details>
  );
}

function FindingCardList({
  items,
  supportingEvidence,
}: {
  items: ReturnType<typeof buildNormalizedReportModel<CaptureItem>>["findings"];
  supportingEvidence: SupportingEvidenceItem[];
}) {
  const evidenceById = new Map(
    supportingEvidence.map((item) => [item.capture.id, item]),
  );
  const findings = getNormalizedFindingModels(items);
  if (findings.length === 0)
    return <p className="muted">No findings attached yet.</p>;
  return (
    <div className="finding-card-list">
      {findings.map((finding, index) => {
        const evidence = evidenceById.get(finding.id);
        return (
          <article key={finding.id} className="professional-finding-card">
            <div className="finding-card-header">
              <div>
                <p className="eyebrow">Finding {index + 1}</p>
                <h4>
                  Finding {index + 1} — {finding.title}
                </h4>
              </div>
              <span className="severity-badge">{finding.severity.label}</span>
            </div>
            <div className="finding-card-grid">
              <div>
                <strong>Observed Condition</strong>
                {finding.observations.length > 0 ? (
                  finding.observations.map((item) => <p key={item}>{item}</p>)
                ) : (
                  <p className="muted">
                    Condition documented in supporting evidence.
                  </p>
                )}
              </div>
              <div>
                <strong>Recommendation</strong>
                {finding.recommendations.length > 0 ? (
                  <ul>
                    {finding.recommendations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No recommendation captured.</p>
                )}
              </div>
            </div>
            <div className="finding-evidence-details">
              <strong>
                Supporting Evidence · {finding.evidenceCount} item
                {finding.evidenceCount === 1 ? "" : "s"}
              </strong>
              {evidence ? (
                <EvidenceGroupList
                  items={items.filter(
                    (entry) => entry.group.capture_id === finding.id,
                  )}
                  supportingEvidence={supportingEvidence}
                />
              ) : (
                <p className="muted">Evidence item captured.</p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ReportDetailsSummary({
  currentReport,
  session,
  displayReportTitle,
  timeZone,
}: {
  currentReport: AiReportDraft | null;
  session: Pick<
    DocumentationSession,
    | "created_at"
    | "reviewed_at"
    | "asset_label"
    | "customer_name"
    | "suggested_details"
    | "session_metadata"
  >;
  displayReportTitle: string;
  timeZone: string | null;
}) {
  const details = [
    ["Report Title", displayReportTitle],
    ["Capture Session Date", formatDateTime(session.created_at, timeZone)],
    [
      "Report Approved Date",
      session.reviewed_at
        ? formatDateTime(session.reviewed_at, timeZone)
        : null,
    ],
    [
      "Customer / Client",
      getReportInfoValue(currentReport, session, "customer_client") ||
        session.customer_name,
    ],
    [
      "Asset / Equipment",
      getReportInfoValue(currentReport, session, "asset_equipment") ||
        session.asset_label,
    ],
    ["Location", getReportInfoValue(currentReport, session, "location")],
    [
      "Reference Number",
      getReportInfoValue(currentReport, session, "reference_number"),
    ],
  ].filter(([, value]) => value);
  if (details.length === 0) return null;
  return (
    <section className="report-subsection report-document-section">
      <div className="report-section-title-row">
        <div>
          <h3>Report Details</h3>
          <p className="muted">Key details included with this report.</p>
        </div>
      </div>
      <div className="report-field-grid">
        {details.map(([label, value]) => (
          <div key={label} className="report-field-card">
            <span>{label}</span>
            <strong>{stripConfidenceText(String(value))}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReferenceDocumentList({
  items,
  supportingEvidence,
}: {
  items: ReturnType<typeof buildNormalizedReportModel<CaptureItem>>["findings"];
  supportingEvidence: SupportingEvidenceItem[];
}) {
  const documentItems = items.filter(
    (entry) => entry.capture.media_kind === "document",
  );
  if (documentItems.length === 0) return null;
  return (
    <div className="reference-document-list">
      {documentItems.map((entry) => {
        const details = entry.group.details.filter((detail) =>
          isMeaningfulCustomerReportText(detail.value),
        );
        return (
          <article
            key={entry.group.capture_id}
            className="reference-document-card"
          >
            <h4>{getEvidenceTitle(entry.capture)}</h4>
            {details.length > 0 ? (
              <div className="report-field-grid">
                {details.map((detail, index) => (
                  <div
                    key={`${detail.label}-${index}`}
                    className="report-field-card"
                  >
                    <span>{detail.label}</span>
                    <strong>{stripConfidenceText(detail.value)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                Source document retained with this report.
              </p>
            )}
            <details>
              <summary>View Source Document</summary>
              <EvidenceGroupList
                items={[entry]}
                supportingEvidence={supportingEvidence}
              />
            </details>
          </article>
        );
      })}
    </div>
  );
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
  const evidenceById = new Map(
    supportingEvidence.map((item) => [item.capture.id, item]),
  );
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
              {item.kind === "note" || item.kind === "audio" ? (
                <div className="review-note-card">
                  <strong>
                    {item.kind === "audio" ? "Voice Note" : "Technician Note"}
                  </strong>
                  <p>
                    {stripConfidenceText(
                      item.note ?? "Note saved for this report.",
                    )}
                  </p>
                </div>
              ) : item.kind === "photo" && item.signedUrl ? (
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
                  const visible = shouldRenderDetail(
                    detail.label,
                    detail.value,
                    renderedText,
                  );
                  if (visible) renderedText.push(detail.value);
                  return visible;
                });
                const findings = group.findings.filter((finding) => {
                  const visible = shouldRenderDetail(
                    "Observed condition",
                    finding,
                    renderedText,
                  );
                  if (visible) renderedText.push(finding);
                  return visible;
                });
                const recommendations = group.recommendations
                  .flatMap(splitRecommendationText)
                  .filter((recommendation) => {
                    const visible = shouldRenderDetail(
                      "Recommendation",
                      recommendation,
                      renderedText,
                    );
                    if (visible) renderedText.push(recommendation);
                    return visible;
                  });
                return (
                  <>
                    {details.map((detail, index) => (
                      <p key={`${detail.label}-${index}`}>
                        <strong>{detail.label}:</strong>{" "}
                        {stripConfidenceText(detail.value)}
                      </p>
                    ))}
                    {findings.length > 0 ? (
                      <div>
                        <strong>Observed condition</strong>
                        {findings.map((finding, index) => (
                          <p key={`finding-${index}`} className="muted">
                            {stripConfidenceText(finding)}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {recommendations.length > 0 ? (
                      <div>
                        <strong>Recommendation</strong>
                        <ul>
                          {recommendations.map((recommendation, index) => (
                            <li key={`recommendation-${index}`}>
                              {stripConfidenceText(recommendation)}
                            </li>
                          ))}
                        </ul>
                      </div>
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

function EvidenceAppendix({
  supportingEvidence,
  reportDocument,
  timeZone,
  isGenericEvidenceReport,
  preferCompact = false,
}: {
  supportingEvidence: SupportingEvidenceItem[];
  reportDocument?: ReturnType<typeof buildUniversalReportDocument<CaptureItem>>;
  timeZone?: string | null;
  isGenericEvidenceReport: boolean;
  preferCompact?: boolean;
}) {
  const documentModel =
    reportDocument ??
    buildUniversalReportDocument({
      captures: supportingEvidence.map((item) => item.capture),
      timeZone: timeZone ?? null,
    });
  const evidenceMetadata = new Map(
    documentModel.evidenceItems.map((item) => [item.sourceCaptureId, item]),
  );
  const photoCount = supportingEvidence.filter(
    (item) => item.kind === "photo",
  ).length;
  const photoHeavy = photoCount >= Math.max(4, supportingEvidence.length / 2);
  const compactByDefault =
    preferCompact ||
    (!isGenericEvidenceReport && supportingEvidence.length > 3);
  return (
    <details
      className="report-subsection report-supporting-section"
      open={!compactByDefault}
    >
      <summary className="report-section-title-row">
        <div>
          <p className="eyebrow">
            {isGenericEvidenceReport ? "Evidence" : "Evidence Appendix"}
          </p>
          <h3>
            {isGenericEvidenceReport
              ? "Captured Evidence"
              : "Evidence Captured"}
          </h3>
          <p className="muted">
            {isGenericEvidenceReport
              ? "Included captures with technician-authored notes and capture details."
              : photoHeavy
                ? "Photo gallery and compact evidence index retained with this report."
                : "Additional included captures are retained here as a compact evidence index."}
          </p>
        </div>
        <span className="status-pill neutral compact">
          {supportingEvidence.length} included
        </span>
      </summary>
      {supportingEvidence.length > 0 ? (
        <div
          className={photoHeavy ? "review-photo-grid" : "evidence-first-list"}
        >
          {supportingEvidence.map((item) => {
            const metadata = evidenceMetadata.get(item.capture.id);
            return (
              <article key={item.capture.id} className="evidence-first-card">
                <div className="evidence-first-media">
                  {item.kind === "photo" && item.signedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed evidence URLs are short-lived Supabase links and should render exactly as captured.
                    <img src={item.signedUrl} alt={item.title} />
                  ) : item.signedUrl ? (
                    <div className="review-evidence-placeholder">
                      <a href={item.signedUrl}>Open {item.kind} evidence</a>
                    </div>
                  ) : (
                    <div className="review-evidence-placeholder">
                      {item.title}
                    </div>
                  )}
                </div>
                <div className="evidence-first-body">
                  <h4>{item.title}</h4>
                  {item.note ? (
                    <p>
                      <strong>Technician note / caption:</strong>{" "}
                      {stripConfidenceText(item.note)}
                    </p>
                  ) : (
                    <p className="muted">No technician note provided.</p>
                  )}
                  <p className="muted">
                    Captured {metadata?.capturedAtLabel ?? "Not captured"} ·{" "}
                    {metadata?.evidenceType ?? item.kind}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="muted">No included evidence selected for this report.</p>
      )}
    </details>
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
              data-evidence-card
            >
              <div className="report-edit-evidence-actions">
                <label className="report-visibility-toggle">
                  <input
                    type="checkbox"
                    name={`capture_include_${item.capture.id}`}
                    defaultChecked={item.capture.include_in_report}
                  />
                  <span>Include in report</span>
                </label>
                <DeleteEvidenceButton
                  captureId={item.capture.id}
                  className="button button-secondary touch-target danger-action"
                />
              </div>
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
                  <p className="muted">
                    {stripConfidenceText(item.note ?? "Supporting photo")}
                  </p>
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
                <p className="muted">
                  {stripConfidenceText(item.note ?? "Saved with the report.")}
                </p>
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
    <section
      id="approval"
      className="card detail-card report-sidebar-card form-stack compact-approval-panel"
    >
      <div>
        <p className="eyebrow">Approve</p>
        <h2>{isReadyForExport ? "Approved" : "Approve Report"}</h2>
        {reviewedLabel ? (
          <p className="success compact-success">
            Reviewed {reviewedLabel}
            {reviewedBy ? ` by ${reviewedBy}` : ""}.
          </p>
        ) : null}
      </div>
      <p className="muted">
        If this were printed right now, would the customer be happy receiving
        it?
      </p>
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
  pdfDownloadPath,
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
  pdfDownloadPath: string;
  saveAction: ServerAction;
  sessionId: string;
  shareAction: ServerAction;
  shareTokens: ReportShareToken[];
  timeZone: string | null;
}) {
  const activeShareTokens = shareTokens.filter((token) => !token.disabled_at);

  return (
    <section
      id="export-report"
      className="card detail-card report-sidebar-card report-delivery-tabs export-panel form-stack compact-export-panel"
    >
      <div>
        <p className="eyebrow">Deliver</p>
        <h2>Download PDF</h2>
        <p className="muted delivery-helper">
          {isReadyForExport
            ? "Download the customer-ready report, or open more delivery options for email and share links."
            : "Approve this report before downloading or sharing."}
        </p>
      </div>

      <div className="export-action-card export-button-grid report-primary-download-card">
        <div>
          <h3>Download PDF</h3>
          <p className="muted">
            Download a customer-ready PDF with embedded evidence images and
            signature.
          </p>
        </div>
        {isReadyForExport ? (
          <PdfDownloadButton href={pdfDownloadPath} />
        ) : (
          <span
            className="button button-primary touch-target disabled-action"
            aria-disabled="true"
          >
            Download PDF
          </span>
        )}
      </div>

      <details className="report-subsection report-delivery-options">
        <summary className="export-summary-row">More Delivery Options</summary>
        <div className="export-action-stack" aria-label="More delivery options">
          <form action={emailAction} className="form-stack export-action-card">
            <div>
              <h3>Email</h3>
              <p className="muted">
                Send a secure documentation link to recipients.
              </p>
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
                placeholder="Please review the documentation."
                disabled={!isReadyForExport}
              />
            </div>
            <button
              className="button button-secondary touch-target"
              disabled={!isReadyForExport}
            >
              Email
            </button>
          </form>

          <form action={shareAction} className="form-stack export-action-card">
            <div>
              <h3>Share Link</h3>
              <p className="muted">
                Create a secure link for this documentation.
              </p>
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
              <h3>Preview</h3>
              <p className="muted">
                Open the browser-friendly preview in a new tab.
              </p>
            </div>
            {isReadyForExport ? (
              <Link
                href={reportPath}
                className="button button-secondary touch-target"
                target="_blank"
              >
                Preview
              </Link>
            ) : (
              <span
                className="button button-secondary touch-target disabled-action"
                aria-disabled="true"
              >
                Preview
              </span>
            )}
          </div>

          <form
            action={saveAction}
            className="export-action-card export-button-grid"
          >
            <div>
              <h3>Save in CRED</h3>
              <p className="muted">Keep a saved copy of this report.</p>
            </div>
            <button
              className="button button-secondary touch-target"
              disabled={!isReadyForExport}
            >
              Save in CRED
            </button>
          </form>
        </div>
      </details>

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
    </section>
  );
}
