import { DEFAULT_BRAND_PROFILE } from "@/features/branding/types";
import { getReportInfoValue } from "@/features/reports/report-title";
import { formatDateTimeInTimeZone } from "@/lib/date-format";
import { escapeHtml, escapeHtmlAttributeRaw, isRecord } from "./html";
import type { ExportBranding, ExportImageAsset, ReportCapture, ReportDraft, ReportSession } from "./types";

export type ReportCoverRenderHelpers = {
  isImageEvidence: (capture: ReportCapture) => boolean;
  renderDefinitionRows: (rows: Array<{ label: string; value: string }>) => string;
  renderExportImage: (asset: ExportImageAsset | undefined, alt: string, fallbackText: string) => string;
  getUserEvidenceText: (capture: ReportCapture) => string;
  getPrimaryEvidenceLabel: (capture: ReportCapture) => string;
};

function buildCustomFieldRows(branding: ExportBranding | null | undefined, draft: ReportDraft | null | undefined, placement: keyof Pick<import("@/features/branding/types").CustomReportField, "showInHeader" | "showInCover" | "showInIdentityBlock" | "showInFooter">) {
  const source = isRecord(draft?.report_structure) && isRecord(draft?.report_structure.custom_fields) ? draft?.report_structure.custom_fields : {};
  return (branding?.report_style.customFields ?? []).flatMap((field) => {
    if (!field[placement]) return [];
    const value = source[field.id] ?? source[field.label];
    return typeof value === "string" && value.trim() ? [{ label: field.label, value: value.trim() }] : [];
  });
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
  helpers: Pick<ReportCoverRenderHelpers, "isImageEvidence" | "getUserEvidenceText" | "renderExportImage" | "getPrimaryEvidenceLabel">,
) {
  // TODO: Support an explicit user-selected cover image when report settings expose one.
  if (!allowCoverImage) return "";
  const eligibleImages = captures.filter(
    (capture) =>
      helpers.isImageEvidence(capture) &&
      imageAssets[capture.id]?.classification === "webSafeImage" &&
      imageAssets[capture.id]?.mediaUrl,
  );
  if (eligibleImages.length < 3) return "";
  const coverCapture =
    eligibleImages.find((capture) => helpers.getUserEvidenceText(capture)) ??
    eligibleImages[0];
  return `<div class="cover-image">${helpers.renderExportImage(imageAssets[coverCapture.id], helpers.getPrimaryEvidenceLabel(coverCapture), "Preview unavailable in printable export. Original evidence retained.")}</div>`;
}

export function buildReportCoverHtml(params: {
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
  branding?: ExportBranding | null;
  logoUrl?: string | null;
  helpers: ReportCoverRenderHelpers;
}) {
  const style = params.branding?.report_style ?? DEFAULT_BRAND_PROFILE.report_style;
  if (style.coverPage === "none") return "";
  const rows = [
    { label: "Customer / Client", value: getReportInfoValue(params.draft, params.session, "customer_client") || params.session.customer_name || "" },
    { label: "Subject", value: getReportInfoValue(params.draft, params.session, "subject_name") || "" },
    { label: "Asset / Equipment", value: getReportInfoValue(params.draft, params.session, "asset_equipment") || params.session.asset_label || params.session.unit_number || "" },
    { label: "Location", value: getReportInfoValue(params.draft, params.session, "location") },
    { label: "Report ID", value: params.session.display_id ?? "" },
    { label: "Reference / File Note", value: getReportInfoValue(params.draft, params.session, "reference_number") },
    { label: "Report Date", value: formatDateTimeInTimeZone(params.draft?.updated_at ?? params.session.updated_at ?? params.session.created_at, params.timeZone) },
    { label: "Organization", value: getOrganizationDisplayName(params.organizationName, params.companyProfile) },
  ];
  rows.push(...buildCustomFieldRows(params.branding ?? null, params.draft, "showInCover"));
  const coverImageHtml = getCoverImageHtml(params.captures, params.imageAssets, params.allowCoverImage && style.showCoverImage && style.coverImageSource !== "none", params.helpers);
  const brand = params.branding;
  const brandName = brand?.display_name?.trim();
  const logoHtml = params.logoUrl ? `<img class="brand-report-logo" src="${escapeHtmlAttributeRaw(params.logoUrl)}" alt="${escapeHtmlAttributeRaw(brandName || params.organizationName)} logo" />` : "";
  const visibleLogoHtml = style.showCoverLogo ? logoHtml : "";
  const identityHtml = brand && style.showCoverCompanyInfo ? `<div class="brand-report-identity">${visibleLogoHtml}<div><strong>${escapeHtml(brandName || params.organizationName)}</strong>${brand.tagline ? `<p>${escapeHtml(brand.tagline)}</p>` : ""}<p>${escapeHtml([brand.phone, brand.email, brand.website].filter(Boolean).join(" · "))}</p>${brand.address ? `<p>${escapeHtml(brand.address)}</p>` : ""}</div></div>` : "";
  return `<section class="report-cover item branded-cover branded-cover-${escapeHtmlAttributeRaw(brand?.header_layout || "classic")}${coverImageHtml ? "" : " report-cover-no-image"}"><div class="cover-copy">${identityHtml}<div class="cover-kicker"><span>Documentation Report</span><span>${escapeHtml(params.reportType)}</span></div>${style.showCoverTitle ? `<h1>${escapeHtml(params.reportTitle)}</h1>` : ""}<p class="cover-trust">${escapeHtml(brand?.tagline || "Report identity and approved customer-facing documentation.")}</p>${params.helpers.renderDefinitionRows(rows)}</div>${coverImageHtml}</section>`;
}
