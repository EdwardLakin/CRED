import Link from "next/link";

import {
  asDiagnosticRecordArray,
  getDiagnosticProcedureProgress,
  getDiagnosticStepCompleteness,
} from "@/features/diagnostic-procedures/progress";
import {
  EVIDENCE_CATEGORIES,
  EVIDENCE_CATEGORY_LABELS,
  normalizeEvidenceCategory,
} from "@/features/capture/evidence-category";
import { DeleteEvidenceButton } from "@/features/capture/components/DeleteEvidenceButton";
import {
  buildNormalizedReportModel,
  classifyReferenceDocumentTitle,
  normalizeDraftSections,
  stripConfidenceText,
} from "@/features/reports/report-structure";
import { buildUniversalReportDocument } from "@/features/reports/report-document";
import { isCaptureIncludedInOutput } from "@/features/reports/capture-inclusion";
import { getReportInfoValue } from "@/features/reports/report-title";
import { getObservationReportTitleState } from "@/features/reports/observation-titles";
import { disableReportShareLink } from "@/features/reports/actions";
import { formatDateTime } from "@/features/sessions";
import { requireSessionWorkspace } from "@/features/sessions/data";
import {
  EvidenceImageTrigger,
  type EvidenceLightboxItem,
} from "@/features/reports/review/EvidenceImageLightbox";
import { SignatureCaptureForm } from "@/features/signatures";
import { PendingActionButton } from "@/features/reports/review/PendingActionButton";
import { ReportEditAutosaveForm } from "@/features/reports/review/ReportEditAutosaveForm";
import { SummaryAssistantEditor } from "@/features/reports/review/SummaryAssistantEditor";
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
export type SupportingEvidenceItem = {
  capture: CaptureItem;
  signedUrl: string | null;
  originalUrl?: string | null;
  downloadUrl?: string | null;
  title: string;
  note: string | null;
  kind: "photo" | "video" | "audio" | "note" | "document" | "file";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHiddenFromReport(metadata: unknown) {
  return isRecord(metadata) && metadata.hidden_from_report === true;
}


function sectionHasCustomerContent(section: AiReportDraftSection) {
  const body = stripConfidenceText(section.body ?? "").trim();
  const fields = normalizeDraftSections([section], []).flatMap((item) => item.fields);
  const hasFields = fields.some((field) => stripConfidenceText(String(field.value ?? "")).trim());
  return Boolean(body || hasFields);
}


function getIncludeEvidenceAppendixDefault(session: Pick<DocumentationSession, "session_metadata">) {
  const metadata = isRecord(session.session_metadata) ? session.session_metadata : null;
  const options = metadata && isRecord(metadata.report_options) ? metadata.report_options : null;
  return typeof options?.includeEvidenceAppendix === "boolean"
    ? options.includeEvidenceAppendix
    : true;
}
function getReportTypeHint(session: Pick<DocumentationSession, "session_type" | "asset_label" | "suggested_details">, sections: AiReportDraftSection[]) {
  const haystack = [
    session.session_type,
    session.asset_label,
    JSON.stringify(session.suggested_details ?? {}),
    sections.map((section) => section.title).join(" "),
  ].join(" ").toLowerCase();
  if (/rental|property|inspection|unit|suite|tenant|landlord/.test(haystack)) return "rental";
  if (/vehicle|automotive|diagnostic|dtc|vin|mileage|odometer|freeze frame|live data/.test(haystack)) return "automotive";
  return "general";
}

function isApplicableReportSection(title: string, reportType: string) {
  const normalized = title.toLowerCase();
  if (/cover|executive|summary|concern|observation|evidence|signoff|signature|approval|recommendation/.test(normalized)) return true;
  if (reportType === "rental") return /property|customer|documented/.test(normalized);
  if (reportType === "automotive") return /vehicle|asset|dtc|fault|freeze|live data|measurement|functional|test|road|repair|verification/.test(normalized);
  return !/freeze|live data|dtc|road test/.test(normalized);
}

function getSectionDisplayTitle(section: AiReportDraftSection) {
  const title = stripConfidenceText(section.title);
  if (/vehicle \/ asset information/i.test(title)) return "Vehicle Information";
  if (/dtcs? \/ fault codes/i.test(title)) return "DTCs";
  if (/freeze frame/i.test(title)) return "Freeze Frame";
  if (/live data/i.test(title)) return "Live Data";
  if (/technician observations/i.test(title)) return "Observations";
  if (/evidence appendix/i.test(title)) return "Evidence";
  return title;
}

function getFieldGroupTitle(key: string, reportType: string) {
  const normalized = key.toLowerCase();
  if (/vin|mileage|odometer|license|model|make|vehicle|asset|equipment|serial/.test(normalized)) return reportType === "rental" ? "Property Information" : "Vehicle Information";
  if (/inspector|technician|prepared|certification|signature|organization|facility/.test(normalized)) return "Inspector Information";
  if (/customer|client|location|reference|report|address|property|unit/.test(normalized)) return reportType === "automotive" ? "Customer Information" : "Property Information";
  return "Additional Report Details";
}

function isPhotoCapture(capture: CaptureItem) {
  return (
    capture.media_kind === "image" ||
    capture.type === "photo" ||
    Boolean(capture.storage_path?.match(/\.(jpg|jpeg|png|webp|gif|heic)$/i))
  );
}

function getEvidenceNote(capture: CaptureItem) {
  return capture.technician_note?.trim() || capture.transcript?.trim() || null;
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
  const storedTitle = getObservationReportTitleState(item.extracted_data);
  if (storedTitle.approved) return storedTitle.approved;
  if (storedTitle.suggested) return storedTitle.suggested;

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

function getDiagnosticStepMetadata(section: AiReportDraftSection) {
  return isRecord(section.metadata)
    ? (section.metadata as Record<string, unknown>)
    : {};
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

export function getDiagnosticProcedureInfo(draft: AiReportDraft | null) {
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

export function DiagnosticProcedureReport({
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
  reportTemplates?: Array<{ id: string; name: string; is_default: boolean }>;
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

export function ReportReview({
  reportSections,
  currentReport,
  generateReportAction,
  hasPendingEvidence,
  hasPrepareError,
  isEditingReport,
  noteEvidence,
  otherEvidence,
  photoEvidence,
  reviewDocument,
  supportingEvidence,
  includedReviewSummary,
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
  reviewDocument: ReturnType<typeof buildNormalizedReportModel<CaptureItem>>;
  supportingEvidence: SupportingEvidenceItem[];
  includedReviewSummary: { included: number; reviewed: number; unreviewed: number };
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
    | "display_id"
  >;
  saveReportEditsAction: ServerAction | null;
  sourceFieldEntries: [string, unknown][];
  facilityName: string;
  facilityLocation: string;
  displayReportTitle: string;
  isGenericEvidenceReport: boolean;
  reportDocument: ReturnType<typeof buildUniversalReportDocument<CaptureItem>>;
  timeZone: string | null;
  reportTemplates?: Array<{ id: string; name: string; is_default: boolean }>;
}) {
  const reportTypeHint = getReportTypeHint(session, reportSections);
  const visibleReportSections = reportSections.filter(
    (section) =>
      sectionHasCustomerContent(section) ||
      isApplicableReportSection(section.title, reportTypeHint),
  );
  const unusedReportSections = reportSections.filter(
    (section) => !visibleReportSections.some((visible) => visible.id === section.id),
  );
  const sourceFieldGroups = sourceFieldEntries.reduce<Record<string, [string, unknown][]>>(
    (groups, entry) => {
      const group = getFieldGroupTitle(entry[0], reportTypeHint);
      groups[group] = [...(groups[group] ?? []), entry];
      return groups;
    },
    {},
  );
  const includedEvidenceCount = [
    ...photoEvidence,
    ...noteEvidence,
    ...otherEvidence,
  ].filter((item) => isCaptureIncludedInOutput(item.capture)).length;
  const observationEntries = [
    ...reviewDocument.findings,
    ...reviewDocument.concerns,
    ...reviewDocument.recommendedActionEvidence,
    ...reviewDocument.referenceDocuments,
    ...reviewDocument.additionalNotes,
    ...reviewDocument.supportingEvidence,
  ];
  const uniqueObservationCount = new Set(
    observationEntries.map((entry) => getObservationGroupKey(entry.capture)),
  ).size;
  const missingEvidenceCount = observationEntries.filter((entry) => {
    const groupKey = getObservationGroupKey(entry.capture);
    return !supportingEvidence.some(
      (item) => getObservationGroupKey(item.capture) === groupKey && item.kind === "photo",
    );
  }).length;
  const hasSummary = Boolean(stripConfidenceText(currentReport?.summary ?? "").trim());
  const hasSignature = false;
  const qualityChecks = [
    { label: "Cover/title present", ok: Boolean(displayReportTitle.trim()) },
    { label: "Executive summary ready", ok: hasSummary },
    { label: `${uniqueObservationCount} observations documented`, ok: uniqueObservationCount > 0 },
    { label: missingEvidenceCount ? `${missingEvidenceCount} observations missing photo evidence` : `${includedEvidenceCount} supporting evidence items included`, ok: missingEvidenceCount === 0 && includedEvidenceCount > 0 },
    { label: "Technician notes present", ok: observationEntries.some((entry) => getEvidenceNote(entry.capture)) },
    { label: "Approval complete", ok: currentReport?.status === "approved" },
    { label: "Blank unused sections tucked away", ok: unusedReportSections.length === 0 || visibleReportSections.length > 0 },
  ];
  const qualityScore = Math.round((qualityChecks.filter((check) => check.ok).length / qualityChecks.length) * 100);
  const outlineItems = [
    { label: "Cover", href: "report-cover-editor", ok: Boolean(displayReportTitle.trim()) },
    { label: hasSummary ? "Executive Summary" : "Executive Summary missing", href: "report-summary-editor", ok: hasSummary },
    { label: `Observations (${uniqueObservationCount})`, href: "report-observations-editor", ok: uniqueObservationCount > 0 },
    { label: missingEvidenceCount ? `${missingEvidenceCount} observations missing evidence` : `Supporting Evidence (${includedEvidenceCount})`, href: "report-evidence-editor", ok: missingEvidenceCount === 0 && includedEvidenceCount > 0 },
    { label: "Signature", href: "report-signoff-editor", ok: hasSignature },
    { label: currentReport?.status === "approved" ? "Ready to Export" : "Not ready yet", href: "report-export-actions", ok: currentReport?.status === "approved" },
  ];
  const coverDetails = [
    ["Report Title", displayReportTitle],
    ["Organization", facilityName],
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
    [
      "Location",
      getReportInfoValue(currentReport, session, "location") ||
        facilityLocation,
    ],
    ["Report ID", session.display_id],
    [
      "Report Date",
      formatDateTime(
        currentReport?.updated_at ?? session.updated_at ?? session.created_at,
        timeZone,
      ),
    ],
  ]
    .map(([label, value]) => [
      label,
      stripConfidenceText(String(value ?? "")).trim(),
    ])
    .filter(([, value]) => value);
  return (
    <section className="card detail-card report-command-card form-stack generated-report-card">
      <div className="report-section-heading generated-report-heading">
        <div>
          <p className="eyebrow">Review Report</p>
          <h2>{displayReportTitle}</h2>
          <p className="muted">{reportDocument.trustStatement}</p>
          {!isGenericEvidenceReport && reviewDocument.sections.length > 0 ? (
            <p className="status-pill neutral">Organized from captured form</p>
          ) : null}
          <div className="form-actions report-inline-actions">
            <Link
              href={`/dashboard/sessions/${session.id}/capture`}
              className="button button-primary touch-target"
            >
              Add More Evidence
            </Link>
            {currentReport ? (
              <form action={generateReportAction}>
                <PendingActionButton className="button button-secondary touch-target" pendingLabel="Regenerating…">
                  Regenerate Report
                </PendingActionButton>
              </form>
            ) : null}
          </div>
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
          <p className="eyebrow">Cover</p>
          <h3>{displayReportTitle}</h3>
          <div className="report-field-grid">
            {coverDetails.map(([label, value]) => (
              <div key={label} className="report-field-card">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
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
              <PendingActionButton className="button button-secondary touch-target" pendingLabel="Preparing report…">
                Try Again
              </PendingActionButton>
            ) : null}
          </div>
        </form>
      ) : null}

      {currentReport && isEditingReport && saveReportEditsAction ? (
        <>
        <aside className="report-studio-sidebar">
          <nav className="report-edit-panel report-outline-nav" aria-label="Report outline">
            <strong>Report Outline</strong>
            <div className="report-outline-list">
              {outlineItems.map((item) => (
                <a key={item.href} className={item.ok ? "status-pill success" : "status-pill attention"} href={`#${item.href}`}>{item.ok ? "✓" : "⚠"} {item.label}</a>
              ))}
            </div>
          </nav>
          <section className="report-edit-panel report-quality-panel" aria-label="Report quality guidance">
            <div>
              <strong>Report Quality</strong>
              <p className="report-quality-score">{qualityScore}%</p>
              <p className="muted">Guidance only. This does not block export or change approval rules.</p>
            </div>
            <ul className="report-quality-list">
              {qualityChecks.map((check) => (
                <li key={check.label} className={check.ok ? "success" : "attention"}>{check.ok ? "✓" : "⚠"} {check.label}</li>
              ))}
            </ul>
          </section>
        </aside>
        <ReportEditAutosaveForm action={saveReportEditsAction}>
          <details id="report-cover-editor" className="report-subsection report-edit-panel" open>
            <summary className="report-section-title-row">
              <div>
                <h3>Report Details</h3>
                <p className="muted">
                  Edit customer-facing report details and the executive summary.
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
            <label className="checkbox-row">
              <input
                type="checkbox"
                name="include_evidence_appendix"
                defaultChecked={getIncludeEvidenceAppendixDefault(session)}
              />
              Include Evidence Appendix
            </label>
            <p className="muted">
              This report-level setting overrides the workspace/template appendix default for this report only.
            </p>
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
            </div>
            <div className="report-field-card">
              <span>Report ID</span>
              <strong>{session.display_id ?? "Generated after save"}</strong>
            </div>
            <SummaryAssistantEditor initialSummary={stripConfidenceText(currentReport.summary ?? "")} sessionId={session.id} />
          </details>

          <details id="report-observations-editor" className="report-subsection report-edit-panel" open>
            <summary>
              <h3>Documented Observations</h3>
              <p className="muted">
                Edit the customer-facing sections detected for this report. Unused engine sections are tucked away below.
              </p>
            </summary>
            <div className="report-content-grid">
              {visibleReportSections.map((section) => {
                const included = !isHiddenFromReport(section.metadata);
                return (
                  <article
                    id={`report-section-${section.id}`}
                    key={section.id}
                    className="report-edit-panel report-edit-item"
                  >
                    <input type="hidden" name={`section_include_${section.id}`} value={included ? "on" : ""} />
                    {included ? (
                      <p className="muted">Included automatically because this section has report content.</p>
                    ) : null}
                    <label className="field-stack">
                      <span className="label">Section title</span>
                      <input
                        className="input"
                        name={`section_title_${section.id}`}
                        defaultValue={stripConfidenceText(section.title)}
                      />
                    </label>
                    <div className="field-stack">
                      <span className="label">Technician Notes</span>
                      <div className="report-field-card observation-technician-notes">
                        {getSectionTechnicianNotes(section, supportingEvidence) || "No technician notes linked to this observation."}
                      </div>
                    </div>
                    <label className="field-stack">
                      <span className="label">Customer Facing Report Text</span>
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
                              <input type="hidden" name={`section_field_include_${section.id}_${fieldIndex}`} value="on" />
                              <label className="field-stack">
                                <span className="label">{field.label}</span>
                                <input
                                  className="input"
                                  name={`section_field_value_${section.id}_${fieldIndex}`}
                                  defaultValue={stripConfidenceText(
                                    field.value,
                                  )}
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
          </details>

            {unusedReportSections.length > 0 ? (
              <details className="report-subsection report-edit-panel">
                <summary>
                  <h3>Unused Report Sections ({unusedReportSections.length})</h3>
                  <p className="muted">Available when this report needs additional specialized content.</p>
                </summary>
                <div className="report-content-grid">
                  {unusedReportSections.map((section) => (
                    <article id={`report-section-${section.id}`} key={section.id} className="report-field-card report-edit-field-card">
                      <input type="hidden" name={`section_include_${section.id}`} value={isHiddenFromReport(section.metadata) ? "" : "on"} />
                      <input type="hidden" name={`section_title_${section.id}`} value={stripConfidenceText(section.title)} />
                      <input type="hidden" name={`section_body_${section.id}`} value={stripConfidenceText(section.body ?? "")} />
                      <input type="hidden" name={`section_field_count_${section.id}`} value="0" />
                      <strong>{getSectionDisplayTitle(section)}</strong>
                      <span className="muted">Not detected</span>
                      <button type="button" className="button button-secondary touch-target">Add</button>
                    </article>
                  ))}
                </div>
              </details>
            ) : null}

          <details id="report-evidence-editor" className="report-subsection report-edit-panel" open>
            <summary>
              <h3>Supporting Evidence</h3>
              <p className="muted">
                Edit notes, categories, and original evidence files.
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
              <h3>Metadata</h3>
              <p className="muted">
                Customer, asset, inspector, organization, and source form fields grouped for review.
              </p>
            </summary>
            <input
              type="hidden"
              name="field_count"
              value={sourceFieldEntries.length}
            />
            <div className="form-stack">
              {sourceFieldEntries.length > 0 ? (
                Object.entries(sourceFieldGroups).map(([groupTitle, entries]) => (
                  <section key={groupTitle} className="brand-section form-stack">
                    <h4>{groupTitle}</h4>
                    <div className="report-field-grid">
                      {entries.map(([key, value]) => {
                        const index = sourceFieldEntries.findIndex(([fieldKey]) => fieldKey === key);
                        return (
                  <div
                    key={key}
                    className="report-field-card report-edit-field-card"
                  >
                    <input
                      type="hidden"
                      name={`field_key_${index}`}
                      value={key}
                    />
                    <input type="hidden" name={`field_include_${index}`} value="on" />
                    <label className="field-stack">
                      <span className="label">{key.replace(/_/g, " ")}</span>
                      <input
                        className="input"
                        name={`field_value_${index}`}
                        defaultValue={String(value)}
                      />
                    </label>
                  </div>
                        );
                      })}
                    </div>
                  </section>
                ))
              ) : (
                <p className="muted">No saved form fields yet.</p>
              )}
            </div>
          </details>

          <div className="form-actions report-inline-actions report-primary-flow">
            <Link
              href={`/dashboard/sessions/${session.id}/capture`}
              className="button button-secondary touch-target"
            >
              Continue Capturing
            </Link>
          </div>
        </ReportEditAutosaveForm>
        </>
      ) : null}

      {!isEditingReport ? (
        <>
          {!isGenericEvidenceReport ? (
            <FormStructuredReview reviewDocument={reviewDocument} />
          ) : null}
          <DocumentedObservations
            reviewDocument={reviewDocument}
            supportingEvidence={supportingEvidence}
            includedEvidenceCount={includedEvidenceCount}
            includedReviewSummary={includedReviewSummary}
          />
        </>
      ) : null}
    </section>
  );
}

export function InspectorFacilityPanel({
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
      <section id="report-signoff-editor" className="card detail-card report-command-card form-stack signature-review-panel">
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
          <div className="form-stack">
            <p className="muted">No report-specific signature captured.</p>
            <details className="report-subsection report-edit-panel">
              <summary>
                <h3>Sign Report</h3>
              </summary>
              <SignatureCaptureForm sessionId={sessionId} />
            </details>
          </div>
        )}
      </section>
    );
  }

  return (
    <details
      id="report-signoff-editor"
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

function getSectionTechnicianNotes(section: AiReportDraftSection, supportingEvidence: SupportingEvidenceItem[]) {
  const ids = new Set(Array.isArray(section.source_capture_ids) ? section.source_capture_ids.filter((id): id is string => typeof id === "string") : []);
  const notes = supportingEvidence
    .filter((item) => ids.has(item.capture.id))
    .map((item) => stripConfidenceText(item.capture.technician_note?.trim() || item.capture.transcript?.trim() || item.note || ""))
    .filter(Boolean);
  return Array.from(new Set(notes)).join("\n");
}

function getObservationCategoryLabel(
  entry: ReturnType<
    typeof buildNormalizedReportModel<CaptureItem>
  >["findings"][number],
) {
  const category = normalizeEvidenceCategory(entry.capture.evidence_category);
  if (category === "observation") return "Observation";
  if (category === "concern") return "Concern";
  if (category === "recommended_action") return "Recommended Action";
  if (entry.purpose === "concern") return "Concern";
  if (entry.purpose === "recommended_action") return "Recommended Action";
  if (
    entry.purpose === "supporting_evidence" ||
    entry.purpose === "reference_document"
  )
    return "Supporting Evidence";
  return "Observation";
}

function getObservationGroupKey(capture: CaptureItem) {
  return capture.observation_group_id ?? capture.id;
}

function getGroupedEvidenceItems(
  primary: SupportingEvidenceItem | undefined,
  allItems: SupportingEvidenceItem[],
) {
  if (!primary) return [] as SupportingEvidenceItem[];
  const groupKey = getObservationGroupKey(primary.capture);
  return allItems
    .filter((item) => getObservationGroupKey(item.capture) === groupKey)
    .sort(
      (a, b) =>
        (a.capture.group_order ?? (a.capture.id === groupKey ? 1 : 999)) -
          (b.capture.group_order ?? (b.capture.id === groupKey ? 1 : 999)) ||
        a.capture.captured_at.localeCompare(b.capture.captured_at),
    );
}

function getLightboxItemId(item: SupportingEvidenceItem) {
  return (
    item.capture.storage_path?.trim() ||
    item.originalUrl?.trim() ||
    item.downloadUrl?.trim() ||
    item.signedUrl?.trim() ||
    item.capture.id
  );
}

function toLightboxItem(item: SupportingEvidenceItem): EvidenceLightboxItem | null {
  if (item.kind !== "photo" || !item.signedUrl) return null;
  return {
    id: getLightboxItemId(item),
    captureId: item.capture.id,
    src: item.signedUrl,
    downloadUrl: item.downloadUrl ?? item.originalUrl ?? null,
    title: item.title,
    note: stripConfidenceText(item.note ?? ""),
  };
}

function getLightboxItems(
  items: SupportingEvidenceItem[],
): EvidenceLightboxItem[] {
  return items.flatMap((item) => {
    const lightboxItem = toLightboxItem(item);
    return lightboxItem ? [lightboxItem] : [];
  });
}

function DownloadOriginalLink({
  item,
  className = "evidence-download-overlay",
}: {
  item: SupportingEvidenceItem;
  className?: string;
}) {
  if (!item.downloadUrl) return null;
  return (
    <a
      className={className}
      href={item.downloadUrl}
      download
      aria-label="Download original"
      title="Download original"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        focusable="false"
        className="evidence-download-icon"
      >
        <path
          d="M10 2.5a.75.75 0 0 1 .75.75v7.69l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22V3.25A.75.75 0 0 1 10 2.5Zm-5.25 10a.75.75 0 0 1 .75.75v1.5c0 .414.336.75.75.75h7.5a.75.75 0 0 0 .75-.75v-1.5a.75.75 0 0 1 1.5 0v1.5A2.25 2.25 0 0 1 13.75 17h-7.5A2.25 2.25 0 0 1 4 14.75v-1.5a.75.75 0 0 1 .75-.75Z"
          fill="currentColor"
        />
      </svg>
      <span className="sr-only">Download original</span>
    </a>
  );
}


function FormStructuredReview({
  reviewDocument,
}: {
  reviewDocument: ReturnType<typeof buildNormalizedReportModel<CaptureItem>>;
}) {
  const sections = reviewDocument.sections.filter(
    (section) => section.fields.length > 0 || section.body,
  );
  if (sections.length === 0) return null;
  return (
    <section className="report-subsection report-supporting-section">
      <div className="report-section-title-row">
        <div>
          <h3>Captured Form Structure</h3>
          <p className="muted">
            CRED organized this review from the captured document structure.
          </p>
        </div>
      </div>
      <div className="report-content-grid">
        {sections.map((section) => (
          <article key={section.key} className="report-edit-panel">
            <h4>{section.title}</h4>
            {section.body ? <p>{stripConfidenceText(section.body)}</p> : null}
            {section.fields.length > 0 ? (
              <div className="report-field-grid">
                {section.fields.map((field) => (
                  <div key={`${section.key}-${field.key}`} className="report-field-card">
                    <span>{field.label}</span>
                    <strong>{stripConfidenceText(field.value) || "Not captured"}</strong>
                    {field.status_choices?.length ? (
                      <small className="muted">Choices: {field.status_choices.join(", ")}</small>
                    ) : null}
                    {field.unit ? <small className="muted">Unit: {field.unit}</small> : null}
                    {field.notes ? <small className="muted">{stripConfidenceText(field.notes)}</small> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function DocumentedObservations({
  reviewDocument,
  supportingEvidence,
  includedEvidenceCount,
  includedReviewSummary,
}: {
  reviewDocument: ReturnType<typeof buildNormalizedReportModel<CaptureItem>>;
  supportingEvidence: SupportingEvidenceItem[];
  includedEvidenceCount: number;
  includedReviewSummary: { included: number; reviewed: number; unreviewed: number };
}) {
  const evidenceById = new Map(
    supportingEvidence.map((item) => [item.capture.id, item]),
  );
  const renderedIds = new Set<string>();
  const entries = [
    ...reviewDocument.findings,
    ...reviewDocument.concerns,
    ...reviewDocument.recommendedActionEvidence,
    ...reviewDocument.referenceDocuments,
    ...reviewDocument.additionalNotes,
    ...reviewDocument.supportingEvidence,
  ].filter((entry) => {
    const groupKey = getObservationGroupKey(entry.capture);
    if (renderedIds.has(groupKey)) return false;
    renderedIds.add(groupKey);
    return true;
  });
  const unattachedActions = reviewDocument.categorizedRecommendedActions.filter(
    (action) => action.action.trim(),
  );

  return (
    <section className="report-subsection report-supporting-section">
      <div className="report-section-title-row">
        <div>
          <h3>Documented Observations</h3>
        </div>
        <span className="status-pill neutral compact">
          {includedEvidenceCount} included
        </span>
      </div>
      {includedReviewSummary.unreviewed > 0 ? (
        <p className="muted compact-review-summary">
          {includedReviewSummary.included} included · {includedReviewSummary.reviewed} reviewed · {includedReviewSummary.unreviewed} not individually reviewed
        </p>
      ) : null}
      <div className="evidence-first-list">
        {entries.map((entry) => {
          const groupKey = getObservationGroupKey(entry.capture);
          const item =
            evidenceById.get(entry.group.capture_id) ??
            supportingEvidence.find(
              (candidate) =>
                getObservationGroupKey(candidate.capture) === groupKey,
            );
          const technicianNote = stripConfidenceText(
            entry.capture.technician_note?.trim() ||
              entry.capture.transcript?.trim() ||
              item?.note ||
              "",
          );
          const groupItems = getGroupedEvidenceItems(item, supportingEvidence);
          const photoGroupItems = groupItems.filter(
            (groupItem) => groupItem.kind === "photo" && groupItem.signedUrl,
          );
          const isPhoto = item?.kind === "photo";
          const isDocument = item?.kind === "document" || item?.kind === "file";
          return (
            <article
              key={entry.group.capture_id}
              className="evidence-first-card"
            >
              <div className="evidence-first-media">
                {isPhoto && item?.signedUrl ? (
                  <div className="downloadable-evidence-preview">
                    <EvidenceImageTrigger
                      items={getLightboxItems(
                        groupItems.length ? groupItems : supportingEvidence,
                      )}
                      currentId={getLightboxItemId(item)}
                      imageClassName="pdf-safe-image"
                    />
                    <DownloadOriginalLink item={item} />
                  </div>
                ) : item?.signedUrl && isDocument ? (
                  <div className="review-evidence-placeholder downloadable-evidence-preview">
                    <a href={item.signedUrl}>Open Supporting Document</a>
                    <DownloadOriginalLink item={item} />
                  </div>
                ) : (
                  <div className="review-evidence-placeholder">
                    {item?.title ?? "Supporting proof"}
                  </div>
                )}
              </div>
              <div className="evidence-first-body">
                <div className="finding-card-header">
                  <h4>
                    {technicianNote
                      ? (item?.title ?? getEvidenceTitle(entry.capture))
                      : "Untitled observation"}
                  </h4>
                  <span className="severity-badge">
                    {getObservationCategoryLabel(entry)}
                  </span>
                </div>
                {technicianNote ? (
                  <div>
                    <strong>Technician Note</strong>
                    <p>{technicianNote}</p>
                  </div>
                ) : null}
                {photoGroupItems.length > 1 ? (
                  <div className="supporting-image-strip">
                    <strong>Supporting images</strong>
                    <div className="supporting-image-grid">
                      {photoGroupItems.map((groupItem) => (
                        <div
                          key={groupItem.capture.id}
                          className="supporting-image-thumb downloadable-evidence-preview"
                        >
                          <EvidenceImageTrigger
                            items={getLightboxItems(photoGroupItems)}
                            currentId={getLightboxItemId(groupItem)}
                            imageClassName="pdf-safe-image"
                          />
                          <DownloadOriginalLink item={groupItem} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
        {unattachedActions.map((action, index) => (
          <article key={action.action} className="evidence-first-card">
            <div className="evidence-first-body">
              <div className="finding-card-header">
                <div>
                  <p className="eyebrow">
                    Observation {entries.length + index + 1}
                  </p>
                  <h4>Recommended Action</h4>
                </div>
                <span className="severity-badge">Recommended Action</span>
              </div>
              <strong>Technician Note</strong>
              <p>{stripConfidenceText(action.action)}</p>
            </div>
          </article>
        ))}
      </div>
      {entries.length === 0 && unattachedActions.length === 0 ? (
        <p className="muted">No documented observations added yet.</p>
      ) : null}
    </section>
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
          evidenceItems.map((item, index) => (
            <article
              key={item.capture.id}
              className="review-note-card report-edit-evidence-card"
              data-evidence-card
            >
              <div className="report-observation-order-row">
                <span className="status-pill neutral compact">Observation {String(index + 1).padStart(2, "0")}</span>
                <span className="drag-handle" aria-hidden="true">⋮⋮</span>
                <label className="field-stack compact-field">
                  <span className="label">Order</span>
                  <input
                    className="input compact-order-input"
                    type="number"
                    min="1"
                    name={`capture_report_order_${item.capture.id}`}
                    defaultValue={item.capture.report_order ?? index + 1}
                    aria-label={`Observation order for ${item.title}`}
                  />
                </label>
              </div>
              <div className="report-edit-evidence-actions">
                <label className="report-visibility-toggle">
                  <input
                    type="checkbox"
                    name={`capture_include_${item.capture.id}`}
                    defaultChecked={item.capture.include_in_report !== false}
                  />
                  <span>Show in report export</span>
                </label>
                <DeleteEvidenceButton
                  captureId={item.capture.id}
                  className="button button-secondary touch-target danger-action"
                />
              </div>
              <div className="report-edit-evidence-preview">
                {item.kind === "photo" && item.signedUrl ? (
                  <EvidenceImageTrigger
                    items={getLightboxItems(evidenceItems)}
                    currentId={getLightboxItemId(item)}
                    imageClassName="pdf-safe-image"
                  />
                ) : null}
                {item.downloadUrl ? (
                  <DownloadOriginalLink
                    item={item}
                    className="secondary-link subtle-download-link icon-download-link"
                  />
                ) : null}
                <strong>{item.title}</strong>
              </div>
              <label className="field-stack compact-field">
                <span className="label">Supports</span>
                <select
                  className="input"
                  name={`capture_group_with_${item.capture.id}`}
                  defaultValue={
                    item.capture.observation_group_id ?? item.capture.id
                  }
                >
                  <option value={item.capture.id}>
                    Standalone
                  </option>
                  {evidenceItems
                    .filter(
                      (candidate) => candidate.capture.id !== item.capture.id,
                    )
                    .map((candidate) => (
                      <option
                        key={candidate.capture.id}
                        value={
                          candidate.capture.observation_group_id ??
                          candidate.capture.id
                        }
                      >
                        {candidate.title}
                      </option>
                    ))}
                </select>
              </label>
              <div
                className="evidence-category-pills"
                role="radiogroup"
                aria-label="Evidence category"
              >
                {EVIDENCE_CATEGORIES.map((category) => (
                  <label
                    key={category}
                    className={`status-pill compact evidence-category-pill ${category === normalizeEvidenceCategory(item.capture.evidence_category) ? "success" : "neutral"}`}
                  >
                    <input
                      type="radio"
                      name={`capture_category_${item.capture.id}`}
                      value={category}
                      defaultChecked={
                        category ===
                        normalizeEvidenceCategory(
                          item.capture.evidence_category,
                        )
                      }
                    />
                    {EVIDENCE_CATEGORY_LABELS[category]}
                  </label>
                ))}
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
                  <div className="downloadable-evidence-preview">
                    <EvidenceImageTrigger
                      items={getLightboxItems(photoEvidence)}
                      currentId={getLightboxItemId(item)}
                      imageClassName="pdf-safe-image"
                    />
                    <DownloadOriginalLink item={item} />
                  </div>
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
                <div className="report-card-action-row">
                  <strong>{item.title}</strong>
                  {item.downloadUrl ? (
                    <DownloadOriginalLink
                      item={item}
                      className="secondary-link subtle-download-link icon-download-link"
                    />
                  ) : null}
                </div>
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
                <div className="report-card-action-row">
                  <strong>{item.title}</strong>
                  {item.downloadUrl ? (
                    <DownloadOriginalLink
                      item={item}
                      className="secondary-link subtle-download-link icon-download-link"
                    />
                  ) : null}
                </div>
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

export function InlineReviewPanel({
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
            <PendingActionButton className="button button-primary touch-target" pendingLabel="Approving…">
              Approve Report
            </PendingActionButton>
          </div>
        </form>
      ) : null}
    </section>
  );
}

export function ExportPanel({
  emailAction,
  isReadyForExport,
  origin,
  reportPath,
  saveAction,
  sessionId,
  shareAction,
  shareTokens,
  timeZone,
  reportTemplates = [],
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
  reportTemplates?: Array<{ id: string; name: string; is_default: boolean }>;
}) {
  const activeShareTokens = shareTokens.filter((token) => !token.disabled_at);

  return (
    <details
      id="export-report"
      className="card detail-card report-sidebar-card export-panel compact-export-panel"
      open={isReadyForExport}
    >
      <summary className="export-panel-summary">
        <span className="export-panel-icon" aria-hidden="true">
          ⇧
        </span>
        <span>
          <span className="eyebrow">Export Report</span>
          <span className="export-panel-title">Export Report</span>
          <span className="muted delivery-helper">
            Deliver, preview, or save your approved documentation.
          </span>
        </span>
        <span className="export-panel-chevron" aria-hidden="true">
          ⌄
        </span>
      </summary>

      <div className="export-panel-body">
        {!isReadyForExport ? (
          <p className="notice warning export-locked-message">
            Approve the report before delivery options are available.
          </p>
        ) : null}


        <div className="field-stack report-template-export-selector"><label className="label" htmlFor="report_template_id">Report Template</label><select id="report_template_id" name="report_template_id" className="input" defaultValue="workspace-default" form="print-report-form"><option value="workspace-default">Workspace default</option>{reportTemplates.map(t=><option key={t.id} value={t.id}>{t.name}{t.is_default?' — default':''}</option>)}<option value="system">System default</option></select><p className="muted">Using workspace default unless you choose a saved template or system default. Templates only change report appearance.</p></div>

        <div
          className="export-action-tiles"
          aria-label="Report delivery options"
        >
          <details
            className="export-action-tile"
            aria-disabled={!isReadyForExport}
          >
            <summary>
              <span
                className="export-tile-icon export-tile-icon-email"
                aria-hidden="true"
              >
                ✉
              </span>
              <strong>Email Report</strong>
            </summary>
            <form
              action={emailAction}
              className="form-stack export-action-details"
            >
              <p className="muted">
                Send a secure documentation link to recipients.
              </p>
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
              <PendingActionButton
                className="button button-secondary touch-target"
                disabled={!isReadyForExport}
                pendingLabel="Sending…"
              >
                Send Email
              </PendingActionButton>
            </form>
          </details>

          <details
            className="export-action-tile"
            aria-disabled={!isReadyForExport}
          >
            <summary>
              <span
                className="export-tile-icon export-tile-icon-share"
                aria-hidden="true"
              >
                🔗
              </span>
              <strong>Share Link</strong>
            </summary>
            <form
              action={shareAction}
              className="form-stack export-action-details"
            >
              <p className="muted">
                Create a secure link for this documentation.
              </p>
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
              <PendingActionButton
                className="button button-secondary touch-target"
                disabled={!isReadyForExport}
                pendingLabel="Creating link…"
              >
                Copy Share Link
              </PendingActionButton>
            </form>
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
                            ? `Expires ${formatDateTime(
                                token.expires_at,
                                timeZone,
                              )}`
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

          {isReadyForExport ? (
            <form id="print-report-form" action={reportPath} method="get" target="_blank" className="export-action-tile export-action-link">
              <button className="button-link-reset" disabled={!isReadyForExport}>Preview / Print</button>
            </form>
          ) : (
            <span
              className="export-action-tile export-action-link disabled-action"
              aria-disabled="true"
            >
              <span
                className="export-tile-icon export-tile-icon-print"
                aria-hidden="true"
              >
                ⎙
              </span>
              Preview / Print
            </span>
          )}

          <details
            className="export-action-tile"
            aria-disabled={!isReadyForExport}
          >
            <summary>
              <span
                className="export-tile-icon export-tile-icon-save"
                aria-hidden="true"
              >
                ▤
              </span>
              <strong>Save in CRED</strong>
            </summary>
            <form
              id="save-report-form"
              action={saveAction}
              className="form-stack export-action-details"
            >
              <p className="muted">Keep a saved copy of this report.</p><label className="field-stack"><span className="label">Report Template</span><select name="report_template_id" className="input" defaultValue="workspace-default"><option value="workspace-default">Workspace default</option>{reportTemplates.map(t=><option key={t.id} value={t.id}>{t.name}{t.is_default?' — default':''}</option>)}<option value="system">System default</option></select></label>
              <PendingActionButton
                className="button button-secondary touch-target"
                disabled={!isReadyForExport}
                pendingLabel="Saving…"
              >
                Save in CRED
              </PendingActionButton>
            </form>
          </details>
        </div>

        <p className="muted export-print-note">
          Open the browser-friendly report. Use your browser’s Print or Share
          menu to save as PDF.
        </p>
      </div>
    </details>
  );
}
