import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";

import { requireActiveBillingAccess } from "@/features/billing";
import {
  FIELD_SERVICE_FIELD_LABELS,
  FIELD_SERVICE_SECTIONS,
  getFieldServiceBoolean,
  getFieldServiceText,
  isFieldServiceSessionType,
  normalizeFieldServiceDetails,
} from "@/features/field-service";
import { buildUniversalReportDocument } from "@/features/reports/report-document";
import {
  buildCustomerAssetRows,
  buildNormalizedReportModel,
  classifyReferenceDocumentTitle,
  dedupeEvidenceDetails,
  deriveFormSectionsFromCaptures,
  getFormStructureSummary,
  getNormalizedFindingModels,
  getNormalizedRecommendedActions,
  isMeaningfulCustomerReportText,
  normalizeDraftSections,
  shouldRenderDetail,
  splitRecommendationText,
  stripConfidenceText,
  sanitizeCapturesForImageAiAssist,
} from "@/features/reports/report-structure";
import {
  getDisplayReportTitle,
  getReportInfoValue,
} from "@/features/reports/report-title";
import { normalizeReportType } from "@/features/sessions/report-types";
import {
  asDiagnosticRecordArray,
  getDiagnosticProcedureProgress,
  getDiagnosticStepCompleteness,
} from "@/features/diagnostic-procedures/progress";
import { requireSessionWorkspace } from "@/features/sessions/data";
import { recordUsageEvent } from "@/features/usage";
import {
  formatDateInTimeZone,
  formatDateTimeInTimeZone,
} from "@/lib/date-format";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ReportCapture = Database["public"]["Tables"]["capture_items"]["Row"];
type ReportSignature =
  Database["public"]["Tables"]["signature_captures"]["Row"];
type ReportDraft = Database["public"]["Tables"]["ai_report_drafts"]["Row"];
type ReportDraftSection =
  Database["public"]["Tables"]["ai_report_draft_sections"]["Row"];
type ReportSession =
  Database["public"]["Tables"]["documentation_sessions"]["Row"] & {
    organizations: { name: string } | null;
  };

type ExportImageAsset = {
  classification: "webSafeImage" | "nonWebSafeImage";
  mediaUrl?: string;
  originalMediaUrl?: string;
  reason?: string;
};

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function customerText(value: unknown) {
  return stripConfidenceText(String(value ?? ""))
    .replace(/Capture ID\s*:?\s*/gi, "Evidence ")
    .replace(UUID_PATTERN, "evidence item");
}

