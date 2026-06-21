import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getCaptureProcessingStatus,
  getRequiredEvidenceCompletion,
} from "@/features/capture";
import {
  buildNormalizedReportModel,
  classifyReferenceDocumentTitle,
  deriveFormSectionsFromCaptures,
  getFormStructureSummary,
  sanitizeReportStructureForSession,
  normalizeDraftSections,
  stripConfidenceText,
  sanitizeCapturesForImageAiAssist,
} from "@/features/reports/report-structure";
import { buildUniversalReportDocument } from "@/features/reports/report-document";
import { getDisplayReportTitle } from "@/features/reports/report-title";
import {
  createReportShareLink,
  emailReport,
  generateAiReportDraft,
  generateFinalNotesForSession,
  markReportReviewed,
  saveFinalNotes,
  saveReport,
  saveReportEdits,
} from "@/features/reports/actions";
import { formatDateTime } from "@/features/sessions";
import { requireSessionWorkspace } from "@/features/sessions/data";
import type { Database } from "@/lib/supabase/database.types";
import {
  DiagnosticProcedureReport,
  ExportPanel,
  getDiagnosticProcedureInfo,
  InlineReviewPanel,
  InspectorFacilityPanel,
  ReportReview,
  type SupportingEvidenceItem,
} from "@/features/reports/review/ReviewComponents";
import { FinalNotesEditor } from "@/features/reports/components/FinalNotesEditor";

type Tables = Database["public"]["Tables"];
type DocumentationSession = Tables["documentation_sessions"]["Row"];
type AiReportDraft = Tables["ai_report_drafts"]["Row"];
type CaptureItem = Tables["capture_items"]["Row"];

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
