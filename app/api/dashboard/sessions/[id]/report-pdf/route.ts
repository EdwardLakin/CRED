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
import { normalizeEvidenceCategory } from "@/features/capture/evidence-category";
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

type ReportPresentationMode = "gallery" | "detailed";

function hasUniqueReportDetails(params: {
  reviewDocument: ReturnType<typeof buildNormalizedReportModel<ReportCapture>>;
  reportSections: ReportDraftSection[];
  finalNotesIncluded: boolean;
  subjectDetailRows: Array<{ label: string; value: string }>;
  structuredFormDataHtml: string;
}) {
  return (
    params.reviewDocument.findings.length > 0 ||
    params.reviewDocument.findingModels.length > 0 ||
    params.reviewDocument.referenceDocuments.length > 0 ||
    params.reviewDocument.additionalNotes.length > 0 ||
    params.reviewDocument.supportingEvidence.length > 0 ||
    params.reviewDocument.unattachedDetails.length > 0 ||
    params.reportSections.some((section) =>
      isMeaningfulCustomerReportText(section.body ?? ""),
    ) ||
    params.finalNotesIncluded ||
    params.subjectDetailRows.length > 0 ||
    Boolean(params.structuredFormDataHtml)
  );
}

function getReportPresentationMode(params: {
  includedImageCount: number;
  isGenericEvidenceReport: boolean;
  hasUniqueDetails: boolean;
  hasDetailedContent: boolean;
}): ReportPresentationMode {
  if (params.includedImageCount < 6) return "detailed";
  if (params.hasDetailedContent) return "detailed";
  if (params.hasUniqueDetails && !params.isGenericEvidenceReport)
    return "detailed";
  return "gallery";
}

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

function escapeHtmlAttributeRaw(value: unknown) {
  // Regression guard: technical attributes must preserve UUID route segments,
  // e.g. /api/dashboard/sessions/11111111-1111-4111-8111-111111111111/evidence/22222222-2222-4222-8222-222222222222/media.
  // Do not call customerText(), stripConfidenceText(), or UUID redaction here.
  return String(value ?? "")
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

function isHiddenFromReport(metadata: Json) {
  return isRecord(metadata) && metadata.hidden_from_report === true;
}

function getApprovalDate(
  draft: ReportDraft | null | undefined,
  session: ReportSession,
) {
  return draft?.approved_at ?? session.reviewed_at ?? null;
}

function getOrganizationDisplayName(
  organizationName: string,
  companyProfile?: {
    company_name?: string | null;
    facility_name?: string | null;
  } | null,
) {
  return (
    companyProfile?.company_name ||
    companyProfile?.facility_name ||
    organizationName
  );
}

function getCoverImageHtml(
  captures: ReportCapture[],
  imageAssets: Record<string, ExportImageAsset>,
  allowCoverImage: boolean,
) {
  // TODO: Support an explicit user-selected cover image when report settings expose one.
  if (!allowCoverImage) return "";
  const eligibleImages = captures.filter(
    (capture) =>
      isImageEvidence(capture) &&
      imageAssets[capture.id]?.classification === "webSafeImage" &&
      imageAssets[capture.id]?.mediaUrl,
  );
  if (eligibleImages.length < 3) return "";
  const coverCapture =
    eligibleImages.find((capture) => getUserEvidenceText(capture)) ??
    eligibleImages[0];
  return `<div class="cover-image">${renderExportImage(imageAssets[coverCapture.id], getPrimaryEvidenceLabel(coverCapture), "Preview unavailable in printable export. Original evidence retained.")}</div>`;
}

function buildReportCoverHtml(params: {
  reportTitle: string;
  reportType: string;
  session: ReportSession;
  draft: ReportDraft | null;
  organizationName: string;
  companyProfile?: {
    company_name?: string | null;
    facility_name?: string | null;
  } | null;
  captures: ReportCapture[];
  imageAssets: Record<string, ExportImageAsset>;
  timeZone: string | null;
  allowCoverImage: boolean;
}) {
  const rows = [
    {
      label: "Customer / Client",
      value:
        getReportInfoValue(params.draft, params.session, "customer_client") ||
        params.session.customer_name ||
        "",
    },
    {
      label: "Subject",
      value:
        getReportInfoValue(params.draft, params.session, "subject_name") || "",
    },
    {
      label: "Asset / Equipment",
      value:
        getReportInfoValue(params.draft, params.session, "asset_equipment") ||
        params.session.asset_label ||
        params.session.unit_number ||
        "",
    },
    {
      label: "Location",
      value: getReportInfoValue(params.draft, params.session, "location"),
    },
    {
      label: "Report ID",
      value: params.session.display_id ?? "",
    },
    {
      label: "Reference / File Note",
      value: getReportInfoValue(
        params.draft,
        params.session,
        "reference_number",
      ),
    },
    {
      label: "Report Date",
      value: formatDateTimeInTimeZone(
        params.draft?.updated_at ??
          params.session.updated_at ??
          params.session.created_at,
        params.timeZone,
      ),
    },
    {
      label: "Organization",
      value: getOrganizationDisplayName(
        params.organizationName,
        params.companyProfile,
      ),
    },
  ];
  const coverImageHtml = getCoverImageHtml(
    params.captures,
    params.imageAssets,
    params.allowCoverImage,
  );
  return `<section class="report-cover item${coverImageHtml ? "" : " report-cover-no-image"}"><div class="cover-copy"><div class="cover-kicker"><span>Documentation Report</span><span>${escapeHtml(params.reportType)}</span></div><h1>${escapeHtml(params.reportTitle)}</h1><p class="cover-trust">Report identity and approved customer-facing documentation.</p>${renderDefinitionRows(rows)}</div>${coverImageHtml}</section>`;
}

function getCaptionChips(captures: ReportCapture[]) {
  const captions = captures
    .map((capture) =>
      (
        capture.technician_note?.trim() ||
        capture.transcript?.trim() ||
        ""
      ).replace(/\s+/g, " "),
    )
    .filter(Boolean);
  return Array.from(new Set(captions)).slice(0, 12);
}

function buildReportOverviewHtml(params: {
  summary?: string | null;
  reportTitle?: string;
}) {
  const summary = stripConfidenceText(params.summary ?? "").trim();
  const summaryText =
    summary ||
    `This ${params.reportTitle ? `${params.reportTitle} ` : ""}report documents technician observations, key concerns, supporting proof, and recommended next actions.`;
  const paragraphs = summaryText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 3);
  return `<section class="item service-section overview-section"><div class="section-heading"><p class="eyebrow">Executive-facing overview</p><h2>Executive Summary</h2></div><div class="summary-panel">${paragraphs.map((paragraph) => `<p class="summary-lead">${escapeHtml(paragraph)}</p>`).join("")}<p class="summary-trust">Technician-approved summary. Supporting proof is organized under Documented Observations.</p></div></section>`;
}

