import { formatDateTimeInTimeZone } from "@/lib/date-format";
import { escapeHtml, escapeHtmlAttributeRaw } from "./html";
import type { ExportBranding, ReportDraft, ReportSession, ReportSignature } from "./types";

export type ReportSignatureRenderHelpers = {
  renderDefinitionRows: (rows: Array<{ label: string; value: string }>) => string;
  getApprovalDate: (draft: ReportDraft | null | undefined, session: ReportSession) => string | null;
};

export function buildApprovalHtml(params: {
  profile: {
    full_name?: string | null;
    inspector_role_or_title?: string | null;
  } | null;
  signatures: ReportSignature[];
  signatureUrls: Record<string, string>;
  draft: ReportDraft | null;
  session: ReportSession;
  timeZone: string | null;
  branding?: ExportBranding | null;
  helpers: ReportSignatureRenderHelpers;
}) {
  if (params.branding?.show_signature_block === false) return "";
  const enabledBlocks = params.branding?.report_style.signatureBlocks?.filter((block) => block.enabled) ?? [];
  const signature =
    params.signatures.find((item) =>
      /inspector|technician/i.test(item.signature_type),
    ) ?? params.signatures[0];
  const signatureUrl = signature
    ? params.signatureUrls[signature.id]
    : params.signatureUrls.__default_signature;
  const approvedAt =
    params.helpers.getApprovalDate(params.draft, params.session) ??
    signature?.signed_at ??
    null;
  const rows = [
    {
      label: params.branding?.report_style?.reviewedByLabel || "Approved by",
      value: signature?.signer_name || params.branding?.prepared_by_name || params.profile?.full_name || "",
    },
    {
      label: "Role / Title",
      value:
        params.profile?.inspector_role_or_title ||
        signature?.signature_type?.replace(/_/g, " ") ||
        "",
    },
    ...(params.branding?.report_style?.signatureDate === false ? [] : [{
      label: "Approved date / time",
      value: approvedAt
        ? formatDateTimeInTimeZone(approvedAt, params.timeZone)
        : "",
    }]),
  ];
  const typedSignature = params.branding?.report_style?.typedSignature?.trim();
  const sig = signatureUrl
    ? `<div class="signature-block approval-signature"><p class="signature-label">Signature</p><img class="signature-image" src="${escapeHtmlAttributeRaw(signatureUrl)}" alt="Approval signature" /></div>`
    : typedSignature
      ? `<div class="signature-block approval-signature"><p class="signature-label">Signature</p><p>${escapeHtml(typedSignature)}</p></div>`
      : '<div class="signature-block signature-empty"><p class="signature-label">Signature</p><p class="muted">No signature captured</p></div>';
  const blockHtml = enabledBlocks.slice(1).map((block) => `<div class="signature-block signature-empty"><p class="signature-label">${escapeHtml(block.label)}</p>${block.showSignatureLine ? `<p class="signature-line">${escapeHtml(block.typedName || "")}</p>` : ""}${block.showDate ? `<p class="muted">Date</p>` : ""}</div>`).join("");
  return `<section class="item service-section approval-section signoff-section"><div class="section-heading"><p class="eyebrow">Formal sign-off</p><h2>Approval</h2></div><div class="approval-grid"><div>${params.helpers.renderDefinitionRows(rows)}</div>${sig}</div>${blockHtml}</section>`;
}
