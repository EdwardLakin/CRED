import { escapeHtml, escapeHtmlAttributeRaw } from "./html";
import type { ExportBranding } from "./types";

export function getWatermarkText(branding?: ExportBranding | null) {
  const watermark = branding?.report_style.watermark;
  if (!watermark || watermark.option === "none") return "";
  if (watermark.option === "custom_text") return watermark.text.trim();
  return watermark.option.replace(/_/g, " ").toUpperCase();
}

export function buildWatermarkHtml(branding?: ExportBranding | null) {
  const text = getWatermarkText(branding);
  if (!text) return "";
  return `<div class="report-watermark watermark-${escapeHtmlAttributeRaw(branding?.report_style.watermark.placement ?? "diagonal")} watermark-${escapeHtmlAttributeRaw(branding?.report_style.watermark.opacity ?? "subtle")}" aria-hidden="true">${escapeHtml(text)}</div>`;
}