function buildEvidenceGalleryHtml(
  captures: ReportCapture[],
  imageAssets: Record<string, ExportImageAsset>,
  timeZone: string | null,
) {
  const images = captures.filter(isImageEvidence);
  if (!images.length) return "";
  const reportDocument = buildUniversalReportDocument({ captures, timeZone });
  const evidenceByCaptureId = new Map(
    reportDocument.evidenceItems.map((item) => [item.sourceCaptureId, item]),
  );
  return `<section class="item service-section gallery-section"><h2>Supporting Photo Record</h2><p class="muted">Photographs are included to support the report conclusions and are not a substitute for the written findings.</p><div class="gallery-grid">${images
    .map((capture) => {
      const meta = evidenceByCaptureId.get(capture.id);
      const evidenceId = meta?.evidenceId ?? "Evidence";
      const label = getPrimaryEvidenceLabel(capture);
      const captured =
        meta?.capturedAtLabel ??
        formatDateTimeInTimeZone(capture.captured_at, timeZone);
      const media = renderExportImage(
        imageAssets[capture.id],
        label,
        "Preview unavailable in printable export. Original evidence retained.",
      );
      return `<article class="gallery-card"><div class="gallery-thumb">${media}</div><div class="gallery-caption"><p class="gallery-evidence-id">${escapeHtml(evidenceId)}</p><h3>${escapeHtml(label)}</h3><p>${escapeHtml(captured)}</p></div></article>`;
    })
    .join("")}</div></section>`;
}

function buildApprovalHtml(params: {
  profile: {
    full_name?: string | null;
    inspector_role_or_title?: string | null;
  } | null;
  signatures: ReportSignature[];
  signatureUrls: Record<string, string>;
  draft: ReportDraft | null;
  session: ReportSession;
  timeZone: string | null;
}) {
  const signature =
    params.signatures.find((item) =>
      /inspector|technician/i.test(item.signature_type),
    ) ?? params.signatures[0];
  const signatureUrl = signature
    ? params.signatureUrls[signature.id]
    : params.signatureUrls.__default_signature;
  const approvedAt =
    getApprovalDate(params.draft, params.session) ??
    signature?.signed_at ??
    null;
  const rows = [
    {
      label: "Approved by",
      value: signature?.signer_name || params.profile?.full_name || "",
    },
    {
      label: "Role / Title",
      value:
        params.profile?.inspector_role_or_title ||
        signature?.signature_type?.replace(/_/g, " ") ||
        "",
    },
    {
      label: "Approved date / time",
      value: approvedAt
        ? formatDateTimeInTimeZone(approvedAt, params.timeZone)
        : "",
    },
  ];
  const sig = signatureUrl
    ? `<div class="signature-block approval-signature"><p class="signature-label">Signature</p><img class="signature-image" src="${escapeHtmlAttributeRaw(signatureUrl)}" alt="Approval signature" /></div>`
    : '<div class="signature-block signature-empty"><p class="signature-label">Signature</p><p class="muted">No signature captured</p></div>';
  return `<section class="item service-section approval-section signoff-section"><div class="section-heading"><p class="eyebrow">Formal sign-off</p><h2>Approval</h2></div><div class="approval-grid"><div>${renderDefinitionRows(rows)}</div>${sig}</div></section>`;
}

