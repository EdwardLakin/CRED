import { formatDateTimeInTimeZone } from "@/lib/date-format";
import { escapeHtml, escapeHtmlAttributeRaw } from "./html";
import type { ExportBranding, ReportDraft, ReportSession, ReportSignature } from "./types";

export type ReportSignatureRenderHelpers = {
  renderDefinitionRows: (rows: Array<{ label: string; value: string }>) => string;
  getApprovalDate: (draft: ReportDraft | null | undefined, session: ReportSession) => string | null;
};

function getCompletedByLabel(branding?: ExportBranding | null) {
  const configured = branding?.report_style?.reviewedByLabel?.trim();
  if (!configured || /^(reviewed|approved) by$/i.test(configured)) return "Completed by";
  return configured;
}

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
  const approvalDate = params.helpers.getApprovalDate(params.draft, params.session);
  const isCompleted = Boolean(
    signature?.signed_at ||
    approvalDate ||
    params.draft?.status === "approved" ||
    params.session.status === "finalized" ||
    params.session.review_status === "ready_for_delivery" ||
    params.session.review_status === "reviewed",
  );
  const completedAt = signature?.signed_at ?? approvalDate ?? null;
  const completedBy =
    signature?.signer_name ||
    params.branding?.prepared_by_name ||
    params.profile?.full_name ||
    "";
  const primaryLabel = isCompleted ? getCompletedByLabel(params.branding) : "Prepared by";
  const rows = [
    {
      label: primaryLabel,
      value: completedBy,
    },
    {
      label: "Role / Title",
      value:
        params.profile?.inspector_role_or_title ||
        signature?.signature_type?.replace(/_/g, " ") ||
        "",
    },
    ...(params.branding?.report_style?.signatureDate === false ? [] : [{
      label: isCompleted ? "Completed date / time" : "Date / time",
      value: completedAt
        ? formatDateTimeInTimeZone(completedAt, params.timeZone)
        : "",
    }]),
  ];
  const typedSignature = params.branding?.report_style?.typedSignature?.trim();
  const sig = signatureUrl
    ? `<div class="signature-block approval-signature"><p class="signature-label">Signature</p><img class="signature-image" src="${escapeHtmlAttributeRaw(signatureUrl)}" alt="Signature of ${escapeHtmlAttributeRaw(completedBy || "report author")}" /></div>`
    : typedSignature
      ? `<div class="signature-block approval-signature"><p class="signature-label">Signature</p><p>${escapeHtml(typedSignature)}</p></div>`
      : '<div class="signature-block signature-empty"><p class="signature-label">Signature</p><p class="muted">No signature captured</p></div>';
  const blockHtml = enabledBlocks.slice(1).map((block) => `<div class="signature-block signature-empty"><p class="signature-label">${escapeHtml(block.label)}</p>${block.showSignatureLine ? `<p class="signature-line">${escapeHtml(block.typedName || "")}</p>` : ""}${block.showDate ? `<p class="muted">Date</p>` : ""}</div>`).join("");
  const eyebrow = isCompleted ? "Report completion" : "Report sign-off";
  const heading = isCompleted ? "Completed" : "Sign-off";
  return `<section class="item service-section approval-section signoff-section"><div class="section-heading"><p class="eyebrow">${eyebrow}</p><h2>${heading}</h2></div><div class="approval-grid"><div>${params.helpers.renderDefinitionRows(rows)}</div>${sig}</div>${blockHtml}</section>`;
}