function escapeHtml(value: unknown) {
  return customerText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanReportTitle(
  preferred: string | null | undefined,
  session: ReportSession,
  draft: ReportDraft | null | undefined,
  genericFallback = false,
) {
  return getDisplayReportTitle(
    preferred ? { ...draft, title: preferred } : draft,
    session,
    { genericFallback },
  );
}

function escapeRawHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isHiddenFromReport(metadata: Json) {
  return isRecord(metadata) && metadata.hidden_from_report === true;
}

function getApprovalDate(draft: ReportDraft | null | undefined, session: ReportSession) {
  return draft?.approved_at ?? session.reviewed_at ?? null;
}

function getOrganizationDisplayName(organizationName: string, companyProfile?: { company_name?: string | null; facility_name?: string | null } | null) {
  return companyProfile?.company_name || companyProfile?.facility_name || organizationName;
}

function getCoverImageHtml(captures: ReportCapture[], imageAssets: Record<string, ExportImageAsset>) {
  const coverCapture = captures.find((capture) => isImageEvidence(capture) && imageAssets[capture.id]?.classification === "webSafeImage" && imageAssets[capture.id]?.mediaUrl);
  if (!coverCapture) return "";
  return `<div class="cover-image">${renderExportImage(imageAssets[coverCapture.id], getPrimaryEvidenceLabel(coverCapture), "Preview unavailable in printable export. Original evidence retained.")}</div>`;
}

function buildReportCoverHtml(params: {
  reportTitle: string;
  reportType: string;
  session: ReportSession;
  draft: ReportDraft | null;
  organizationName: string;
  companyProfile?: { company_name?: string | null; facility_name?: string | null } | null;
  captures: ReportCapture[];
  imageAssets: Record<string, ExportImageAsset>;
  timeZone: string | null;
}) {
  const approvedAt = getApprovalDate(params.draft, params.session);
  const rows = [
    { label: "Report type", value: params.reportType },
    { label: "Customer / Client", value: getReportInfoValue(params.draft, params.session, "customer_client") || params.session.customer_name || "" },
    { label: "Subject", value: getReportInfoValue(params.draft, params.session, "subject_name") || params.session.title || "" },
    { label: "Asset / Equipment", value: getReportInfoValue(params.draft, params.session, "asset_equipment") || params.session.asset_label || params.session.unit_number || "" },
    { label: "Location", value: getReportInfoValue(params.draft, params.session, "location") },
    { label: "Capture session date", value: formatDateTimeInTimeZone(params.session.created_at, params.timeZone) },
    { label: "Approved date", value: approvedAt ? formatDateTimeInTimeZone(approvedAt, params.timeZone) : "" },
    { label: "Organization", value: getOrganizationDisplayName(params.organizationName, params.companyProfile) },
  ];
  return `<section class="report-cover item"><div class="cover-copy"><p class="eyebrow">Professional Evidence Report</p><h1>${escapeHtml(params.reportTitle)}</h1><p class="cover-trust">CRED assembles user-provided evidence and approved report text. Users remain the source of truth.</p>${renderDefinitionRows(rows)}</div>${getCoverImageHtml(params.captures, params.imageAssets)}</section>`;
}

function buildReportOverviewHtml(params: {
  capturedCount: number;
  includedCount: number;
  finalNotesIncluded: boolean;
  approved: boolean;
  preparedBy: string;
  organization: string;
}) {
  return `<section class="item service-section overview-section"><h2>Executive Report Overview</h2><p class="muted">CRED assembles user-provided evidence and approved report text. Users remain the source of truth.</p>${renderDefinitionRows([
    { label: "Evidence items captured", value: String(params.capturedCount) },
    { label: "Included evidence items", value: String(params.includedCount) },
    { label: "Final notes included", value: params.finalNotesIncluded ? "Yes" : "No" },
    { label: "Report approved", value: params.approved ? "Yes" : "No" },
    { label: "Prepared by", value: params.preparedBy },
    { label: "Organization", value: params.organization },
  ])}</section>`;
}

function buildEvidenceGalleryHtml(captures: ReportCapture[], imageAssets: Record<string, ExportImageAsset>, timeZone: string | null) {
  const images = captures.filter(isImageEvidence);
  if (!images.length) return "";
  const reportDocument = buildUniversalReportDocument({ captures, timeZone });
  const evidenceByCaptureId = new Map(reportDocument.evidenceItems.map((item) => [item.sourceCaptureId, item]));
  return `<section class="item service-section gallery-section"><h2>Captured Evidence Gallery</h2><p class="muted">Compact visual scan of included image evidence.</p><div class="gallery-grid">${images.map((capture) => {
    const meta = evidenceByCaptureId.get(capture.id);
    const evidenceId = meta?.evidenceId ?? "Evidence";
    const label = getPrimaryEvidenceLabel(capture);
    const captured = meta?.capturedAtLabel ?? formatDateTimeInTimeZone(capture.captured_at, timeZone);
    const media = renderExportImage(imageAssets[capture.id], label, "Preview unavailable in printable export. Original evidence retained.");
    return `<article class="gallery-card"><div class="gallery-thumb">${media}</div><div class="gallery-caption"><h3>${escapeHtml(`${evidenceId} · ${label}`)}</h3><p>${escapeHtml(captured)}</p></div></article>`;
  }).join("")}</div></section>`;
}

function buildApprovalHtml(params: { profile: { full_name?: string | null; inspector_role_or_title?: string | null } | null; signatures: ReportSignature[]; signatureUrls: Record<string, string>; draft: ReportDraft | null; session: ReportSession; timeZone: string | null }) {
  const signature = params.signatures.find((item) => /inspector|technician/i.test(item.signature_type)) ?? params.signatures[0];
  const signatureUrl = signature ? params.signatureUrls[signature.id] : params.signatureUrls.__default_signature;
  const approvedAt = getApprovalDate(params.draft, params.session) ?? signature?.signed_at ?? null;
  const rows = [
    { label: "Approved by", value: signature?.signer_name || params.profile?.full_name || "" },
    { label: "Role / Title", value: params.profile?.inspector_role_or_title || signature?.signature_type?.replace(/_/g, " ") || "" },
    { label: "Approved date / time", value: approvedAt ? formatDateTimeInTimeZone(approvedAt, params.timeZone) : "" },
  ];
  const sig = signatureUrl ? `<div class="signature-block approval-signature"><img class="signature-image" src="${escapeHtml(signatureUrl)}" alt="Approval signature" /></div>` : '<div class="signature-block signature-empty"><p class="muted">No signature captured</p></div>';
  return `<section class="item service-section approval-section"><h2>Signature / Approval</h2>${renderDefinitionRows(rows)}${sig}</section>`;
}

function buildFinalNotesHtml(
  session: Pick<ReportSession, "final_notes" | "include_final_notes_in_export">,
) {
  const notes = session.include_final_notes_in_export
    ? (session.final_notes ?? "")
    : "";
  if (!notes) return "";
  return `<section class="item service-section"><h2>Final Summary / Report Notes</h2><p>${escapeRawHtml(notes).replace(/\n/g, "<br />")}</p></section>`;
}

function getCaptureFilename(capture: ReportCapture) {
  const path = capture.storage_path ?? capture.thumbnail_path;
  if (!path) return "";
  return path.split("/").filter(Boolean).at(-1) ?? "";
}

function getEvidenceKind(capture: ReportCapture) {
  const isImageFile = Boolean(
    capture.storage_path?.match(/\.(jpg|jpeg|png|webp|gif|heic)$/i),
  );
  if (capture.type === "text_note" || capture.media_kind === "note")
    return "note";
  if (isImageFile || capture.media_kind === "image" || capture.type === "photo")
    return "image";
  if (capture.media_kind === "video" || capture.type === "video")
    return "video";
  if (capture.media_kind === "audio" || capture.type === "voice_note")
    return "audio";
  if (capture.media_kind === "document") return "document";
  return "file";
}

function isImageEvidence(capture: ReportCapture) {
  return getEvidenceKind(capture) === "image";
}

function getPrimaryEvidenceDescription(capture: ReportCapture) {
  return (
    capture.technician_note?.trim() ||
    capture.transcript?.trim() ||
    (capture.type === "text_note" ? capture.technician_note?.trim() : "") ||
    getCaptureFilename(capture) ||
    getEvidenceKind(capture)
  );
}

function getPrimaryEvidenceLabel(capture: ReportCapture) {
  const caption = capture.technician_note?.trim() || capture.transcript?.trim();
  return caption || getEvidenceTitle(capture);
}

function getUploadMimeType(capture: ReportCapture) {
  if (!isRecord(capture.extracted_data)) return "";
  const upload = capture.extracted_data.upload;
  if (!isRecord(upload)) return "";
  return typeof upload.mime_type === "string" ? upload.mime_type.toLowerCase() : "";
}

function getImageExtension(capture: ReportCapture) {
  const source = capture.storage_path || capture.thumbnail_path || getCaptureFilename(capture);
  const match = source.match(/\.([a-z0-9]+)(?:[?#].*)?$/i);
  return match?.[1]?.toLowerCase() ?? "";
}

function classifyExportImage(capture: ReportCapture): ExportImageAsset["classification"] {
  const mimeType = getUploadMimeType(capture);
  const extension = getImageExtension(capture);
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(extension) || ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"].includes(mimeType)) return "webSafeImage";
  return "nonWebSafeImage";
}

function renderExportImage(asset: ExportImageAsset | undefined, alt: string, fallbackText: string) {
  const originalLink = asset?.originalMediaUrl ? `<p class="original-link"><a href="${escapeHtml(asset.originalMediaUrl)}" target="_blank" rel="noreferrer">Open original evidence</a></p>` : "";
  const fallback = `<div class="media-fallback export-image-fallback">${escapeHtml(fallbackText)}${originalLink}</div>`;
  if (asset?.classification === "webSafeImage" && asset.mediaUrl) {
    return `<img src="${escapeHtml(asset.mediaUrl)}" alt="${escapeHtml(alt)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />${fallback.replace('<div class="media-fallback export-image-fallback">', '<div class="media-fallback export-image-fallback" style="display:none">')}`;
  }
  return fallback;
}

function appendMediaQuery(path: string, shareToken: string | null, download = false) {
  const params = new URLSearchParams();
  if (shareToken) params.set("share_token", shareToken);
  if (download) params.set("download", "1");
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function buildCaptureMediaUrl(sessionId: string, captureId: string, shareToken: string | null, download = false) {
  return appendMediaQuery(
    `/api/dashboard/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(captureId)}/media`,
    shareToken,
    download,
  );
}

function buildSignatureMediaUrl(sessionId: string, signatureId: string, shareToken: string | null) {
  return appendMediaQuery(
    `/api/dashboard/sessions/${encodeURIComponent(sessionId)}/signatures/${encodeURIComponent(signatureId)}/media`,
    shareToken,
  );
}

function buildCaptureImageUrls(
  sessionId: string,
  captures: ReportCapture[],
  shareToken: string | null,
) {
  const imageAssets: Record<string, ExportImageAsset> = {};
  for (const capture of captures) {
    const classification = isImageEvidence(capture)
      ? classifyExportImage(capture)
      : "nonWebSafeImage";
    if (!capture.storage_path) {
      if (isImageEvidence(capture)) {
        console.warn("[report-export-image-media-route]", {
          session_id: sessionId,
          capture_id: capture.id,
          has_storage_path: false,
          error: "Missing storage_path for image evidence",
        });
      }
      imageAssets[capture.id] = { classification, reason: "missing_storage_path" };
      continue;
    }

    const mediaUrl = buildCaptureMediaUrl(sessionId, capture.id, shareToken);
    const originalMediaUrl = buildCaptureMediaUrl(sessionId, capture.id, shareToken, true);
    imageAssets[capture.id] = classification === "webSafeImage"
      ? { classification, mediaUrl, originalMediaUrl }
      : {
          classification,
          originalMediaUrl,
          reason: `${getUploadMimeType(capture) || getImageExtension(capture) || "unknown"} is not browser/export safe`,
        };
  }
  return imageAssets;
}

function buildSignatureUrls(
  sessionId: string,
  signatures: ReportSignature[],
  reportProfile:
    | {
        default_signature_path?: string | null;
        use_default_signature?: boolean | null;
      }
    | null
    | undefined,
  shareToken: string | null,
) {
  const signatureUrls: Record<string, string> = {};
  for (const signature of signatures) {
    if (!signature.signature_image_path) continue;
    signatureUrls[signature.id] = buildSignatureMediaUrl(sessionId, signature.id, shareToken);
  }
  if (
    (signatures.length === 0 ||
      !signatures.some((signature) =>
        /inspector|technician/i.test(signature.signature_type),
      )) &&
    reportProfile?.use_default_signature &&
    reportProfile.default_signature_path
  ) {
    signatureUrls.__default_signature = buildSignatureMediaUrl(sessionId, "__default_signature", shareToken);
  }
  return signatureUrls;
}

function getAppendixCaptures(captures: ReportCapture[]) {
  const byId = new Map<string, ReportCapture>();
  const duplicateCaptureIds: string[] = [];
  for (const capture of captures) {
    if (byId.has(capture.id)) {
      duplicateCaptureIds.push(capture.id);
      continue;
    }
    byId.set(capture.id, capture);
  }
  return {
    captures: Array.from(byId.values()).sort(
      (left, right) =>
        new Date(left.created_at).getTime() -
        new Date(right.created_at).getTime(),
    ),
    duplicateCaptureIds: Array.from(new Set(duplicateCaptureIds)),
  };
}

function logExportIntegrity(params: {
  session: ReportSession;
  includedCaptures: ReportCapture[];
  appendixCaptures: ReportCapture[];
  duplicateCaptureIds: string[];
  finalNotesSource: "documentation_sessions.final_notes" | "other";
}) {
  const finalNotesLength = params.session.include_final_notes_in_export
    ? (params.session.final_notes ?? "").length
    : 0;
  const integrity = {
    session_id: params.session.id,
    included_capture_count: params.includedCaptures.length,
    appendix_unique_capture_count: params.appendixCaptures.length,
    duplicate_capture_ids: params.duplicateCaptureIds,
    final_notes_length: finalNotesLength,
    final_notes_source: params.finalNotesSource,
  };
  if (
    integrity.appendix_unique_capture_count !==
      integrity.included_capture_count ||
    integrity.duplicate_capture_ids.length > 0 ||
    integrity.final_notes_source !== "documentation_sessions.final_notes"
  ) {
    console.warn("[report-export-integrity]", integrity);
  }
}

function getDetailValue(details: Record<string, unknown>, fieldName: string) {
  const field = FIELD_SERVICE_SECTIONS.flatMap(
    (section) => section.fields,
  ).find((item) => item.name === fieldName);
  if (field?.type === "checkbox") {
    return getFieldServiceBoolean(details, fieldName) ? "Yes" : "No";
  }
  return getFieldServiceText(details, fieldName);
}

function getProfessionalRows(rows: Array<{ label: string; value: string }>) {
  const visibleRows = rows.filter((row) => row.value.trim());
  const captured = visibleRows.filter(
    (row) => !/^(not captured|pending|unknown)$/i.test(row.value.trim()),
  );
  return captured.length > 0 ? captured : visibleRows.slice(0, 4);
}

function renderReportInformationHtml(
  draft: ReportDraft | null | undefined,
  session: ReportSession,
  timeZone?: string | null,
) {
  const rows = [
    {
      label: "Capture Session Date",
      value: formatDateTimeInTimeZone(session.created_at, timeZone),
    },
    {
      label: "Last Updated",
      value: formatDateTimeInTimeZone(
        session.updated_at ?? session.created_at,
        timeZone,
      ),
    },
    {
      label: "Report Approved Date",
      value: draft?.approved_at
        ? formatDateTimeInTimeZone(draft.approved_at, timeZone)
        : session.reviewed_at
          ? formatDateTimeInTimeZone(session.reviewed_at, timeZone)
          : "",
    },
    {
      label: "Report Title",
      value: cleanReportTitle(draft?.title || session.title, session, draft),
    },
    {
      label: "Subject Name",
      value: getReportInfoValue(draft, session, "subject_name"),
    },
    {
      label: "Customer / Client",
      value:
        getReportInfoValue(draft, session, "customer_client") ||
        session.customer_name ||
        "",
    },
    {
      label: "Asset / Equipment",
      value:
        getReportInfoValue(draft, session, "asset_equipment") ||
        session.asset_label ||
        "",
    },
    {
      label: "Location",
      value: getReportInfoValue(draft, session, "location"),
    },
    {
      label: "Reference Number",
      value: getReportInfoValue(draft, session, "reference_number"),
    },
  ];
  const html = renderDefinitionRows(rows);
  return html
    ? `<section class="item service-section"><h2>Report Information</h2>${html}</section>`
    : "";
}

function buildStructuredFormDataHtml(reportStructure: Json | null) {
  const structure = isRecord(reportStructure) ? reportStructure : {};
  const blueprint = isRecord(structure.form_blueprint)
    ? structure.form_blueprint
    : null;
  if (!blueprint) return "";
  const sections = Array.isArray(blueprint.sections) ? blueprint.sections : [];
  const fields = Array.isArray(blueprint.fields) ? blueprint.fields : [];
  const mappings = Array.isArray(structure.evidence_field_mappings)
    ? structure.evidence_field_mappings
    : [];
  const confidence =
    typeof blueprint.confidence === "number" ? blueprint.confidence : null;
  const classification =
    typeof blueprint.classification === "string" &&
    confidence !== null &&
    confidence >= 0.7
      ? blueprint.classification.replace(/_/g, " ")
      : "Optional layout reference";
  const sectionRows = sections.slice(0, 12).flatMap((section) => {
    if (!isRecord(section)) return [];
    const sectionId = typeof section.id === "string" ? section.id : "";
    const title =
      typeof section.title === "string" ? section.title : "Form section";
    const count = fields.filter(
      (field) => isRecord(field) && field.section_id === sectionId,
    ).length;
    return [{ label: title, value: `${count} fields` }];
  });
  return `<section class="item service-section"><h2>Structured Form Data</h2><p class="muted">Optional uploaded form/report blueprint is used only as a layout reference when confidence is sufficient; otherwise the universal professional evidence report is used (${escapeHtml(classification)}). Evidence mappings reference user-provided captures and notes only.</p>${renderDefinitionRows([...sectionRows, { label: "Evidence-field mappings", value: String(mappings.length) }])}</section>`;
}

function renderDefinitionRows(rows: Array<{ label: string; value: string }>) {
  const visibleRows = getProfessionalRows(rows);
  if (visibleRows.length === 0) return "";
  return `<dl>${visibleRows.map((row) => `<div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`).join("")}</dl>`;
}

function renderFieldServiceSection(
  details: Record<string, unknown>,
  sectionKey: string,
) {
  const section = FIELD_SERVICE_SECTIONS.find(
    (item) => item.key === sectionKey,
  );
  if (!section) return "";
  const rows = section.fields.map((field) => ({
    label: field.label,
    value: getDetailValue(details, field.name),
  }));
  return `<section class="item service-section"><h2>${escapeHtml(section.title)}</h2>${renderDefinitionRows(rows)}</section>`;
}

function buildInspectorFacilityHtml(
  profile: {
    full_name?: string | null;
    inspector_role_or_title?: string | null;
    technician_license_number?: string | null;
    inspector_email?: string | null;
    inspector_phone?: string | null;
  } | null,
  companyProfile: {
    company_name?: string | null;
    facility_name?: string | null;
    facility_number?: string | null;
    facility_address_line_1?: string | null;
    facility_address_line_2?: string | null;
    facility_city?: string | null;
    facility_region?: string | null;
    facility_postal_code?: string | null;
    facility_country?: string | null;
    facility_phone?: string | null;
    facility_email?: string | null;
    permit_number?: string | null;
    certification_number?: string | null;
  } | null
) {
  const address = [
    companyProfile?.facility_address_line_1,
    companyProfile?.facility_address_line_2,
    companyProfile?.facility_city,
    companyProfile?.facility_region,
    companyProfile?.facility_postal_code,
    companyProfile?.facility_country,
  ].filter(Boolean).join(", ");
  const rows = [
    { label: "Inspector", value: profile?.full_name ?? "" },
    { label: "Role / Title", value: profile?.inspector_role_or_title ?? "" },
    { label: "Organization", value: companyProfile?.company_name ?? companyProfile?.facility_name ?? "" },
    { label: "Facility Number", value: companyProfile?.facility_number ?? "" },
    { label: "Address", value: address },
    { label: "Email", value: profile?.inspector_email ?? companyProfile?.facility_email ?? "" },
    { label: "Phone", value: profile?.inspector_phone ?? companyProfile?.facility_phone ?? "" },
    { label: "Licence Number", value: profile?.technician_license_number ?? "" },
    { label: "Permit Number", value: companyProfile?.permit_number ?? "" },
    { label: "Certification Number", value: companyProfile?.certification_number ?? "" },
  ];
  const rowsHtml = renderDefinitionRows(rows);
  return rowsHtml ? `<section class="item service-section org-section"><h2>Inspector / Organization Details</h2>${rowsHtml}</section>` : "";
}

function getEvidenceTitle(capture: ReportCapture) {
  const referenceTitle = classifyReferenceDocumentTitle(capture);
  if (
    referenceTitle !== "Reference Document" ||
    capture.media_kind === "document"
  )
    return referenceTitle;
  if (capture.type === "text_note" || capture.media_kind === "note")
    return "Technician Note";
  if (capture.media_kind === "audio" || capture.type === "voice_note")
    return "Voice Note";
  if (capture.media_kind === "image" || capture.type === "photo")
    return "Evidence Photo";
  return "Supporting Evidence";
}

function renderTextList(
  title: string,
  values: string[],
  existingRenderedText: string[],
) {
  const visible = values.filter((value) =>
    shouldRenderDetail(title, value, existingRenderedText),
  );
  visible.forEach((value) => existingRenderedText.push(value));
  if (visible.length === 0) return "";
  return `<section class="finding"><h3>${escapeHtml(title)}</h3>${visible.map((value) => `<p>${escapeHtml(value)}</p>`).join("")}</section>`;
}

function buildFindingCardsHtml(
  items: ReturnType<
    typeof buildNormalizedReportModel<ReportCapture>
  >["findings"],
  imageAssets: Record<string, ExportImageAsset>,
  options: { renderImages?: boolean } = {},
) {
  const findings = getNormalizedFindingModels(items);
  if (findings.length === 0) return "";
  return `<section class="item service-section"><h2>Technician-Authored Findings</h2>${findings
    .map((finding, index) => {
      const capture = finding.entry.capture;
      const imageAsset = imageAssets[capture.id];
      const isImageFile = Boolean(
        capture.storage_path?.match(/\.(jpg|jpeg|png|webp|gif|heic)$/i),
      );
      const shouldRenderImage =
        options.renderImages !== false &&
        imageAsset?.classification === "webSafeImage" &&
        imageAsset.mediaUrl &&
        (capture.media_kind === "image" ||
          capture.type === "photo" ||
          isImageFile);
      const imageHtml = shouldRenderImage
        ? `<div class="finding-image">${renderExportImage(imageAsset, `${finding.title} evidence image`, "Preview unavailable in printable export. Original evidence retained.")}</div>`
        : "";
      const details = finding.details.filter(
        (detail) =>
          !finding.observations.some((observation) =>
            observation.includes(detail.value),
          ),
      );
      return `<article class="finding-card">${imageHtml}<div class="finding-content"><p class="eyebrow">Finding ${index + 1}</p><h3>${escapeHtml(finding.title)}</h3><h4>Technician / Verified Condition</h4>${finding.observations.length ? finding.observations.map((item) => `<p>${escapeHtml(item)}</p>`).join("") : '<p class="muted">Condition documented in supporting evidence.</p>'}${details.length ? `<h4>Key Details</h4>${renderDefinitionRows(details.map((detail) => ({ label: detail.label, value: detail.value })))}` : ""}<h4>User-entered Recommendation</h4>${finding.recommendations.length ? `<ul>${finding.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : '<p class="muted">No user-entered recommendation captured.</p>'}</div></article>`;
    })
    .join("")}</section>`;
}

function buildRecommendedActionsHtml(
  findings: ReturnType<typeof getNormalizedFindingModels<ReportCapture>>,
) {
  const actions = getNormalizedRecommendedActions(findings);
  if (!actions.length) return "";
  return `<section class="item service-section"><h2>Recommendations (User-entered)</h2><table><thead><tr><th>Priority</th><th>Action</th></tr></thead><tbody>${actions.map((item) => `<tr><td>${escapeHtml(item.priority)}</td><td>${escapeHtml(item.action)}</td></tr>`).join("")}</tbody></table></section>`;
}

function buildReferenceDocumentsHtml(
  items: ReturnType<
    typeof buildNormalizedReportModel<ReportCapture>
  >["findings"],
  imageAssets: Record<string, ExportImageAsset>,
  options: { includeOriginal?: boolean } = {},
) {
  if (!items.length) return "";
  return `<section class="item service-section"><h2>Reference Documents</h2>${items
    .map((entry) => {
      const details = dedupeEvidenceDetails(entry.group.details).filter(
        (detail) => isMeaningfulCustomerReportText(detail.value),
      );
      const originalHtml =
        options.includeOriginal === false
          ? ""
          : `<details><summary>View Original Reference</summary>${buildEvidenceItemsHtml([entry], imageAssets)}</details>`;
      return `<article class="reference-card"><h3>${escapeHtml(getEvidenceTitle(entry.capture))}</h3>${details.length ? renderDefinitionRows(details.map((detail) => ({ label: detail.label, value: detail.value }))) : '<p class="muted">Reference captured for report support.</p>'}${originalHtml}</article>`;
    })
    .join("")}</section>`;
}

function buildEvidenceItemsHtml(
  items: ReturnType<
    typeof buildNormalizedReportModel<ReportCapture>
  >["findings"],
  imageAssets: Record<string, ExportImageAsset>,
) {
  return items
    .map((entry) => {
      const capture = entry.capture;
      const imageAsset = imageAssets[capture.id];
      const isImageFile = Boolean(
        capture.storage_path?.match(/\.(jpg|jpeg|png|webp|gif|heic)$/i),
      );
      const mediaKind = isImageFile
        ? "image"
        : capture.media_kind ||
          (capture.type === "text_note"
            ? "note"
            : capture.type === "video"
              ? "video"
              : "image");
      const evidenceTitle = getEvidenceTitle(capture);
      const title = evidenceTitle;
      const mediaHtml =
        mediaKind === "note"
          ? `<div class="video-still">${escapeHtml(stripConfidenceText(capture.technician_note || capture.transcript || "Technician Note"))}</div>`
          : mediaKind === "image"
            ? renderExportImage(imageAsset, getPrimaryEvidenceLabel(capture), "Preview unavailable in printable export. Original evidence retained.")
            : imageAsset?.originalMediaUrl && mediaKind === "video"
              ? `<div class="video-still">Video reference</div><p class="video-link"><a href="${escapeHtml(imageAsset.originalMediaUrl)}">Open video evidence</a></p>`
              : imageAsset?.originalMediaUrl
                ? `<p><a href="${escapeHtml(imageAsset.originalMediaUrl)}">Open saved file</a></p>`
                : mediaKind === "audio"
                  ? '<div class="video-still">Voice Note</div>'
                  : mediaKind === "image"
                    ? '<div class="media-fallback">Image unavailable in printable export.</div>'
                    : `<div class="media-fallback">Saved evidence file unavailable for export.</div>`;
      const group = entry.group;
      const renderedText: string[] = [];
      const details = dedupeEvidenceDetails(group.details).filter((detail) =>
        shouldRenderDetail(detail.label, detail.value, renderedText),
      );
      details.forEach((detail) => renderedText.push(detail.value));
      const detailsHtml = details.length
        ? `<section class="finding"><h3>Details</h3>${renderDefinitionRows(details.map((detail) => ({ label: detail.label, value: detail.value })))}</section>`
        : "";
      const findingsHtml = renderTextList(
        "Observed condition",
        group.findings,
        renderedText,
      );
      const recs = group.recommendations
        .flatMap(splitRecommendationText)
        .filter((value) =>
          shouldRenderDetail("Recommendation", value, renderedText),
        );
      recs.forEach((value) => renderedText.push(value));
      const recommendationsHtml = recs.length
        ? `<section class="finding"><h3>Recommendations</h3><ul>${recs.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></section>`
        : "";
      return `<article class="item">
      <h2>${escapeHtml(title)}</h2>
      <div class="media">${mediaHtml}</div>
      ${detailsHtml}${findingsHtml}${recommendationsHtml}
    </article>`;
    })
    .join("");
}

function buildEvidenceSectionHtml(
  title: string,
  items: ReturnType<
    typeof buildNormalizedReportModel<ReportCapture>
  >["findings"],
  imageAssets: Record<string, ExportImageAsset>,
) {
  if (items.length === 0) return "";
  return `<section class="item service-section"><h2>${escapeHtml(title)}</h2><div class="evidence-children">${buildEvidenceItemsHtml(items, imageAssets)}</div></section>`;
}

function buildEvidenceAppendixHtml(
  captures: ReportCapture[],
  imageAssets: Record<string, ExportImageAsset>,
  timeZone: string | null,
  options: { showDebugDetails?: boolean; renderImages?: boolean } = {},
) {
  if (captures.length === 0)
    return '<section class="item service-section"><h2>Evidence Appendix</h2><p class="muted">No included evidence selected for this report.</p></section>';
  const reportDocument = buildUniversalReportDocument({ captures, timeZone });
  const evidenceByCaptureId = new Map(
    reportDocument.evidenceItems.map((item) => [item.sourceCaptureId, item]),
  );
  return `<section class="item service-section"><h2>Evidence Appendix</h2><p class="muted">Included captures are listed once from the reviewed report state.</p><div class="evidence-grid">${captures
    .map((capture) => {
      const imageAsset = imageAssets[capture.id];
      const mediaKind = getEvidenceKind(capture);
      const evidenceMeta = evidenceByCaptureId.get(capture.id);
      const primaryNote =
        evidenceMeta?.note ||
        getPrimaryEvidenceDescription(capture) ||
        "No technician note provided.";
      const itemLabel = getPrimaryEvidenceLabel(capture);
      const mediaHtml =
        options.renderImages !== false && mediaKind === "image"
          ? renderExportImage(imageAsset, itemLabel, "Preview unavailable in printable export. Original evidence retained.")
          : imageAsset?.originalMediaUrl
            ? `<p><a href="${escapeHtml(imageAsset.originalMediaUrl)}">Open original evidence</a></p>`
            : mediaKind === "image"
              ? '<div class="media-fallback">Image unavailable in printable export.</div>'
              : `<div class="media-fallback">${escapeHtml(getEvidenceTitle(capture))}</div>`;
      const technicianFields = isRecord(capture.extracted_data)
        ? capture.extracted_data
        : {};
      const technicianPills = [
        typeof technicianFields.technician_status === "string"
          ? technicianFields.technician_status
          : null,
        typeof technicianFields.technician_category === "string"
          ? technicianFields.technician_category
          : null,
      ].filter((value): value is string => Boolean(value?.trim()));
      const neutralPills = [
        evidenceMeta?.evidenceType ?? getEvidenceTitle(capture),
        "Included",
      ];
      const pillsHtml = `<div class="evidence-pill-row">${[...technicianPills, ...neutralPills].map((pill) => `<span class="evidence-pill">${escapeHtml(pill.replace(/_/g, " "))}</span>`).join("")}</div>`;
      const detailRows = [
        { label: "Evidence ID", value: evidenceMeta?.evidenceId ?? "" },
        {
          label: "Captured",
          value:
            evidenceMeta?.capturedAtLabel ??
            formatDateTimeInTimeZone(new Date(capture.captured_at), timeZone),
        },
        {
          label: "Evidence type",
          value: evidenceMeta?.evidenceType ?? mediaKind,
        },
        {
          label: "Source capture ID",
          value: options.showDebugDetails ? capture.id : "",
        },
      ];
      if (options.showDebugDetails)
        detailRows.unshift(
          { label: "Capture ID", value: capture.id },
          {
            label: "Media kind",
            value: String(capture.media_kind ?? mediaKind),
          },
        );
      return `<article class="evidence-card"${options.showDebugDetails ? ` data-capture-id="${escapeHtml(capture.id)}"` : ""}><div class="media evidence-media">${mediaHtml}</div><div class="evidence-copy"><h3>${escapeHtml(`${evidenceMeta?.evidenceId ?? "Evidence"} · ${itemLabel}`)}</h3>${pillsHtml}<p>${escapeHtml(primaryNote)}</p>${renderDefinitionRows(detailRows)}</div></article>`;
    })
    .join("")}</div></section>`;
}

function getDiagnosticProcedureInfo(draft: ReportDraft | null) {
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
        : (draft.title ?? "Diagnostic Procedure Workspace"),
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

function getDiagnosticStepMetadata(section: ReportDraftSection) {
  return isRecord(section.metadata)
    ? (section.metadata as Record<string, unknown>)
    : {};
}

function getDiagnosticEvidenceRole(capture: ReportCapture) {
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

function captureMatchesDiagnosticStep(capture: ReportCapture, stepId: string) {
  return (
    isRecord(capture.extracted_data) &&
    isRecord(capture.extracted_data.diagnostic_step) &&
    capture.extracted_data.diagnostic_step.step_id === stepId
  );
}

function buildDiagnosticProcedureReportHtml(params: {
  session: ReportSession;
  organizationName: string;
  reportDraft: ReportDraft;
  reportSections: ReportDraftSection[];
  captureItems: ReportCapture[];
  signedUrls: Record<string, ExportImageAsset>;
  showToolbar: boolean;
  timeZone: string | null;
}) {
  const info = getDiagnosticProcedureInfo(params.reportDraft);
  const steps = params.reportSections.filter((section) => {
    const metadata = getDiagnosticStepMetadata(section);
    return (
      metadata.section_type === "diagnostic_procedure_step" &&
      metadata.visible !== false
    );
  });
  const progress = getDiagnosticProcedureProgress(steps, params.captureItems);
  const toolbarHtml = params.showToolbar
    ? '<div class="toolbar"><button onclick="window.print()">Print / Save Documentation</button><p class="print-help">Documentation support only. Follow OEM procedure.</p></div>'
    : "";
  const stepHtml = steps
    .map((section) => {
      const metadata = getDiagnosticStepMetadata(section);
      const stepId =
        typeof metadata.step_id === "string"
          ? metadata.step_id
          : section.section_key;
      const readings = asDiagnosticRecordArray(metadata.technician_readings);
      const stepCaptures = params.captureItems.filter((capture) =>
        captureMatchesDiagnosticStep(capture, stepId),
      );
      const completeness = getDiagnosticStepCompleteness(
        section,
        params.captureItems,
      );
      const readingsHtml = readings.length
        ? renderDefinitionRows(
            readings.map((reading, index) => ({
              label: String(reading.label ?? `Reading ${index + 1}`),
              value: `${String(reading.value ?? "")}${reading.unit ? ` ${String(reading.unit)}` : ""}`,
            })),
          )
        : '<p class="muted">No technician readings entered.</p>';
      const evidenceHtml = stepCaptures.length
        ? Array.from(new Set(stepCaptures.map(getDiagnosticEvidenceRole)))
            .map(
              (role) =>
                `<div><p class="muted">${escapeHtml(formatDiagnosticEvidenceRole(role))}</p><ul>${stepCaptures
                  .filter(
                    (capture) => getDiagnosticEvidenceRole(capture) === role,
                  )
                  .map(
                    (capture) =>
                      `<li>${escapeHtml(getEvidenceTitle(capture))}${capture.technician_note ? ` — ${escapeHtml(capture.technician_note)}` : ""}</li>`,
                  )
                  .join("")}</ul></div>`,
            )
            .join("")
        : '<p class="muted">No step evidence attached.</p>';
      return `<section class="item service-section"><h2>${escapeHtml(section.title)}</h2>${typeof metadata.source_page_start === "number" ? `<p class="muted">Source page${typeof metadata.source_page_end === "number" && metadata.source_page_end !== metadata.source_page_start ? `s ${metadata.source_page_start}-${metadata.source_page_end}` : ` ${metadata.source_page_start}`}</p>` : ""}${Array.isArray(metadata.extraction_warnings) && metadata.extraction_warnings.length ? `<p class="notice warning">${escapeHtml(metadata.extraction_warnings.map(String).join("; "))}</p>` : ""}<p><strong>Status:</strong> ${escapeHtml(typeof metadata.technician_status === "string" ? metadata.technician_status.replace(/_/g, " ") : "not tested")}</p><p><strong>Completeness:</strong> ${escapeHtml(completeness.badges.length ? completeness.badges.join(", ") : "Incomplete")}</p>${typeof metadata.technician_selected_branch === "string" && metadata.technician_selected_branch ? `<p><strong>Technician-selected branch:</strong> ${escapeHtml(metadata.technician_selected_branch)}</p>` : ""}<h3>OEM instruction text</h3><p>${escapeHtml(String(metadata.instruction ?? section.body ?? ""))}</p>${typeof metadata.oem_flow_text === "string" && metadata.oem_flow_text ? `<p><strong>OEM flow text:</strong> ${escapeHtml(metadata.oem_flow_text)}</p>` : ""}<h3>Technician-entered readings</h3>${readingsHtml}${typeof metadata.technician_notes === "string" && metadata.technician_notes ? `<h3>Technician notes</h3><p>${escapeHtml(metadata.technician_notes)}</p>` : ""}${typeof metadata.technician_conclusion === "string" && metadata.technician_conclusion ? `<h3>Technician conclusion</h3><p>${escapeHtml(metadata.technician_conclusion)}</p>` : ""}<h3>Attached evidence</h3>${evidenceHtml}</section>`;
    })
    .join("");
  const appendixHtml = buildEvidenceAppendixHtml(
    getAppendixCaptures(params.captureItems).captures,
    params.signedUrls,
    params.timeZone,
  );
  const details = [
    { label: "Organization", value: params.organizationName },
    { label: "Session", value: params.session.title },
    {
      label: "Procedure",
      value:
        info?.title ??
        params.reportDraft.title ??
        "Diagnostic Procedure Workspace",
    },
    { label: "Manufacturer", value: info?.manufacturer ?? "" },
    { label: "Document type", value: info?.documentType ?? "" },
    { label: "Source file", value: info?.sourceFile ?? "" },
    {
      label: "Technician sign-off",
      value: info?.signedOff
        ? `Signed by ${info.signOffName ?? "technician"}${info.signedOffAt ? ` at ${formatDateInTimeZone(new Date(info.signedOffAt), params.timeZone)}` : ""}`
        : "Not signed off",
    },
    { label: "Date", value: formatDateInTimeZone(new Date(), params.timeZone) },
  ];
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" /><title>${escapeHtml(info?.title ?? params.session.title)} diagnostic procedure documentation</title><style>${REPORT_STYLES}</style></head><body><main class="report">${toolbarHtml}<header class="header"><p class="eyebrow">Diagnostic Procedure Workspace</p><h1>${escapeHtml(info?.title ?? params.session.title)}</h1><p class="notice info"><strong>Documentation support only.</strong> Follow OEM procedure. Technician owns all conclusions and recommendations. AI does not diagnose, determine root cause, or recommend repair.</p>${info?.signedOff ? `<p class="notice info"><strong>Signed off by ${escapeHtml(info.signOffName ?? "technician")}</strong>${info.signedOffAt ? ` at ${escapeHtml(formatDateInTimeZone(new Date(info.signedOffAt), params.timeZone))}` : ""}. ${escapeHtml(info.signOffStatement ?? "")}</p>` : '<p class="notice warning"><strong>Technician sign-off pending.</strong></p>'}${renderDefinitionRows(details)}</header>${`<section class="item service-section"><h2>Documentation completeness summary</h2>${renderDefinitionRows(
    [
      { label: "Percent complete", value: `${progress.percentComplete}%` },
      { label: "Visible steps", value: String(progress.totalVisibleSteps) },
      { label: "Incomplete steps", value: String(progress.incompleteSteps) },
      { label: "Blocked steps", value: String(progress.blockedSteps) },
      {
        label: "Missing readings/evidence/branches",
        value: String(progress.missingRequiredDocumentationCount),
      },
      { label: "Warnings", value: String(progress.warningCount) },
      {
        label: "Documentation ready",
        value: progress.reportReady ? "Yes" : "No",
      },
    ],
  )}</section>`}${stepHtml || '<section class="item"><h2>No visible procedure steps documented.</h2><p class="notice warning">All extracted steps may be hidden or unavailable.</p></section>'}${appendixHtml}</main></body></html>`;
}

function buildFieldServiceReportHtml({
  session,
  organizationName,
  captureItems,
  signedUrls,
  signatures,
  signatureUrls,
  reportDraft,
  reportSections,
  showToolbar = true,
  timeZone,
}: {
  session: ReportSession;
  organizationName: string;
  captureItems: ReportCapture[];
  signedUrls: Record<string, ExportImageAsset>;
  signatures: ReportSignature[];
  signatureUrls: Record<string, string>;
  reportDraft: ReportDraft | null;
  reportSections: ReportDraftSection[];
  showToolbar?: boolean;
  timeZone: string | null;
}) {
  const details = normalizeFieldServiceDetails(session.field_service_details);
  const headerRows = [
    { label: "Company", value: organizationName },
    {
      label: "Customer",
      value:
        getDetailValue(details, "customer_name") || session.customer_name || "",
    },
    {
      label: "Customer address",
      value: getDetailValue(details, "customer_address"),
    },
    {
      label: "Customer phone",
      value: getDetailValue(details, "customer_phone"),
    },
    {
      label: "Work order #",
      value: getDetailValue(details, "work_order_number"),
    },
    { label: "PO #", value: getDetailValue(details, "purchase_order_number") },
    {
      label: "Unit #",
      value:
        getDetailValue(details, "unit_number") || session.unit_number || "",
    },
    { label: "Licence #", value: getDetailValue(details, "licence_number") },
    {
      label: "Date",
      value: formatDateInTimeZone(session.created_at, timeZone),
    },
    { label: "Job completed", value: getDetailValue(details, "job_completed") },
  ];
  const travelRows = [
    "travel_start_location",
    "travel_end_location",
    "travel_start_odometer",
    "travel_end_odometer",
    "kilometers_traveled",
    "travel_started_at",
    "travel_ended_at",
    "gps_distance_km",
    "gps_distance_source",
  ].map((fieldName) => ({
    label: FIELD_SERVICE_FIELD_LABELS[fieldName] ?? fieldName,
    value: getDetailValue(details, fieldName),
  }));
  const workRows = [
    "complaint",
    "cause_of_failure",
    "correction",
    "technician_notes",
  ].map((fieldName) => ({
    label: FIELD_SERVICE_FIELD_LABELS[fieldName] ?? fieldName,
    value: getDetailValue(details, fieldName),
  }));
  const timeRows = [
    "work_started_at",
    "work_ended_at",
    "travel_time_hours",
    "working_time_hours",
    "overtime_hours",
    "double_time_hours",
    "total_hours",
  ].map((fieldName) => ({
    label: FIELD_SERVICE_FIELD_LABELS[fieldName] ?? fieldName,
    value: getDetailValue(details, fieldName),
  }));
  const chargeRows = [
    "labour_charge",
    "parts_charge",
    "mileage_charge",
    "expenses_charge",
    "misc_charges",
    "subtotal",
    "tax",
    "total",
  ].map((fieldName) => ({
    label: FIELD_SERVICE_FIELD_LABELS[fieldName] ?? fieldName,
    value: getDetailValue(details, fieldName),
  }));
  const reviewDocument = buildNormalizedReportModel({
    captures: captureItems,
    sections: [],
    draftSections: reportSections,
    measurements: reportDraft?.measurements ?? [],
    findings: reportDraft?.findings ?? [],
  });
  const reportTitle = cleanReportTitle(
    reportDraft?.title || session.title,
    session,
    reportDraft,
  );
  const summaryHtml = buildReportOverviewHtml({
    capturedCount: captureItems.length,
    includedCount: captureItems.length,
    finalNotesIncluded: Boolean(session.include_final_notes_in_export && session.final_notes),
    approved: Boolean(getApprovalDate(reportDraft, session)),
    preparedBy: "",
    organization: organizationName,
  });
  const fieldAppendixCaptures = getAppendixCaptures(captureItems).captures;
  const fieldUseGalleryMode = fieldAppendixCaptures.filter(isImageEvidence).length >= 6;
  const appendixHtml = buildEvidenceAppendixHtml(
    fieldAppendixCaptures,
    signedUrls,
    timeZone,
    { renderImages: !fieldUseGalleryMode },
  );
  const findingModels = reviewDocument.findingModels;
  const evidenceHtml = [
    buildFindingCardsHtml(reviewDocument.findings, signedUrls),
    buildRecommendedActionsHtml(findingModels),
    buildReferenceDocumentsHtml(reviewDocument.referenceDocuments, signedUrls),
    buildEvidenceSectionHtml(
      "Additional Notes",
      reviewDocument.additionalNotes.filter((entry) =>
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
      ),
      signedUrls,
    ),
    buildEvidenceSectionHtml(
      "Supporting Evidence",
      reviewDocument.supportingEvidence,
      signedUrls,
    ),
  ].join("");
  const toolbarHtml = showToolbar
    ? '<div class="toolbar"><button onclick="window.print()">Print / Save Report</button><p class="print-help">Use your browser’s Print or Share menu to save a printable report.</p></div>'
    : "";

  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" /><title>${escapeHtml(reportTitle)} printable field service report</title>
  <style>${REPORT_STYLES}</style></head><body><main class="report">${toolbarHtml}${buildReportCoverHtml({ reportTitle, reportType: normalizeReportType(session.session_type), session, draft: reportDraft, organizationName, captures: captureItems, imageAssets: signedUrls, timeZone })}${summaryHtml}<section class="item service-section"><h2>Report Information</h2>${renderDefinitionRows(headerRows)}</section>${renderFieldServiceSection(details, "equipment")}<section class="item service-section"><h2>Travel</h2>${renderDefinitionRows(travelRows)}</section><section class="item service-section"><h2>Work performed</h2>${renderDefinitionRows(workRows)}</section><section class="item service-section"><h2>Evidence</h2><p class="muted">Evidence items reference captured photos, videos, documents, and technician notes.</p></section>${buildFinalNotesHtml(session)}${evidenceHtml}${fieldUseGalleryMode ? buildEvidenceGalleryHtml(captureItems, signedUrls, timeZone) : ""}${appendixHtml}<section class="item service-section"><h2>Time card summary</h2>${renderDefinitionRows(timeRows)}</section><section class="item service-section"><h2>Charges / documentation only</h2>${renderDefinitionRows(chargeRows)}</section>${buildInspectorFacilityHtml(null, null)}${buildApprovalHtml({ profile: null, signatures, signatureUrls, draft: reportDraft, session, timeZone })}</main></body></html>`;
}

// TODO: Replace browser-print image loading with a real PDF asset embedding pipeline for long-term offline report fidelity.
const REPORT_STYLES = `
    :root{color-scheme:light}*{box-sizing:border-box}html{background:#eef2f7}body{font-family:Inter,Arial,Helvetica,sans-serif;background:#eef2f7;color:#18243a;margin:0;padding:36px;line-height:1.45}.report{max-width:1040px;margin:0 auto}.toolbar{align-items:center;background:#13213a;border-radius:16px;color:white;display:flex;justify-content:space-between;margin:0 0 18px;padding:14px 16px}.toolbar button{background:white;border:0;border-radius:999px;color:#13213a;cursor:pointer;font-weight:800;padding:10px 16px}.print-help{color:#dbe7ff;font-size:13px;margin:0}.header,.item{background:white;border:1px solid #d9e2ee;border-radius:20px;box-shadow:0 16px 45px rgba(24,36,58,.08);margin-bottom:20px;padding:28px}.report-cover{display:grid;gap:24px;grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr);overflow:hidden;padding:0}.cover-copy{padding:34px}.cover-copy h1{font-size:40px;letter-spacing:-.035em;line-height:1.05;margin:10px 0 12px}.cover-trust{border-left:4px solid #155dfc;color:#4c5d75;margin:18px 0;padding-left:14px}.cover-image{background:#f7f9fc;min-height:100%;overflow:hidden}.cover-image img{display:block;height:100%;max-height:520px;object-fit:cover;width:100%}.eyebrow{color:#155dfc;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.meta,.muted{color:#62728a}.service-section h2{border-bottom:1px solid #e3eaf3;font-size:22px;letter-spacing:-.02em;margin-top:0;padding-bottom:10px}dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0 0}dl div{background:#f8fafc;border:1px solid #e2e9f2;border-radius:13px;padding:10px 12px}dt{color:#5a6a81;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}dd{font-weight:750;margin:4px 0 0;overflow-wrap:anywhere}a,a:visited{color:#18243a;text-decoration:none}.media{position:relative;border-radius:14px;overflow:hidden;background:#f8fafc;border:1px solid #d8e2ef}.media img{display:block;width:100%;max-height:520px;object-fit:contain;background:white}.media-fallback{align-items:center;aspect-ratio:4/3;background:#f8fafc;border:1px dashed #cbd6e5;color:#697890;display:flex;font-size:14px;font-weight:800;justify-content:center;padding:18px;text-align:center}.video-still{align-items:center;aspect-ratio:16/9;background:#eef4ff;color:#13213a;display:flex;font-size:18px;font-weight:800;justify-content:center;padding:16px;text-align:center}.finding{margin-top:14px}.finding-card,.reference-card{border:1px solid #d8e2ef;border-radius:16px;margin:12px 0;padding:16px;break-inside:avoid;page-break-inside:avoid}.finding-image{align-self:start;background:#f8fafc;border:1px solid #d8e2ef;border-radius:12px;overflow:hidden}.finding-image img{display:block;width:100%;max-height:330px;object-fit:contain}.gallery-grid{display:grid;gap:14px;grid-template-columns:repeat(2,minmax(0,1fr))}.gallery-card{background:#fff;border:1px solid #d8e2ef;border-radius:16px;break-inside:avoid;overflow:hidden}.gallery-thumb{background:#f8fafc}.gallery-thumb img{display:block;height:260px;object-fit:cover;width:100%}.gallery-caption{padding:12px 14px}.gallery-caption h3{font-size:16px;margin:0}.gallery-caption p{color:#62728a;font-size:13px;margin:4px 0 0}.evidence-grid{display:grid;gap:14px;grid-template-columns:1fr}.evidence-card{align-items:start;border:1px solid #d8e2ef;border-radius:16px;display:grid;gap:14px;grid-template-columns:220px minmax(0,1fr);padding:14px;break-inside:avoid;page-break-inside:avoid}.evidence-card h3{font-size:17px;margin:0 0 8px}.evidence-card p{margin:0 0 10px}.evidence-media img{height:170px;max-height:170px;object-fit:contain}.evidence-copy dl{grid-template-columns:repeat(3,minmax(0,1fr))}.evidence-copy dl div{padding:8px}.severity,.evidence-pill{background:#f8fafc;border:1px solid #d8e2ef;border-radius:999px;display:inline-block;font-size:11px;font-weight:900;padding:6px 9px}.evidence-pill-row{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}.signature-block{background:#f8fafc;border:1px solid #d8e2ef;border-radius:14px;margin-top:14px;padding:14px}.signature-image{background:white;border:1px solid #d8e2ef;border-radius:10px;display:block;max-height:130px;max-width:360px;object-fit:contain;padding:8px}.approval-signature{display:inline-block;min-width:360px}.signature-empty{color:#62728a;font-weight:800}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d8e2ef;padding:10px;text-align:left}th{background:#f1f5fb}@media (max-width:800px){body{padding:14px}.report-cover,.evidence-card{grid-template-columns:1fr}.cover-copy{padding:22px}.cover-copy h1{font-size:30px}dl,.gallery-grid,.evidence-copy dl{grid-template-columns:1fr}.header,.item{border-radius:16px;padding:18px}.toolbar{align-items:flex-start;flex-direction:column;gap:8px}.gallery-thumb img{height:230px}}@media print{@page{margin:14mm}html,body{background:white}body{padding:0}.report{max-width:none}.toolbar{display:none!important}.header,.item,.finding-card,.reference-card,.evidence-card,.gallery-card{break-inside:avoid;box-shadow:none}.report-cover,.gallery-section,.org-section,.approval-section{break-before:page}.report-cover:first-of-type{break-before:auto}.media img,.evidence-media img,.signature-image,.finding-image img,.gallery-thumb img{break-inside:avoid;visibility:visible}.note{position:static;background:#14213d}a,a:visited{color:#18243a!important;text-decoration:none!important}.report{color:#18243a;-webkit-text-size-adjust:100%;print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  `;

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const requestUrl = new URL(_request.url);
  const shareTokenValue = requestUrl.searchParams.get("share_token");
  const previewOnly = requestUrl.searchParams.get("preview") === "1";
  const showDebugDetails = requestUrl.searchParams.get("debug") === "1";
  const sharedAccess = Boolean(shareTokenValue);

  let supabase: SupabaseClient<Database>;
  let session: ReportSession;
  let organizationId: string;
  let createdBy: string | null = null;
  let timeZone: string | null = null;

  if (shareTokenValue) {
    supabase = createAdminClient();
    const { data: shareToken, error: shareError } = await supabase
      .from("report_share_tokens")
      .select("*, documentation_sessions(*, organizations(name))")
      .eq("token", shareTokenValue)
      .maybeSingle();

    const sharedSession = Array.isArray(shareToken?.documentation_sessions)
      ? shareToken.documentation_sessions[0]
      : shareToken?.documentation_sessions;

    if (
      shareError ||
      !shareToken ||
      !sharedSession ||
      shareToken.disabled_at ||
      sharedSession.id !== id ||
      sharedSession.organization_id !== shareToken.organization_id ||
      (shareToken.expires_at && new Date(shareToken.expires_at) < new Date())
    ) {
      notFound();
    }

    session = sharedSession as ReportSession;
    organizationId = shareToken.organization_id;
    createdBy =
      typeof sharedSession.created_by === "string"
        ? sharedSession.created_by
        : null;
  } else {
    const workspace = await requireSessionWorkspace();
    supabase = workspace.supabase;
    organizationId = workspace.profile.organization_id;
    createdBy = workspace.profile.id;
    timeZone = workspace.profile.timezone;

    const billingAccess = requireActiveBillingAccess(workspace.profile);

    if (!billingAccess.ok) {
      redirect(
        `/dashboard/sessions/${id}/report?error=${encodeURIComponent(billingAccess.message)}`,
      );
    }

    const { data: ownedSession, error: sessionError } = await supabase
      .from("documentation_sessions")
      .select("*, organizations(name)")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single();

    if (sessionError || !ownedSession) notFound();

    if (!previewOnly && ownedSession.review_status !== "ready_for_delivery") {
      redirect(
        `/dashboard/sessions/${id}/report?error=${encodeURIComponent("Approve this report before exporting.")}`,
      );
    }

    session = ownedSession;
  }

  const { data: captures } = await supabase
    .from("capture_items")
    .select("*")
    .eq("documentation_session_id", session.id)
    .eq("organization_id", organizationId)
    .eq("include_in_report", true)
    .is("deleted_at", null)
    .order("report_order", { ascending: true, nullsFirst: false })
    .order("captured_at", { ascending: true });

  const captureItems = sanitizeCapturesForImageAiAssist(
    captures ?? [],
    true,
  ) as ReportCapture[];
  const appendixCaptureResult = getAppendixCaptures(captureItems);
  const appendixCaptureItems = appendixCaptureResult.captures;
  logExportIntegrity({
    session,
    includedCaptures: captureItems,
    appendixCaptures: appendixCaptureItems,
    duplicateCaptureIds: appendixCaptureResult.duplicateCaptureIds,
    finalNotesSource: "documentation_sessions.final_notes",
  });
  const imageAssets = buildCaptureImageUrls(session.id, captureItems, shareTokenValue);

  const { data: signatures } = await supabase
    .from("signature_captures")
    .select("*")
    .eq("documentation_session_id", session.id)
    .eq("organization_id", organizationId)
    .order("signed_at", { ascending: true });

  const reportSignatures = signatures ?? [];

  const { data: reportProfile } = await supabase
    .from("profiles")
    .select(
      "full_name, inspector_role_or_title, technician_license_number, inspector_email, inspector_phone, timezone, default_signature_path, use_default_signature",
    )
    .eq("id", session.created_by)
    .eq("organization_id", organizationId)
    .maybeSingle();
  timeZone = timeZone ?? reportProfile?.timezone ?? "UTC";

  const { data: reportCompanyProfile } = await supabase
    .from("company_profiles")
    .select(
      "company_name, facility_name, facility_number, facility_address_line_1, facility_address_line_2, facility_city, facility_region, facility_postal_code, facility_country, facility_email, facility_phone, permit_number, certification_number",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();
  const signatureUrls = buildSignatureUrls(
    session.id,
    reportSignatures,
    reportProfile,
    shareTokenValue,
  );

  const { data: reportDrafts } = await supabase
    .from("ai_report_drafts")
    .select("*")
    .eq("documentation_session_id", session.id)
    .eq("organization_id", organizationId)
    .order("generated_at", { ascending: false })
    .order("created_at", { ascending: false });

  const reportDraft =
    (reportDrafts ?? []).find((draft) => draft.status === "approved") ??
    (reportDrafts ?? []).find((draft) => draft.status !== "superseded") ??
    reportDrafts?.[0] ??
    null;

  const { data: draftSections } = reportDraft
    ? await supabase
        .from("ai_report_draft_sections")
        .select("*")
        .eq("ai_report_draft_id", reportDraft.id)
        .eq("documentation_session_id", session.id)
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true })
    : { data: [] };
  const reportSections = draftSections ?? [];

  if (!sharedAccess && !previewOnly) {
    await supabase.from("exports").insert({
      documentation_session_id: session.id,
      organization_id: organizationId,
      export_type: "printable_report_opened",
      status: "opened",
      created_by: createdBy,
      metadata: { item_count: captureItems.length, format: "printable_html" },
    });
    await recordUsageEvent({
      supabase,
      organizationId,
      eventType: "printable_report_opened",
      metadata: {
        session_id: session.id,
        item_count: captureItems.length,
        format: "printable_html",
      },
      createdBy,
    });
  }

  const organizationName =
    isRecord(session.organizations) &&
    typeof session.organizations.name === "string"
      ? session.organizations.name
      : "CRED";
  if (reportDraft && getDiagnosticProcedureInfo(reportDraft)) {
    const html = buildDiagnosticProcedureReportHtml({
      session,
      organizationName,
      reportDraft,
      reportSections,
      captureItems,
      signedUrls: imageAssets,
      showToolbar: !previewOnly,
      timeZone,
    });
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (isFieldServiceSessionType(session.session_type)) {
    const visibleReportSections = reportSections.filter(
      (section) => !isHiddenFromReport(section.metadata),
    );
    const html = buildFieldServiceReportHtml({
      session,
      organizationName,
      captureItems,
      signedUrls: imageAssets,
      signatures: reportSignatures,
      signatureUrls,
      reportDraft,
      reportSections: visibleReportSections,
      showToolbar: !previewOnly,
      timeZone,
    });
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }



  const visibleReportSections = reportSections.filter(
    (section) => !isHiddenFromReport(section.metadata),
  );

  const documentSections = normalizeDraftSections(
    visibleReportSections,
    captureItems,
  );
  const derivedFormSections = deriveFormSectionsFromCaptures(captureItems);
  const formSections =
    documentSections.length > 0 ? documentSections : derivedFormSections;
  const isGenericEvidenceReport =
    getFormStructureSummary(reportDraft?.report_structure ?? null, formSections)
      .source === "generic_fallback";
  const reportTitle = cleanReportTitle(
    reportDraft?.title || session.title,
    session,
    reportDraft,
    isGenericEvidenceReport,
  );
  const subjectDetailRows = buildCustomerAssetRows(
    formSections,
    session as unknown as Record<string, unknown>,
  ).filter(
    (row) =>
      ![
        "Customer / Client",
        "Asset / Equipment",
        "Subject Name",
        "Location",
        "Reference Number",
      ].includes(row.label),
  );
  const customerAssetHtml = renderDefinitionRows(subjectDetailRows);
  const structuredFormDataHtml = buildStructuredFormDataHtml(
    reportDraft?.report_structure ?? null,
  );
  const reportInfoHtml = renderReportInformationHtml(
    reportDraft,
    session,
    timeZone,
  );
  const reviewDocument = buildNormalizedReportModel({
    captures: captureItems,
    sections: formSections,
    draftSections: visibleReportSections,
    measurements: reportDraft?.measurements ?? [],
    findings: reportDraft?.findings ?? [],
  });
  const unattachedHtml = "";
  const summaryHtml = buildReportOverviewHtml({
    capturedCount: captureItems.length,
    includedCount: appendixCaptureItems.length,
    finalNotesIncluded: Boolean(session.include_final_notes_in_export && session.final_notes),
    approved: Boolean(getApprovalDate(reportDraft, session)),
    preparedBy: reportProfile?.full_name ?? "",
    organization: getOrganizationDisplayName(organizationName, reportCompanyProfile),
  });
  const imageCount = appendixCaptureItems.filter(isImageEvidence).length;
  const useGalleryMode = imageCount >= 6;
  const appendixHtml = buildEvidenceAppendixHtml(
    appendixCaptureItems,
    imageAssets,
    timeZone,
    { showDebugDetails, renderImages: !useGalleryMode },
  );
  const draftReferencedCaptureCount = new Set(
    visibleReportSections
      .flatMap((section) => section.source_capture_ids ?? [])
      .filter((id) => captureItems.some((capture) => capture.id === id)),
  ).size;
  const evidenceSectionIsEmpty =
    reviewDocument.findings.length === 0 &&
    reviewDocument.referenceDocuments.length === 0 &&
    reviewDocument.additionalNotes.length === 0 &&
    reviewDocument.supportingEvidence.length === 0 &&
    reviewDocument.unattachedDetails.length === 0;
  if (
    captureItems.length > 0 &&
    draftReferencedCaptureCount === 0 &&
    evidenceSectionIsEmpty
  )
    console.warn(
      "[report-evidence-check] Included captures have no draft references; Evidence Appendix will render all included captures.",
      { session_id: session.id, included_capture_count: captureItems.length },
    );
  const referenceHtml = reviewDocument.referenceDocuments.length
    ? buildReferenceDocumentsHtml(
        reviewDocument.referenceDocuments,
        imageAssets,
        { includeOriginal: false },
      )
    : "";
  const findingsHtml = buildFindingCardsHtml(
    reviewDocument.findings,
    imageAssets,
    { renderImages: false },
  );
  const supportingHtml = "";

  const toolbarHtml = previewOnly
    ? ""
    : '<div class="toolbar"><button onclick="window.print()">Print / Save Report</button><p class="print-help">Use your browser’s Print or Share menu to save a printable report.</p></div>';
  const html = `<!doctype html><html><head><meta charset="utf-8" /><meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" /><title>${escapeHtml(reportTitle)} printable report</title>
  <style>${REPORT_STYLES}</style></head><body><main class="report">${toolbarHtml}${buildReportCoverHtml({ reportTitle, reportType: normalizeReportType(session.session_type), session, draft: reportDraft, organizationName, companyProfile: reportCompanyProfile, captures: appendixCaptureItems, imageAssets: imageAssets, timeZone })}${summaryHtml}${reportInfoHtml}${customerAssetHtml ? `<section class="item service-section"><h2>Subject Details</h2>${customerAssetHtml}</section>` : ""}${structuredFormDataHtml}${buildFinalNotesHtml(session)}${findingsHtml}${unattachedHtml}${supportingHtml}${useGalleryMode ? buildEvidenceGalleryHtml(appendixCaptureItems, imageAssets, timeZone) : ""}${appendixHtml}${referenceHtml}${buildInspectorFacilityHtml(reportProfile, reportCompanyProfile)}${buildApprovalHtml({ profile: reportProfile, signatures: reportSignatures, signatureUrls, draft: reportDraft, session, timeZone })}</main></body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