function buildFinalNotesHtml(
  session: Pick<ReportSession, "final_notes" | "include_final_notes_in_export">,
) {
  const notes = session.include_final_notes_in_export
    ? (session.final_notes ?? "")
    : "";
  if (!notes) return "";
  return `<section class="item service-section"><h2>Final Summary / Report Notes</h2><p>${escapeHtml(notes).replace(/\n/g, "<br />")}</p></section>`;
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

function getUserEvidenceText(capture: ReportCapture) {
  const userText =
    capture.technician_note?.trim() || capture.transcript?.trim();
  return userText && !looksLikeRawUploadFilename(userText) ? userText : "";
}

function getPrimaryEvidenceLabel(capture: ReportCapture) {
  return (
    getUserEvidenceText(capture) ||
    (getEvidenceKind(capture) === "image" ? "Supporting image" : "Observation")
  );
}

function looksLikeRawUploadFilename(value: string) {
  return (
    /\b\d{4}-\d{2}-\d{2}T\d{2}[-:]\d{2}[-:]\d{2}(?:[-.]\d{3})?Z?[-_]/i.test(
      value,
    ) ||
    /\b(?:IMG|VID|DSC|PXL|Screenshot)[-_ ]?\d{3,}\b/i.test(value) ||
    /(?:^|[/\\])[a-z0-9-]{16,}[-_][^/\\]+\.(?:jpe?g|png|webp|gif|heic|pdf|docx?|xlsx?)$/i.test(
      value,
    )
  );
}

function getUploadMimeType(capture: ReportCapture) {
  if (!isRecord(capture.extracted_data)) return "";
  const upload = capture.extracted_data.upload;
  if (!isRecord(upload)) return "";
  return typeof upload.mime_type === "string"
    ? upload.mime_type.toLowerCase()
    : "";
}

function getImageExtension(capture: ReportCapture) {
  const source =
    capture.storage_path ||
    capture.thumbnail_path ||
    getCaptureFilename(capture);
  const match = source.match(/\.([a-z0-9]+)(?:[?#].*)?$/i);
  return match?.[1]?.toLowerCase() ?? "";
}

function classifyExportImage(
  capture: ReportCapture,
): ExportImageAsset["classification"] {
  const mimeType = getUploadMimeType(capture);
  const extension = getImageExtension(capture);
  if (
    ["jpg", "jpeg", "png", "webp", "gif"].includes(extension) ||
    [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ].includes(mimeType)
  )
    return "webSafeImage";
  return "nonWebSafeImage";
}

function renderExportImage(
  asset: ExportImageAsset | undefined,
  alt: string,
  fallbackText: string,
) {
  const originalLink = asset?.originalMediaUrl
    ? `<p class="original-link"><a href="${escapeHtmlAttributeRaw(asset.originalMediaUrl)}" target="_blank" rel="noreferrer">Open original evidence</a></p>`
    : "";
  const fallback = `<div class="media-fallback export-image-fallback">${escapeHtml(fallbackText)}${originalLink}</div>`;
  if (asset?.classification === "webSafeImage" && asset.mediaUrl) {
    return `<img src="${escapeHtmlAttributeRaw(asset.mediaUrl)}" alt="${escapeHtml(alt)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />${fallback.replace('<div class="media-fallback export-image-fallback">', '<div class="media-fallback export-image-fallback" style="display:none">')}`;
  }
  return fallback;
}

function appendMediaQuery(
  path: string,
  shareToken: string | null,
  download = false,
) {
  const params = new URLSearchParams();
  if (shareToken) params.set("share_token", shareToken);
  if (download) params.set("download", "1");
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function buildCaptureMediaUrl(
  sessionId: string,
  captureId: string,
  shareToken: string | null,
  download = false,
) {
  return appendMediaQuery(
    `/api/dashboard/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(captureId)}/media`,
    shareToken,
    download,
  );
}

function buildSignatureMediaUrl(
  sessionId: string,
  signatureId: string,
  shareToken: string | null,
) {
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
      imageAssets[capture.id] = {
        classification,
        reason: "missing_storage_path",
      };
      continue;
    }

    const mediaUrl = buildCaptureMediaUrl(sessionId, capture.id, shareToken);
    const originalMediaUrl = buildCaptureMediaUrl(
      sessionId,
      capture.id,
      shareToken,
      true,
    );
    imageAssets[capture.id] =
      classification === "webSafeImage"
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
    signatureUrls[signature.id] = buildSignatureMediaUrl(
      sessionId,
      signature.id,
      shareToken,
    );
  }
  if (
    (signatures.length === 0 ||
      !signatures.some((signature) =>
        /inspector|technician/i.test(signature.signature_type),
      )) &&
    reportProfile?.use_default_signature &&
    reportProfile.default_signature_path
  ) {
    signatureUrls.__default_signature = buildSignatureMediaUrl(
      sessionId,
      "__default_signature",
      shareToken,
    );
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
  _draft: ReportDraft | null | undefined,
  session: ReportSession,
  timeZone?: string | null,
) {
  const rows = [
    {
      label: "Last Updated",
      value: formatDateTimeInTimeZone(
        session.updated_at ?? session.created_at,
        timeZone,
      ),
    },
    {
      label: "Report ID",
      value: session.display_id ?? "",
    },
    {
      label: "Reference / File Note",
      value: getReportInfoValue(_draft, session, "reference_number"),
    },
  ];
  const html = renderDefinitionRows(rows);
  return html
    ? `<section class="item service-section"><h2>Report Details</h2>${html}</section>`
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
  return `<section class="item service-section"><h2>Source Form Summary</h2><p class="muted">Information from captured forms is summarized into report sections for readability while preserving the documented source fields.</p>${renderDefinitionRows([...sectionRows, { label: "Linked source records", value: String(mappings.length) }])}</section>`;
}

function renderDefinitionRows(rows: Array<{ label: string; value: string }>) {
  const visibleRows = getProfessionalRows(
    rows.filter(
      (row) =>
        !/file(?:name)?|storage|path|upload/i.test(row.label) &&
        !looksLikeRawUploadFilename(row.value),
    ),
  );
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
  } | null,
) {
  const address = [
    companyProfile?.facility_address_line_1,
    companyProfile?.facility_address_line_2,
    companyProfile?.facility_city,
    companyProfile?.facility_region,
    companyProfile?.facility_postal_code,
    companyProfile?.facility_country,
  ]
    .filter(Boolean)
    .join(", ");
  const rows = [
    { label: "Inspector", value: profile?.full_name ?? "" },
    { label: "Role / Title", value: profile?.inspector_role_or_title ?? "" },
    {
      label: "Organization",
      value:
        companyProfile?.company_name ?? companyProfile?.facility_name ?? "",
    },
    { label: "Facility Number", value: companyProfile?.facility_number ?? "" },
    { label: "Address", value: address },
    {
      label: "Email",
      value: profile?.inspector_email ?? companyProfile?.facility_email ?? "",
    },
    {
      label: "Phone",
      value: profile?.inspector_phone ?? companyProfile?.facility_phone ?? "",
    },
    {
      label: "Licence Number",
      value: profile?.technician_license_number ?? "",
    },
    { label: "Permit Number", value: companyProfile?.permit_number ?? "" },
    {
      label: "Certification Number",
      value: companyProfile?.certification_number ?? "",
    },
  ];
  const rowsHtml = renderDefinitionRows(rows);
  return rowsHtml
    ? `<section class="item service-section org-section signoff-section"><h2>Inspector / Organization</h2>${rowsHtml}</section>`
    : "";
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
  return `<section class="item service-section findings-section"><h2>Findings</h2>${findings
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
      return `<article class="finding-card">${imageHtml}<div class="finding-content"><p class="eyebrow">Finding ${index + 1}</p><h3>${escapeHtml(finding.title)}</h3><h4>Observation / Condition</h4>${finding.observations.length ? finding.observations.map((item) => `<p>${escapeHtml(item)}</p>`).join("") : '<p class="muted">Condition documented in the supporting record.</p>'}${details.length ? `<h4>Supporting Details</h4>${renderDefinitionRows(details.map((detail) => ({ label: detail.label, value: detail.value })))}` : ""}<h4>Recommended Action</h4>${finding.recommendations.length ? `<ul>${finding.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : '<p class="muted">No specific recommended action was documented.</p>'}</div></article>`;
    })
    .join("")}</section>`;
}

function buildRecommendedActionsHtml(
  findings: ReturnType<typeof getNormalizedFindingModels<ReportCapture>>,
) {
  const actions = getNormalizedRecommendedActions(findings);
  if (!actions.length) return "";
  return `<section class="item service-section"><h2>Recommended Actions</h2><table><thead><tr><th>Priority</th><th>Action</th></tr></thead><tbody>${actions.map((item) => `<tr><td>${escapeHtml(item.priority)}</td><td>${escapeHtml(item.action)}</td></tr>`).join("")}</tbody></table></section>`;
}

function isTrueReferenceDocument(capture: ReportCapture) {
  const data = isRecord(capture.extracted_data) ? capture.extracted_data : {};
  const metadata = isRecord(data.metadata) ? data.metadata : {};
  const upload = isRecord(data.upload) ? data.upload : {};
  const sourceType =
    typeof data.source_type === "string" ? data.source_type : "";
  const captureRole =
    typeof data.capture_role === "string" ? data.capture_role : "";
  const uploadType =
    typeof upload.type === "string"
      ? upload.type
      : typeof upload.upload_type === "string"
        ? upload.upload_type
        : typeof upload.document_type === "string"
          ? upload.document_type
          : "";
  return (
    capture.media_kind === "document" ||
    data.source_document === true ||
    data.reference_document === true ||
    metadata.source_document === true ||
    metadata.reference_document === true ||
    /^(source_document|reference_document|document_reference)$/.test(
      sourceType,
    ) ||
    /^(source_document|reference_document|document_reference)$/.test(
      captureRole,
    ) ||
    /^(document|source_document|reference_document|document_reference)$/.test(
      uploadType,
    )
  );
}

function buildReferenceDocumentsHtml(
  items: ReturnType<
    typeof buildNormalizedReportModel<ReportCapture>
  >["findings"],
  imageAssets: Record<string, ExportImageAsset>,
  options: { includeOriginal?: boolean } = {},
) {
  const referenceItems = items.filter((entry) =>
    isTrueReferenceDocument(entry.capture),
  );
  if (!referenceItems.length) return "";
  return `<section class="item service-section"><h2>Source Documentation</h2>${referenceItems
    .map((entry) => {
      const details = dedupeEvidenceDetails(entry.group.details).filter(
        (detail) => isMeaningfulCustomerReportText(detail.value),
      );
      const originalHtml =
        options.includeOriginal === false
          ? ""
          : `<details><summary>View Original Reference</summary>${buildEvidenceItemsHtml([entry], imageAssets)}</details>`;
      return `<article class="reference-card"><h3>${escapeHtml(getPrimaryEvidenceLabel(entry.capture))}</h3>${details.length ? renderDefinitionRows(details.map((detail) => ({ label: detail.label, value: detail.value }))) : '<p class="muted">Source document included to support the report record.</p>'}${originalHtml}</article>`;
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
      const evidenceTitle = getPrimaryEvidenceLabel(capture);
      const title = evidenceTitle;
      const mediaHtml =
        mediaKind === "note"
          ? `<div class="video-still">${escapeHtml(stripConfidenceText(capture.technician_note || capture.transcript || "Technician Note"))}</div>`
          : mediaKind === "image"
            ? renderExportImage(
                imageAsset,
                getPrimaryEvidenceLabel(capture),
                "Preview unavailable in printable export. Original evidence retained.",
              )
            : imageAsset?.originalMediaUrl && mediaKind === "video"
              ? `<div class="video-still">Video reference</div><p class="video-link original-link"><a href="${escapeHtmlAttributeRaw(imageAsset.originalMediaUrl)}">Open video evidence</a></p>`
              : imageAsset?.originalMediaUrl
                ? `<p class="original-link"><a href="${escapeHtmlAttributeRaw(imageAsset.originalMediaUrl)}">Open saved file</a></p>`
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

function getObservationCategoryLabel(
  entry: ReturnType<
    typeof buildNormalizedReportModel<ReportCapture>
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

function getObservationGroupKey(capture: ReportCapture) {
  return capture.observation_group_id ?? capture.id;
}

function buildDocumentedObservationsHtml(
  reviewDocument: ReturnType<typeof buildNormalizedReportModel<ReportCapture>>,
  imageAssets: Record<string, ExportImageAsset>,
) {
  const allEntries = [
    ...reviewDocument.findings,
    ...reviewDocument.concerns,
    ...reviewDocument.recommendedActionEvidence,
    ...reviewDocument.referenceDocuments,
    ...reviewDocument.additionalNotes,
    ...reviewDocument.supportingEvidence,
  ];
  const renderedIds = new Set<string>();
  const entries = allEntries.filter((entry) => {
    const groupKey = getObservationGroupKey(entry.capture);
    if (renderedIds.has(groupKey)) return false;
    renderedIds.add(groupKey);
    return true;
  });
  const actionCards = reviewDocument.categorizedRecommendedActions.filter(
    (item) => item.action.trim(),
  );
  if (entries.length === 0 && actionCards.length === 0)
    return '<section class="item service-section"><h2>Documented Observations</h2><p class="muted">No documented observations added yet.</p></section>';
  const entryHtml = entries
    .map((entry, index) => {
      const capture = entry.capture;
      const groupCaptures = allEntries
        .map((candidate) => candidate.capture)
        .filter(
          (candidate) =>
            getObservationGroupKey(candidate) ===
            getObservationGroupKey(capture),
        );
      const imageAsset = imageAssets[capture.id];
      const kind = getEvidenceKind(capture);
      const isDocument =
        kind === "document" || capture.media_kind === "document";
      const groupImageAssets = groupCaptures
        .filter((groupCapture) => getEvidenceKind(groupCapture) === "image")
        .map((groupCapture) => ({
          capture: groupCapture,
          asset: imageAssets[groupCapture.id],
        }));
      const mediaHtml =
        groupImageAssets.length > 0
          ? `<div class="media supporting-export-grid">${groupImageAssets.map(({ capture: groupCapture, asset }) => renderExportImage(asset, getPrimaryEvidenceLabel(groupCapture), "Preview unavailable in printable export. Original evidence retained.")).join("")}</div>`
          : imageAsset?.originalMediaUrl
            ? `<p class="original-link"><a href="${escapeHtmlAttributeRaw(imageAsset.originalMediaUrl)}">Open supporting ${isDocument ? "document" : "file"}</a></p>`
            : "";
      const renderedText: string[] = [];
      const technicianNote = stripConfidenceText(
        capture.technician_note || capture.transcript || "",
      );
      if (technicianNote) renderedText.push(technicianNote);
      const details = dedupeEvidenceDetails(entry.group.details).filter(
        (detail) => {
          if (/^technician note$/i.test(detail.label)) return false;
          const visible = shouldRenderDetail(
            detail.label,
            detail.value,
            renderedText,
          );
          if (visible) renderedText.push(detail.value);
          return visible;
        },
      );
      const recommendations = entry.group.recommendations
        .flatMap(splitRecommendationText)
        .filter((value) => {
          const visible = shouldRenderDetail(
            "Recommendation",
            value,
            renderedText,
          );
          if (visible) renderedText.push(value);
          return visible;
        });
      const heading = getUserEvidenceText(capture)
        ? getPrimaryEvidenceLabel(capture)
        : "Observation";
      const technicianNoteHtml = technicianNote
        ? `<div class="technician-note-block"><h4>Technician Note</h4><p>${escapeHtml(technicianNote)}</p></div>`
        : "";
      return `<article class="finding-card observation-card">${mediaHtml}<div class="finding-content observation-content"><div class="observation-heading"><span class="observation-number">${String(index + 1).padStart(2, "0")}</span><span class="observation-kind">${escapeHtml(getObservationCategoryLabel(entry))}</span></div><h3>${escapeHtml(heading)}</h3>${technicianNoteHtml}${groupImageAssets.length ? `<p class="proof-line"><strong>Supporting Images:</strong> ${groupImageAssets.length}</p>` : ""}${isDocument ? `<p class="proof-line"><strong>Supporting Document:</strong> ${escapeHtml(getPrimaryEvidenceLabel(capture))}</p>` : ""}${details.length ? `<div class="proof-block"><h4>Supporting Proof</h4>${renderDefinitionRows(details.map((detail) => ({ label: detail.label, value: detail.value })))}</div>` : ""}${recommendations.length ? `<div class="proof-block"><h4>Recommended Action</h4><ul>${recommendations.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></div>` : ""}</div></article>`;
    })
    .join("");
  const actionsHtml = actionCards
    .map(
      (action, index) =>
        `<article class="finding-card observation-card"><div class="finding-content observation-content"><div class="observation-heading"><span class="observation-number">${String(entries.length + index + 1).padStart(2, "0")}</span><span class="observation-kind">Recommended Action</span></div><h3>Recommended Action</h3><div class="technician-note-block"><h4>Technician Note</h4><p>${escapeHtml(stripConfidenceText(action.action))}</p></div></div></article>`,
    )
    .join("");
  return `<section class="item service-section findings-section documented-observations"><div class="section-heading"><p class="eyebrow">Technician says this. Here’s the proof.</p><h2>Documented Observations</h2></div><p class="muted section-intro">Technician notes are the source of truth. Each supporting photo or document appears once with the observation it supports.</p>${entryHtml}${actionsHtml}</section>`;
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

function buildEvidenceIndexHtml(
  captures: ReportCapture[],
  timeZone: string | null,
) {
  if (captures.length === 0)
    return '<section class="item service-section evidence-index-section"><h2>Evidence Index</h2><p class="muted">No included evidence selected for this report.</p></section>';
  const reportDocument = buildUniversalReportDocument({ captures, timeZone });
  const evidenceByCaptureId = new Map(
    reportDocument.evidenceItems.map((item) => [item.sourceCaptureId, item]),
  );
  return `<section class="item service-section evidence-index-section"><h2>Evidence Index</h2><p class="muted">Index of supporting records referenced by this report. Images are not repeated where they already appear with findings.</p><table class="evidence-index"><thead><tr><th>Evidence ID</th><th>Caption / Title</th><th>Captured</th><th>Type</th></tr></thead><tbody>${captures
    .map((capture) => {
      const evidenceMeta = evidenceByCaptureId.get(capture.id);
      return `<tr><td>${escapeHtml(evidenceMeta?.evidenceId ?? "Evidence")}</td><td>${escapeHtml(getPrimaryEvidenceLabel(capture))}</td><td>${escapeHtml(evidenceMeta?.capturedAtLabel ?? formatDateTimeInTimeZone(capture.captured_at, timeZone))}</td><td>${escapeHtml(evidenceMeta?.evidenceType ?? getEvidenceKind(capture))}</td></tr>`;
    })
    .join("")}</tbody></table></section>`;
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
  return `<section class="item service-section evidence-appendix-section"><h2>Evidence Appendix</h2><p class="muted">Supporting records retained with the reviewed report package.</p><table class="evidence-appendix"><thead><tr>${options.renderImages === false ? "" : "<th>Preview</th>"}<th>Evidence ID</th><th>Caption / Title</th><th>Captured</th><th>Type</th>${options.showDebugDetails ? "<th>Debug ID</th>" : ""}</tr></thead><tbody>${captures
    .map((capture) => {
      const imageAsset = imageAssets[capture.id];
      const mediaKind = getEvidenceKind(capture);
      const evidenceMeta = evidenceByCaptureId.get(capture.id);
      const thumbnailHtml =
        options.renderImages !== false && mediaKind === "image"
          ? `<td class="appendix-thumb">${renderExportImage(imageAsset, getPrimaryEvidenceLabel(capture), "Image unavailable")}</td>`
          : options.renderImages === false
            ? ""
            : `<td class="appendix-thumb appendix-kind">${escapeHtml(getPrimaryEvidenceLabel(capture))}</td>`;
      return `<tr${options.showDebugDetails ? ` data-capture-id="${escapeHtmlAttributeRaw(capture.id)}"` : ""}>${thumbnailHtml}<td>${escapeHtml(evidenceMeta?.evidenceId ?? "Evidence")}</td><td>${escapeHtml(getPrimaryEvidenceLabel(capture))}</td><td>${escapeHtml(evidenceMeta?.capturedAtLabel ?? formatDateTimeInTimeZone(capture.captured_at, timeZone))}</td><td>${escapeHtml(evidenceMeta?.evidenceType ?? mediaKind)}</td>${options.showDebugDetails ? `<td>${escapeHtml(capture.id)}</td>` : ""}</tr>`;
    })
    .join("")}</tbody></table></section>`;
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
    sourceFile: null,
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
                      `<li>${escapeHtml(getPrimaryEvidenceLabel(capture))}${getUserEvidenceText(capture) ? ` — ${escapeHtml(getUserEvidenceText(capture))}` : ""}</li>`,
                  )
                  .join("")}</ul></div>`,
            )
            .join("")
        : '<p class="muted">No step evidence attached.</p>';
      return `<section class="item service-section"><h2>${escapeHtml(section.title)}</h2>${typeof metadata.source_page_start === "number" ? `<p class="muted">Source page${typeof metadata.source_page_end === "number" && metadata.source_page_end !== metadata.source_page_start ? `s ${metadata.source_page_start}-${metadata.source_page_end}` : ` ${metadata.source_page_start}`}</p>` : ""}${Array.isArray(metadata.extraction_warnings) && metadata.extraction_warnings.length ? `<p class="notice warning">Review needed for this procedure step.</p>` : ""}<p><strong>Status:</strong> ${escapeHtml(typeof metadata.technician_status === "string" ? metadata.technician_status.replace(/_/g, " ") : "not tested")}</p><p><strong>Completeness:</strong> ${escapeHtml(completeness.badges.length ? completeness.badges.join(", ") : "Incomplete")}</p>${typeof metadata.technician_selected_branch === "string" && metadata.technician_selected_branch ? `<p><strong>Technician-selected branch:</strong> ${escapeHtml(metadata.technician_selected_branch)}</p>` : ""}<h3>OEM instruction text</h3><p>${escapeHtml(String(metadata.instruction ?? section.body ?? ""))}</p>${typeof metadata.oem_flow_text === "string" && metadata.oem_flow_text ? `<p><strong>OEM flow text:</strong> ${escapeHtml(metadata.oem_flow_text)}</p>` : ""}<h3>Technician-entered readings</h3>${readingsHtml}${typeof metadata.technician_notes === "string" && metadata.technician_notes ? `<h3>Technician notes</h3><p>${escapeHtml(metadata.technician_notes)}</p>` : ""}${typeof metadata.technician_conclusion === "string" && metadata.technician_conclusion ? `<h3>Technician conclusion</h3><p>${escapeHtml(metadata.technician_conclusion)}</p>` : ""}<h3>Attached evidence</h3>${evidenceHtml}</section>`;
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
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" /><title>${escapeHtml(info?.title ?? params.session.title)} diagnostic procedure documentation</title><style>${REPORT_STYLES}</style></head><body><main class="report">${toolbarHtml}<header class="header"><p class="eyebrow">Diagnostic Procedure Workspace</p><h1>${escapeHtml(info?.title ?? params.session.title)}</h1><p class="notice info"><strong>Documentation support only.</strong> Follow OEM procedure. Technician owns all conclusions and recommendations.</p>${info?.signedOff ? `<p class="notice info"><strong>Signed off by ${escapeHtml(info.signOffName ?? "technician")}</strong>${info.signedOffAt ? ` at ${escapeHtml(formatDateInTimeZone(new Date(info.signedOffAt), params.timeZone))}` : ""}. ${escapeHtml(info.signOffStatement ?? "")}</p>` : '<p class="notice warning"><strong>Technician sign-off pending.</strong></p>'}${renderDefinitionRows(details)}</header>${`<section class="item service-section"><h2>Documentation completeness summary</h2>${renderDefinitionRows(
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
    { label: "Report ID", value: session.display_id ?? "" },
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
    summary: reportDraft?.summary,
    reportTitle,
  });
  const fieldAppendixCaptures = getAppendixCaptures(captureItems).captures;
  const fieldUseGalleryMode =
    fieldAppendixCaptures.filter(isImageEvidence).length >= 6;
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
  <style>${REPORT_STYLES}</style></head><body><main class="report">${toolbarHtml}${buildReportCoverHtml({ reportTitle, reportType: normalizeReportType(session.session_type), session, draft: reportDraft, organizationName, captures: captureItems, imageAssets: signedUrls, timeZone, allowCoverImage: fieldUseGalleryMode })}${summaryHtml}<section class="item service-section"><h2>Report Details</h2>${renderDefinitionRows(headerRows)}</section>${renderFieldServiceSection(details, "equipment")}<section class="item service-section"><h2>Travel</h2>${renderDefinitionRows(travelRows)}</section><section class="item service-section"><h2>Work Performed / Resolution</h2>${renderDefinitionRows(workRows)}</section><section class="item service-section"><h2>Supporting Record</h2><p class="muted">Photos, documents, and technician notes support the work summary and findings above.</p></section>${buildFinalNotesHtml(session)}${evidenceHtml}${fieldUseGalleryMode ? buildEvidenceGalleryHtml(captureItems, signedUrls, timeZone) : ""}${appendixHtml}<section class="item service-section"><h2>Time card summary</h2>${renderDefinitionRows(timeRows)}</section><section class="item service-section"><h2>Charges Summary</h2>${renderDefinitionRows(chargeRows)}</section>${buildInspectorFacilityHtml(null, null)}${buildApprovalHtml({ profile: null, signatures, signatureUrls, draft: reportDraft, session, timeZone })}</main></body></html>`;
}

const REPORT_STYLES = `
    :root{color-scheme:light}*{box-sizing:border-box}html{background:#eef2f7}body{font-family:Inter,Arial,Helvetica,sans-serif;background:#eef2f7;color:#18243a;margin:0;padding:36px;line-height:1.45}.report{max-width:1040px;margin:0 auto}.toolbar{align-items:center;background:#13213a;border-radius:16px;color:white;display:flex;justify-content:space-between;margin:0 0 18px;padding:14px 16px}.toolbar button{background:white;border:0;border-radius:999px;color:#13213a;cursor:pointer;font-weight:800;padding:10px 16px}.print-help{color:#dbe7ff;font-size:13px;margin:0}.header,.item{background:white;border:1px solid #d9e2ee;border-radius:18px;box-shadow:0 10px 28px rgba(24,36,58,.055);margin-bottom:12px;padding:18px}.report-cover{display:grid;gap:0;grid-template-columns:minmax(0,1.18fr) minmax(240px,.58fr);overflow:hidden;padding:0;min-height:430px}.report-cover-no-image{display:block}.cover-copy{display:flex;flex-direction:column;justify-content:space-between;padding:34px}.cover-copy h1{font-size:40px;letter-spacing:-.045em;line-height:1.02;margin:34px 0 14px;max-width:13ch}.cover-trust{border-left:4px solid #155dfc;color:#4c5d75;font-size:15px;margin:0 0 22px;padding-left:14px}.cover-image{background:#f7f9fc;overflow:hidden}.cover-image img{display:block;height:100%;max-height:430px;object-fit:cover;width:100%}.eyebrow{color:#155dfc;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.cover-kicker{align-items:center;color:#155dfc;display:flex;font-size:11px;font-weight:900;gap:8px;justify-content:space-between;letter-spacing:.14em;text-transform:uppercase}.section-heading{margin-bottom:10px}.section-heading .eyebrow{margin:0 0 4px}.summary-panel{background:linear-gradient(180deg,#f8fbff,#fff);border:1px solid #e0e8f4;border-radius:14px;padding:14px 16px}.section-intro{font-size:13px;margin:-2px 0 10px}.observation-card{align-items:start;background:linear-gradient(180deg,#fff,#fbfdff);display:grid;gap:12px;grid-template-columns:minmax(220px,.42fr) minmax(0,1fr);padding:10px}.observation-card>.media{align-self:start}.observation-content h3{font-size:18px;letter-spacing:-.015em;line-height:1.2;margin:6px 0 10px}.observation-content h4{color:#3d4f67;font-size:11px;letter-spacing:.1em;margin:0 0 5px;text-transform:uppercase}.observation-content p{margin:0 0 8px}.observation-heading{align-items:center;display:flex;gap:8px}.observation-number{background:#13213a;border-radius:999px;color:white;font-size:11px;font-weight:900;letter-spacing:.08em;padding:5px 8px}.observation-kind{background:#eef4ff;border:1px solid #cfddf4;border-radius:999px;color:#14315f;font-size:11px;font-weight:900;letter-spacing:.08em;padding:4px 8px;text-transform:uppercase}.technician-note-block{border-left:3px solid #155dfc;margin:8px 0 8px;padding-left:10px}.proof-line{background:#f8fafc;border:1px solid #e2e9f2;border-radius:9px;color:#62728a;font-size:12px;padding:7px 9px}.proof-block{margin-top:8px}.approval-grid{align-items:end;display:grid;gap:14px;grid-template-columns:minmax(0,1fr) auto}.signature-label{color:#5a6a81;font-size:10px;font-weight:900;letter-spacing:.12em;margin:0 0 6px;text-transform:uppercase}.meta,.muted{color:#62728a}.service-section h2{border-bottom:1px solid #e3eaf3;font-size:21px;letter-spacing:-.025em;line-height:1.15;margin:0;padding-bottom:9px}dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:9px 0 0}dl div{background:#f8fafc;border:1px solid #e2e9f2;border-radius:9px;padding:7px 9px}dt{color:#5a6a81;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}dd{font-weight:750;margin:4px 0 0;overflow-wrap:anywhere}a,a:visited{color:#18243a;text-decoration:none}.original-link{font-size:12px;margin-top:8px;opacity:.55}.original-link a{text-decoration:underline;text-underline-offset:2px}.media{position:relative;border-radius:14px;overflow:hidden;background:#f8fafc;border:1px solid #d8e2ef}.media img{display:block;width:100%;max-height:370px;object-fit:contain;background:white}.media-fallback{align-items:center;aspect-ratio:4/3;background:#f8fafc;border:1px dashed #cbd6e5;color:#697890;display:flex;font-size:14px;font-weight:800;justify-content:center;padding:18px;text-align:center}.video-still{align-items:center;aspect-ratio:16/9;background:#eef4ff;color:#13213a;display:flex;font-size:18px;font-weight:800;justify-content:center;padding:16px;text-align:center}.finding{margin-top:10px}.finding-card,.reference-card{border:1px solid #d8e2ef;border-radius:14px;margin:8px 0;padding:10px}.finding-image{align-self:start;background:#f8fafc;border:1px solid #d8e2ef;border-radius:12px;overflow:hidden}.finding-image img{display:block;width:100%;max-height:250px;object-fit:contain}.gallery-grid{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}.gallery-card{background:#fff;border:1px solid #d8e2ef;border-radius:16px;break-inside:avoid;overflow:hidden}.gallery-thumb{background:#f8fafc}.gallery-thumb img{display:block;height:210px;object-fit:cover;width:100%}.gallery-caption{padding:12px 14px}.gallery-caption h3{font-size:17px;margin:2px 0 0}.gallery-caption p{color:#62728a;font-size:13px;margin:4px 0 0}.gallery-evidence-id{color:#155dfc!important;font-size:11px!important;font-weight:900;letter-spacing:.12em;margin:0!important;text-transform:uppercase}.summary-lead{color:#26364d;font-size:16px;line-height:1.55;margin:0 0 10px}.summary-trust{border-top:1px solid #e3eaf3;color:#62728a;font-size:12px;font-weight:800;margin:12px 0 0;padding-top:10px}.summary-chip-row{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 14px}.summary-chip-row span{background:#eef4ff;border:1px solid #cfe0ff;border-radius:999px;color:#14315f;font-size:12px;font-weight:800;padding:6px 10px}.evidence-grid{display:grid;gap:10px;grid-template-columns:1fr}.evidence-card{align-items:start;border:1px solid #d8e2ef;border-radius:16px;display:grid;gap:14px;grid-template-columns:220px minmax(0,1fr);padding:14px;break-inside:avoid;page-break-inside:avoid}.evidence-card h3{font-size:17px;margin:0 0 8px}.evidence-card p{margin:0 0 10px}.evidence-media img{height:170px;max-height:170px;object-fit:contain}.evidence-copy dl{grid-template-columns:repeat(3,minmax(0,1fr))}.evidence-copy dl div{padding:8px}.severity,.evidence-pill{background:#f8fafc;border:1px solid #d8e2ef;border-radius:999px;display:inline-block;font-size:11px;font-weight:900;padding:6px 9px}.evidence-pill-row{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}.signature-block{background:#f8fafc;border:1px solid #d8e2ef;border-radius:12px;margin-top:0;padding:10px}.signoff-section{box-shadow:0 6px 18px rgba(24,36,58,.04);padding:18px}.signoff-section dl{grid-template-columns:repeat(2,minmax(0,1fr))}.signoff-section dl div{padding:8px 10px}.signature-image{background:white;border:1px solid #d8e2ef;border-radius:8px;display:block;max-height:82px;max-width:260px;object-fit:contain;padding:6px}.approval-signature{display:inline-block;min-width:260px}.signature-empty{color:#62728a;font-weight:800}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d8e2ef;padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f1f5fb}.evidence-appendix,.evidence-index{font-size:11px}.appendix-thumb{width:70px}.appendix-thumb img{display:block;height:44px;max-width:60px;object-fit:cover;border-radius:5px}.appendix-thumb .media-fallback{aspect-ratio:auto;min-height:44px;padding:4px;font-size:9px}.appendix-kind{color:#62728a;font-size:11px;font-weight:800}@media (max-width:800px){body{padding:14px}.report-cover,.evidence-card,.observation-card,.approval-grid{grid-template-columns:1fr}.cover-copy{padding:22px}.cover-copy h1{font-size:30px}dl,.gallery-grid,.evidence-copy dl{grid-template-columns:1fr}.header,.item{border-radius:16px;padding:18px}.toolbar{align-items:flex-start;flex-direction:column;gap:8px}.gallery-thumb img{height:230px}}@media print{@page{margin:12mm}html,body{background:white}body{padding:0}.report{max-width:none}.toolbar,.original-link{display:none!important}.header,.item,.finding-card,.reference-card,.evidence-card,.gallery-card{box-shadow:none}.finding-card,.reference-card,.evidence-card,.gallery-card{break-inside:avoid;page-break-inside:avoid}.signoff-section{break-inside:avoid;page-break-inside:avoid}.report-cover{break-before:auto}.gallery-section,.org-section,.approval-section,.evidence-appendix-section{break-before:auto;page-break-before:auto}.service-section h2,.section-heading{break-after:avoid;page-break-after:avoid}.observation-card{break-inside:avoid;page-break-inside:avoid}.approval-section{break-inside:avoid;page-break-inside:avoid}.media img,.evidence-media img,.signature-image,.finding-image img,.gallery-thumb img{break-inside:avoid;visibility:visible}.note{position:static;background:#14213d}a,a:visited{color:#18243a!important;text-decoration:none!important}.report{color:#18243a;-webkit-text-size-adjust:100%;print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  `;

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const requestUrl = new URL(_request.url);
  const shareTokenValue = requestUrl.searchParams.get("share_token");
  const previewOnly = requestUrl.searchParams.get("preview") === "1";
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
  const imageAssets = buildCaptureImageUrls(
    session.id,
    captureItems,
    shareTokenValue,
  );

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
        "Reference / File Note",
      ].includes(row.label),
  );
  const structuredFormDataHtml = buildStructuredFormDataHtml(
    reportDraft?.report_structure ?? null,
  );
  const reviewDocument = buildNormalizedReportModel({
    captures: captureItems,
    sections: formSections,
    draftSections: visibleReportSections,
    measurements: reportDraft?.measurements ?? [],
    findings: reportDraft?.findings ?? [],
  });
  const unattachedHtml = "";
  const imageCount = appendixCaptureItems.filter(isImageEvidence).length;
  const finalNotesIncluded = Boolean(
    session.include_final_notes_in_export && session.final_notes,
  );
  const hasUniqueDetails = hasUniqueReportDetails({
    reviewDocument,
    reportSections: visibleReportSections,
    finalNotesIncluded,
    subjectDetailRows,
    structuredFormDataHtml,
  });
  const hasDetailedContent =
    reviewDocument.findings.length > 0 ||
    reviewDocument.findingModels.length > 0 ||
    reviewDocument.referenceDocuments.length > 0 ||
    finalNotesIncluded ||
    visibleReportSections.some((section) =>
      isMeaningfulCustomerReportText(section.body ?? ""),
    );
  const presentationMode = getReportPresentationMode({
    includedImageCount: imageCount,
    isGenericEvidenceReport,
    hasUniqueDetails,
    hasDetailedContent,
  });
  const useGalleryMode = presentationMode === "gallery";
  const summaryHtml = buildReportOverviewHtml({
    summary: reportDraft?.summary,
    reportTitle,
  });
  const appendixHtml = "";
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
  const observationsHtml = buildDocumentedObservationsHtml(
    reviewDocument,
    imageAssets,
  );
  const approvalHtml = buildApprovalHtml({
    profile: reportProfile,
    signatures: reportSignatures,
    signatureUrls,
    draft: reportDraft,
    session,
    timeZone,
  });

  const toolbarHtml = previewOnly
    ? ""
    : '<div class="toolbar"><button onclick="window.print()">Print / Save Report</button><p class="print-help">Use your browser’s Print or Share menu to save a printable report.</p></div>';
  const html = `<!doctype html><html><head><meta charset="utf-8" /><meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" /><title>${escapeHtml(reportTitle)} printable report</title>
  <style>${REPORT_STYLES}</style></head><body><main class="report">${toolbarHtml}${buildReportCoverHtml({ reportTitle, reportType: normalizeReportType(session.session_type), session, draft: reportDraft, organizationName, companyProfile: reportCompanyProfile, captures: appendixCaptureItems, imageAssets: imageAssets, timeZone, allowCoverImage: useGalleryMode })}${summaryHtml}${observationsHtml}${unattachedHtml}${appendixHtml}${approvalHtml}</main></body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
