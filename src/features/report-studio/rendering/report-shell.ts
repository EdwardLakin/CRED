import { DEFAULT_BRAND_PROFILE } from "@/features/branding/types";
import { formatDateTimeInTimeZone } from "@/lib/date-format";
import { escapeHtmlAttributeRaw } from "./html";
import { buildWatermarkHtml } from "./report-watermark";
import type { ExportBranding } from "./types";

export function buildReportShellClasses(branding?: ExportBranding | null) {
  const brand = branding ?? DEFAULT_BRAND_PROFILE;
  return [
    "report",
    `theme-${brand.colors.primary.replace("#", "")}`,
    `typography-${brand.typography.preset}`,
    `header-${brand.header_layout}`,
    `footer-${brand.footer_layout}`,
    `section-${brand.report_style.sectionStyle}`,
    `evidence-${brand.report_style.evidenceStyle}`,
    `image-${brand.report_style.evidenceImageSize}`,
    `signature-${brand.report_style.signatureLayout}`,
  ].join(" ");
}

export function buildReportOpen(params: { branding?: ExportBranding | null; timeZone: string | null }) {
  return `<main class="${escapeHtmlAttributeRaw(buildReportShellClasses(params.branding))}" data-generated-at="${escapeHtmlAttributeRaw(formatDateTimeInTimeZone(new Date().toISOString(), params.timeZone))}">${buildWatermarkHtml(params.branding)}`;
}
