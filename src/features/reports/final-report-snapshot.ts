import { cleanCustomerFacingText } from "@/features/reports/customer-facing-text";

export const FINAL_REPORT_SNAPSHOT_VERSION = 1 as const;

export type FinalReportMediaKind =
  | "photo"
  | "document"
  | "note"
  | "video"
  | "audio"
  | "file";

export type FinalReportDetail = Readonly<{
  label: string;
  value: string;
}>;

export type FinalReportMedia = Readonly<{
  id: string;
  kind: FinalReportMediaKind;
  label: string;
  capturedAt: string | null;
}>;

export type FinalReportItem = Readonly<{
  id: string;
  title: string;
  description: string;
  category: string | null;
  details: readonly FinalReportDetail[];
  recommendations: readonly string[];
  mediaIds: readonly string[];
}>;

export type FinalReportDocument = Readonly<{
  id: string;
  title: string;
  summary: string;
  details: readonly FinalReportDetail[];
  mediaId: string | null;
}>;

export type FinalReportSection = Readonly<{
  id: string;
  title: string;
  summary: string;
  rows: readonly FinalReportDetail[];
}>;

export type FinalReportApproval = Readonly<{
  status: "Approved" | "In review";
  approvedAt: string | null;
  reviewedBy: string | null;
}>;

export type FinalReportSnapshot = Readonly<{
  schemaVersion: typeof FINAL_REPORT_SNAPSHOT_VERSION;
  sourceDraftId: string | null;
  sessionId: string;
  reportId: string;
  organizationName: string;
  reportTitle: string;
  reportType: string;
  reportDate: string;
  summary: string;
  identity: readonly FinalReportDetail[];
  media: readonly FinalReportMedia[];
  items: readonly FinalReportItem[];
  documents: readonly FinalReportDocument[];
  sections: readonly FinalReportSection[];
  approval: FinalReportApproval;
  totals: Readonly<{
    items: number;
    photos: number;
    documents: number;
  }>;
}>;

export type FinalReportSnapshotInput = Readonly<{
  sourceDraftId?: string | null;
  sessionId: string;
  reportId?: string | null;
  organizationName: string;
  reportTitle: string;
  reportType?: string | null;
  reportDate: string;
  summary?: string | null;
  identity?: readonly FinalReportDetail[];
  media?: readonly FinalReportMedia[];
  items?: readonly FinalReportItem[];
  documents?: readonly FinalReportDocument[];
  sections?: readonly FinalReportSection[];
  status?: string | null;
  approved?: boolean;
  approvedAt?: string | null;
  reviewedBy?: string | null;
}>;

const RAW_FILE_NAME =
  /^(?:image|photo|scan|document|file|img|dsc|pxl|screenshot)?[-_ ]?[a-z0-9-]*\.(?:jpe?g|png|webp|gif|heic|pdf|docx?|xlsx?|csv)$/i;
const INTERNAL_REPORT_URL =
  /(?:https?:\/\/[^\s]+)?\/api\/dashboard\/sessions\/[^\s)]+/gi;

export function cleanFinalReportText(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || RAW_FILE_NAME.test(trimmed)) return "";

  const withoutInternalLinks = trimmed
    .replace(INTERNAL_REPORT_URL, "")
    .replace(/\bevidence report\b/gi, "documentation report")
    .replace(/\bevidence appendix\b/gi, "source index")
    .replace(/\bevidence id\b/gi, "item reference")
    .replace(/\bevidence photo\b/gi, "supporting photo")
    .replace(/\bevidence video\b/gi, "supporting video")
    .replace(/\bsupporting evidence\b/gi, "supporting item")
    .replace(/\bneeds_review\b/gi, "requires review")
    .replace(/\bready_for_delivery\b/gi, "approved")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!withoutInternalLinks || RAW_FILE_NAME.test(withoutInternalLinks))
    return "";
  return cleanCustomerFacingText(withoutInternalLinks);
}

export function getFinalReportStatus(params: {
  status?: string | null;
  approved?: boolean;
}): FinalReportApproval["status"] {
  if (params.approved) return "Approved";
  const normalized = params.status?.trim().toLowerCase();
  if (
    normalized === "approved" ||
    normalized === "final" ||
    normalized === "reviewed" ||
    normalized === "ready_for_delivery"
  )
    return "Approved";
  return "In review";
}

function cleanDetails(rows: readonly FinalReportDetail[] | undefined) {
  return (rows ?? []).flatMap((row) => {
    const label = cleanFinalReportText(row.label).replace(/[.]$/, "");
    const value = cleanFinalReportText(row.value);
    if (!label || !value) return [];
    return [{ label, value }];
  });
}

function uniqueStrings(values: readonly string[] | undefined) {
  const seen = new Set<string>();
  return (values ?? []).flatMap((value) => {
    const cleaned = cleanFinalReportText(value);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) return [];
    seen.add(key);
    return [cleaned];
  });
}

function fallbackSummary(reportTitle: string) {
  const subject = reportTitle.replace(/[.]$/, "");
  return `This ${subject} presents the reviewed conditions, supporting photographs, source documents, and approved next actions recorded during the session.`;
}

