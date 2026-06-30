import { stripConfidenceText } from "@/features/reports/report-structure";

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

export function customerText(value: unknown) {
  return stripConfidenceText(String(value ?? ""))
    .replace(/Capture ID\s*:?\s*/gi, "Evidence ")
    .replace(UUID_PATTERN, "evidence item");
}

export function escapeHtml(value: unknown) {
  return customerText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeHtmlAttributeRaw(value: unknown) {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