export function buildFinalReportSnapshot(
  input: FinalReportSnapshotInput,
): FinalReportSnapshot {
  const mediaById = new Map<string, FinalReportMedia>();
  for (const entry of input.media ?? []) {
    if (!entry.id || mediaById.has(entry.id)) continue;
    mediaById.set(entry.id, {
      id: entry.id,
      kind: entry.kind,
      label: cleanFinalReportText(entry.label) || "Supporting item",
      capturedAt: entry.capturedAt,
    });
  }

  const itemIds = new Set<string>();
  const items = (input.items ?? []).flatMap((item, index) => {
    if (!item.id || itemIds.has(item.id)) return [];
    itemIds.add(item.id);
    const mediaIds = Array.from(
      new Set(item.mediaIds.filter((id) => mediaById.has(id))),
    );
    const description = cleanFinalReportText(item.description);
    return [
      {
        id: item.id,
        title:
          cleanFinalReportText(item.title) ||
          `Documented item ${String(index + 1).padStart(2, "0")}`,
        description,
        category: cleanFinalReportText(item.category)?.replace(/[.]$/, "") || null,
        details: cleanDetails(item.details),
        recommendations: uniqueStrings(item.recommendations),
        mediaIds,
      },
    ];
  });

  const documentIds = new Set<string>();
  const documents = (input.documents ?? []).flatMap((document, index) => {
    if (!document.id || documentIds.has(document.id)) return [];
    documentIds.add(document.id);
    return [
      {
        id: document.id,
        title:
          cleanFinalReportText(document.title) ||
          `Form or document ${String(index + 1).padStart(2, "0")}`,
        summary: cleanFinalReportText(document.summary),
        details: cleanDetails(document.details),
        mediaId:
          document.mediaId && mediaById.has(document.mediaId)
            ? document.mediaId
            : null,
      },
    ];
  });

  const sections = (input.sections ?? []).flatMap((section, index) => {
    const title = cleanFinalReportText(section.title).replace(/[.]$/, "");
    const summary = cleanFinalReportText(section.summary);
    const rows = cleanDetails(section.rows);
    if (!title || (!summary && rows.length === 0)) return [];
    return [
      {
        id: section.id || `section-${index + 1}`,
        title,
        summary,
        rows,
      },
    ];
  });

  const reportTitle =
    cleanFinalReportText(input.reportTitle).replace(/[.]$/, "") ||
    "Executive Report";
  const status = getFinalReportStatus({
    status: input.status,
    approved: input.approved,
  });
  const itemPhotoIds = new Set(
    items.flatMap((item) =>
      item.mediaIds.filter((id) => mediaById.get(id)?.kind === "photo"),
    ),
  );

  return {
    schemaVersion: FINAL_REPORT_SNAPSHOT_VERSION,
    sourceDraftId: input.sourceDraftId ?? null,
    sessionId: input.sessionId,
    reportId:
      cleanFinalReportText(input.reportId) ||
      cleanFinalReportText(input.sessionId) ||
      "Report",
    organizationName:
      cleanFinalReportText(input.organizationName).replace(/[.]$/, "") ||
      "CRED",
    reportTitle,
    reportType:
      cleanFinalReportText(input.reportType).replace(/[.]$/, "") ||
      "Documentation Report",
    reportDate: cleanFinalReportText(input.reportDate).replace(/[.]$/, ""),
    summary:
      cleanFinalReportText(input.summary) || fallbackSummary(reportTitle),
    identity: cleanDetails(input.identity),
    media: Array.from(mediaById.values()),
    items,
    documents,
    sections,
    approval: {
      status,
      approvedAt:
        status === "Approved"
          ? cleanFinalReportText(input.approvedAt).replace(/[.]$/, "") || null
          : null,
      reviewedBy:
        status === "Approved"
          ? cleanFinalReportText(input.reviewedBy).replace(/[.]$/, "") || null
          : null,
    },
    totals: {
      items: items.length,
      photos: itemPhotoIds.size,
      documents: documents.length,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseFinalReportSnapshot(
  value: unknown,
): FinalReportSnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== FINAL_REPORT_SNAPSHOT_VERSION)
    return null;
  if (
    typeof value.sessionId !== "string" ||
    typeof value.reportId !== "string" ||
    typeof value.organizationName !== "string" ||
    typeof value.reportTitle !== "string" ||
    typeof value.reportType !== "string" ||
    typeof value.reportDate !== "string" ||
    typeof value.summary !== "string" ||
    !Array.isArray(value.identity) ||
    !Array.isArray(value.media) ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.documents) ||
    !Array.isArray(value.sections) ||
    !isRecord(value.approval) ||
    !isRecord(value.totals)
  )
    return null;
  if (
    (value.approval.status !== "Approved" &&
      value.approval.status !== "In review") ||
    typeof value.totals.items !== "number" ||
    typeof value.totals.photos !== "number" ||
    typeof value.totals.documents !== "number"
  )
    return null;
  return value as unknown as FinalReportSnapshot;
}
