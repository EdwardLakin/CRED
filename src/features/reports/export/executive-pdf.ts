import PDFDocument from "pdfkit";

import type { WorkspaceBrandProfile } from "@/features/branding/types";
import type {
  FinalReportDetail,
  FinalReportSnapshot,
} from "@/features/reports/final-report-snapshot";

export type ExecutivePdfAssets = Readonly<{
  logo?: Buffer | null;
  media?: Readonly<Record<string, Buffer | null | undefined>>;
}>;

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 52;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const CONTENT_BOTTOM = PAGE_HEIGHT - 62;

type ExecutivePdfStyle = WorkspaceBrandProfile["report_style"];

function getExecutiveStyle(branding: WorkspaceBrandProfile) {
  return branding.report_style as ExecutivePdfStyle | undefined;
}

function getWatermarkText(style: ExecutivePdfStyle | undefined) {
  const watermark = style?.watermark;
  if (!watermark || watermark.option === "none") return "";
  if (watermark.draftOnly) return "";
  if (watermark.option === "custom_text") return watermark.text.trim();
  return watermark.option.toUpperCase();
}

function safeHex(value: string | null | undefined, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback;
}

function collectPdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer | Uint8Array) =>
      chunks.push(Buffer.from(chunk)),
    );
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed <= CONTENT_BOTTOM) return;
  doc.addPage();
}

function sectionHeading(
  doc: PDFKit.PDFDocument,
  title: string,
  primary: string,
) {
  ensureSpace(doc, 52);
  doc
    .moveTo(MARGIN_X, doc.y)
    .lineTo(MARGIN_X + 28, doc.y)
    .lineWidth(3)
    .strokeColor(primary)
    .stroke();
  doc.moveDown(0.65);
  doc
    .font("Helvetica-Bold")
    .fontSize(15)
    .fillColor("#172033")
    .text(title, MARGIN_X, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.7);
}

function drawDetailRows(
  doc: PDFKit.PDFDocument,
  rows: readonly FinalReportDetail[],
  options: { columns?: 1 | 2; muted?: string } = {},
) {
  if (!rows.length) return;
  const columns = options.columns ?? 2;
  const gap = 18;
  const width = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  rows.forEach((row, index) => {
    const column = index % columns;
    if (column === 0) ensureSpace(doc, 42);
    const x = MARGIN_X + column * (width + gap);
    const y = doc.y;
    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(options.muted ?? "#667085")
      .text(row.label.toUpperCase(), x, y, { width, characterSpacing: 0.6 });
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor("#172033")
      .text(row.value, x, y + 13, { width, lineGap: 1 });
    if (column === columns - 1 || index === rows.length - 1) {
      const pair = rows.slice(index - column, index - column + columns);
      const maxLines = Math.max(
        ...pair.map((entry) =>
          doc.heightOfString(entry.value, { width, lineGap: 1 }),
        ),
      );
      doc.y = y + Math.max(36, 17 + maxLines) + 8;
    }
  });
}

function drawImage(
  doc: PDFKit.PDFDocument,
  asset: Buffer | null | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  border: string,
) {
  doc
    .roundedRect(x, y, width, height, 7)
    .fillAndStroke("#F5F7FA", border);
  if (!asset) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#7A8495")
      .text("Preview unavailable", x + 10, y + height / 2 - 5, {
        width: width - 20,
        align: "center",
      });
    return;
  }
  try {
    doc.image(asset, x + 4, y + 4, {
      fit: [width - 8, height - 8],
      align: "center",
      valign: "center",
    });
  } catch {
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#7A8495")
      .text("Preview unavailable", x + 10, y + height / 2 - 5, {
        width: width - 20,
        align: "center",
      });
  }
}

function drawItemMedia(
  doc: PDFKit.PDFDocument,
  mediaIds: readonly string[],
  assets: ExecutivePdfAssets,
  border: string,
  style: ExecutivePdfStyle | undefined,
) {
  if (!mediaIds.length) return;
  const size = style?.evidenceImageSize ?? "standard";
  const height =
    size === "compact" ? 112 : size === "large" ? 214 : size === "full_width" ? 260 : 158;
  const gridStyle = [
    "two_column_photo_grid",
    "insurance_photo_grid",
    "photo_grid",
  ].includes(style?.evidenceStyle ?? "");
  if (gridStyle) {
    const gap = 10;
    const width = (CONTENT_WIDTH - gap) / 2;
    const cellHeight = Math.min(height, 170);
    for (let index = 0; index < mediaIds.length; index += 2) {
      ensureSpace(doc, cellHeight + gap);
      const rowY = doc.y;
      mediaIds.slice(index, index + 2).forEach((id, column) => {
        drawImage(
          doc,
          assets.media?.[id],
          MARGIN_X + column * (width + gap),
          rowY,
          width,
          cellHeight,
          border,
        );
      });
      doc.y = rowY + cellHeight + gap;
    }
    doc.y += 4;
    return;
  }

  ensureSpace(doc, height + 14);
  const primaryY = doc.y;
  const primaryWidth = Math.min(
    CONTENT_WIDTH,
    mediaIds.length === 1 && size !== "full_width" ? 360 : CONTENT_WIDTH,
  );
  drawImage(
    doc,
    assets.media?.[mediaIds[0]],
    MARGIN_X,
    primaryY,
    primaryWidth,
    height,
    border,
  );
  doc.y = primaryY + height + 10;

  const remaining = mediaIds.slice(1);
  if (remaining.length) {
    const gap = 10;
    const thumbWidth = (CONTENT_WIDTH - gap) / 2;
    const thumbHeight =
      size === "compact" ? 96 : size === "large" ? 145 : size === "full_width" ? 155 : 118;
    for (let index = 0; index < remaining.length; index += 2) {
      ensureSpace(doc, thumbHeight + gap);
      const rowY = doc.y;
      remaining.slice(index, index + 2).forEach((id, column) => {
        drawImage(
          doc,
          assets.media?.[id],
          MARGIN_X + column * (thumbWidth + gap),
          rowY,
          thumbWidth,
          thumbHeight,
          border,
        );
      });
      doc.y = rowY + thumbHeight + gap;
    }
  }
  doc.y += 4;
}

function drawCompactOpening(
  doc: PDFKit.PDFDocument,
  snapshot: FinalReportSnapshot,
  branding: WorkspaceBrandProfile,
  assets: ExecutivePdfAssets,
  primary: string,
  accent: string,
  border: string,
  muted: string,
) {
  const style = getExecutiveStyle(branding);
  if (assets.logo && style?.showCoverLogo !== false) {
    try {
      doc.image(assets.logo, MARGIN_X, 46, { fit: [122, 38] });
    } catch {
      // Text identity remains available.
    }
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(accent)
    .text(snapshot.organizationName, MARGIN_X, 50, {
      width: CONTENT_WIDTH,
      align: "right",
    });
  doc
    .moveTo(MARGIN_X, 98)
    .lineTo(PAGE_WIDTH - MARGIN_X, 98)
    .lineWidth(1)
    .strokeColor(border)
    .stroke();
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(primary)
    .text(snapshot.reportType.toUpperCase(), MARGIN_X, 118, {
      characterSpacing: 1,
    });
  doc
    .font("Times-Bold")
    .fontSize(24)
    .fillColor("#172033")
    .text(snapshot.reportTitle, MARGIN_X, 137, { width: CONTENT_WIDTH });
  doc.moveDown(0.6);
  drawDetailRows(
    doc,
    [
      { label: "Report reference", value: snapshot.reportId },
      { label: "Report date", value: snapshot.reportDate },
      ...snapshot.identity,
    ].slice(0, 6),
    { columns: 2 },
  );
  ensureSpace(doc, 98);
  const summaryHeight = Math.max(
    80,
    doc.heightOfString(snapshot.summary, {
      width: CONTENT_WIDTH - 32,
      lineGap: 3,
    }) + 42,
  );
  doc.roundedRect(MARGIN_X, doc.y, CONTENT_WIDTH, summaryHeight, 9).fill(muted);
  const summaryY = doc.y;
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(primary)
    .text("EXECUTIVE SUMMARY", MARGIN_X + 16, summaryY + 15, {
      characterSpacing: 0.9,
    });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#263044")
    .text(snapshot.summary, MARGIN_X + 16, summaryY + 36, {
      width: CONTENT_WIDTH - 32,
      lineGap: 3,
    });
  doc.y = summaryY + summaryHeight + 24;
}

function drawCover(
  doc: PDFKit.PDFDocument,
  snapshot: FinalReportSnapshot,
  branding: WorkspaceBrandProfile,
  assets: ExecutivePdfAssets,
  primary: string,
  accent: string,
  border: string,
  muted: string,
) {
  const style = getExecutiveStyle(branding);
  const coverBackground = safeHex(style?.coverBackgroundColor, "#FFFFFF");
  if (coverBackground !== "#FFFFFF") {
    doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(coverBackground);
  }
  if (assets.logo && style?.showCoverLogo !== false) {
    try {
      doc.image(assets.logo, MARGIN_X, 45, {
        fit: [150, 46],
        valign: "center",
      });
    } catch {
      // The organization name remains the accessible identity fallback.
    }
  }
  if (style?.showCoverCompanyInfo !== false) {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(accent)
      .text(snapshot.organizationName, MARGIN_X, 50, {
        width: CONTENT_WIDTH,
        align: "right",
      });
  }
  if (branding.tagline && style?.showCoverCompanyInfo !== false) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#667085")
      .text(branding.tagline, MARGIN_X, 66, {
        width: CONTENT_WIDTH,
        align: "right",
      });
  }
  doc
    .moveTo(MARGIN_X, 101)
    .lineTo(PAGE_WIDTH - MARGIN_X, 101)
    .lineWidth(1)
    .strokeColor(border)
    .stroke();

  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(primary)
    .text("EXECUTIVE REPORT", MARGIN_X, 134, {
      characterSpacing: 1.5,
    });
  if (style?.showCoverTitle !== false) {
    doc
      .font("Times-Bold")
      .fontSize(31)
      .fillColor("#111827")
      .text(snapshot.reportTitle, MARGIN_X, 158, {
        width: 388,
        lineGap: 2,
        align: style?.coverTitleAlignment ?? "left",
      });
  }
  const titleBottom = doc.y;
  doc
    .roundedRect(PAGE_WIDTH - MARGIN_X - 92, 158, 92, 27, 13.5)
    .fill(snapshot.approval.status === "Approved" ? "#E8F7EF" : "#FFF5DB");
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(snapshot.approval.status === "Approved" ? "#167A4A" : "#946200")
    .text(snapshot.approval.status.toUpperCase(), PAGE_WIDTH - MARGIN_X - 86, 167, {
      width: 80,
      align: "center",
      characterSpacing: 0.7,
    });

  doc.y = Math.max(titleBottom + 28, 242);
  const coverRows = [
    ...(style?.showCoverReportId === false
      ? []
      : [{ label: "Report reference", value: snapshot.reportId }]),
    ...(style?.showCoverDate === false
      ? []
      : [{ label: "Report date", value: snapshot.reportDate }]),
    ...snapshot.identity.filter((row) => {
      if (/customer|client/i.test(row.label)) return style?.showCoverClient !== false;
      if (/asset|equipment|subject/i.test(row.label)) return style?.showCoverAsset !== false;
      if (/location|address/i.test(row.label)) return style?.showCoverLocation !== false;
      return true;
    }),
  ].slice(0, 8);
  drawDetailRows(doc, coverRows, { columns: 2, muted: "#667085" });

  const summaryY = Math.max(doc.y + 8, 356);
  const summaryHeight = Math.max(
    128,
    doc.heightOfString(snapshot.summary, {
      width: CONTENT_WIDTH - 36,
      lineGap: 4,
    }) + 58,
  );
  doc
    .roundedRect(MARGIN_X, summaryY, CONTENT_WIDTH, summaryHeight, 10)
    .fill(muted);
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(primary)
    .text("EXECUTIVE SUMMARY", MARGIN_X + 18, summaryY + 18, {
      characterSpacing: 1,
    });
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#263044")
    .text(snapshot.summary, MARGIN_X + 18, summaryY + 41, {
      width: CONTENT_WIDTH - 36,
      lineGap: 4,
    });

  const metricsY = summaryY + summaryHeight + 24;
  const metrics = [
    ["Documented items", String(snapshot.totals.items)],
    ["Supporting photos", String(snapshot.totals.photos)],
    ["Forms & documents", String(snapshot.totals.documents)],
  ];
  const metricWidth = (CONTENT_WIDTH - 18) / 3;
  metrics.forEach(([label, value], index) => {
    const x = MARGIN_X + index * (metricWidth + 9);
    doc.roundedRect(x, metricsY, metricWidth, 62, 8).strokeColor(border).stroke();
    doc
      .font("Times-Bold")
      .fontSize(20)
      .fillColor(accent)
      .text(value, x + 12, metricsY + 10, { width: metricWidth - 24 });
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor("#667085")
      .text(label.toUpperCase(), x + 12, metricsY + 38, {
        width: metricWidth - 24,
        characterSpacing: 0.5,
      });
  });
  doc.y = metricsY + 76;
}

function drawItems(
  doc: PDFKit.PDFDocument,
  snapshot: FinalReportSnapshot,
  assets: ExecutivePdfAssets,
  primary: string,
  border: string,
  branding: WorkspaceBrandProfile,
  startOnNewPage = true,
) {
  if (!snapshot.items.length) return;
  const style = getExecutiveStyle(branding);
  if (startOnNewPage) doc.addPage();
  sectionHeading(doc, "Documented Items", primary);
  snapshot.items.forEach((item, index) => {
    ensureSpace(doc, 98);
    const startY = doc.y;
    if (style?.evidenceNumbering !== false) {
      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor(primary)
        .text(`ITEM ${String(index + 1).padStart(2, "0")}`, MARGIN_X, startY, {
          characterSpacing: 1,
        });
    }
    if (item.category) {
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor("#667085")
        .text(item.category.toUpperCase(), MARGIN_X, startY, {
          width: CONTENT_WIDTH,
          align: "right",
          characterSpacing: 0.5,
        });
    }
    doc
      .font("Times-Bold")
      .fontSize(17)
      .fillColor("#172033")
      .text(item.title, MARGIN_X, startY + 18, { width: CONTENT_WIDTH });
    doc.y += 7;
    if (item.description) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#374151")
        .text(item.description, MARGIN_X, doc.y, {
          width: CONTENT_WIDTH,
          lineGap: 3,
        });
      doc.moveDown(0.7);
    }
    drawItemMedia(doc, item.mediaIds, assets, border, style);
    drawDetailRows(
      doc,
      item.details.filter(
        (detail) => style?.timestamps !== false || !/captured|date|time/i.test(detail.label),
      ),
      { columns: 2 },
    );
    if (item.recommendations.length) {
      ensureSpace(doc, 44);
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#667085")
        .text("NEXT ACTION", MARGIN_X, doc.y, { characterSpacing: 0.8 });
      doc.moveDown(0.35);
      item.recommendations.forEach((recommendation) => {
        ensureSpace(doc, 24);
        doc
          .font("Helvetica")
          .fontSize(9.5)
          .fillColor("#263044")
          .text(`-  ${recommendation}`, MARGIN_X + 3, doc.y, {
            width: CONTENT_WIDTH - 3,
            lineGap: 2,
          });
        doc.moveDown(0.25);
      });
    }
    doc.moveDown(0.8);
    doc
      .moveTo(MARGIN_X, doc.y)
      .lineTo(PAGE_WIDTH - MARGIN_X, doc.y)
      .lineWidth(0.6)
      .strokeColor(border)
      .stroke();
    doc.moveDown(1.1);
  });
}

function drawDocuments(
  doc: PDFKit.PDFDocument,
  snapshot: FinalReportSnapshot,
  assets: ExecutivePdfAssets,
  primary: string,
  border: string,
  branding: WorkspaceBrandProfile,
) {
  if (!snapshot.documents.length) return;
  const style = getExecutiveStyle(branding);
  ensureSpace(doc, 130);
  sectionHeading(doc, "Forms & Documents", primary);
  snapshot.documents.forEach((document, index) => {
    ensureSpace(doc, 106);
    const y = doc.y;
    const previewWidth = document.mediaId ? 112 : 0;
    if (document.mediaId) {
      drawImage(
        doc,
        assets.media?.[document.mediaId],
        MARGIN_X,
        y,
        previewWidth,
        82,
        border,
      );
    }
    const copyX = MARGIN_X + (previewWidth ? previewWidth + 16 : 0);
    const copyWidth = CONTENT_WIDTH - (previewWidth ? previewWidth + 16 : 0);
    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(primary)
      .text(`DOCUMENT ${String(index + 1).padStart(2, "0")}`, copyX, y, {
        width: copyWidth,
        characterSpacing: 0.8,
      });
    doc
      .font("Times-Bold")
      .fontSize(14)
      .fillColor("#172033")
      .text(document.title, copyX, y + 17, { width: copyWidth });
    if (document.summary) {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#4B5563")
        .text(document.summary, copyX, doc.y + 5, {
          width: copyWidth,
          lineGap: 2,
        });
    }
    doc.y = Math.max(doc.y + 9, y + (previewWidth ? 92 : 72));
    drawDetailRows(
      doc,
      document.details.filter(
        (detail) => style?.timestamps !== false || !/captured|date|time/i.test(detail.label),
      ),
      { columns: 2 },
    );
  });
}

function drawSections(
  doc: PDFKit.PDFDocument,
  snapshot: FinalReportSnapshot,
  primary: string,
) {
  snapshot.sections.forEach((section) => {
    ensureSpace(doc, 95);
    sectionHeading(doc, section.title, primary);
    if (section.summary) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#374151")
        .text(section.summary, MARGIN_X, doc.y, {
          width: CONTENT_WIDTH,
          lineGap: 3,
        });
      doc.moveDown(0.7);
    }
    drawDetailRows(doc, section.rows, { columns: 2 });
    doc.moveDown(0.45);
  });
}

function drawApproval(
  doc: PDFKit.PDFDocument,
  snapshot: FinalReportSnapshot,
  primary: string,
  border: string,
) {
  ensureSpace(doc, 142);
  sectionHeading(doc, "Approval", primary);
  const y = doc.y;
  doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, 92, 9).strokeColor(border).stroke();
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(snapshot.approval.status === "Approved" ? "#167A4A" : "#946200")
    .text(snapshot.approval.status, MARGIN_X + 18, y + 17, {
      width: CONTENT_WIDTH - 36,
    });
  const approvalRows = [
    snapshot.approval.reviewedBy
      ? `Reviewed by ${snapshot.approval.reviewedBy}`
      : null,
    snapshot.approval.approvedAt
      ? `Approved ${snapshot.approval.approvedAt}`
      : null,
  ].filter((value): value is string => Boolean(value));
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor("#4B5563")
    .text(
      approvalRows.join("\n") || "Approval is pending.",
      MARGIN_X + 18,
      y + 44,
      { width: CONTENT_WIDTH - 36, lineGap: 3 },
    );
  doc.y = y + 108;
}

function addPageFurniture(
  doc: PDFKit.PDFDocument,
  snapshot: FinalReportSnapshot,
  border: string,
  branding: WorkspaceBrandProfile,
) {
  const style = getExecutiveStyle(branding);
  const watermarkText = getWatermarkText(style);
  const showPageNumber = style ? style.showPageNumber : true;
  const footerLabel =
    branding.footer_text?.trim() ||
    (branding.show_confidentiality_note || style?.showConfidentialityLabel
      ? "Confidential"
      : "");
  const range = doc.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    const originalBottomMargin = doc.page.margins.bottom;
    // Page furniture intentionally sits inside the physical page margin. PDFKit's
    // line wrapper otherwise treats the footer baseline as content overflow and
    // silently appends a blank page for every rendered footer.
    doc.page.margins.bottom = 0;
    if (watermarkText) {
      const opacity =
        style?.watermark.opacity === "strong"
          ? 0.15
          : style?.watermark.opacity === "standard"
            ? 0.1
            : 0.065;
      doc.save();
      doc.opacity(opacity);
      doc
        .font("Helvetica-Bold")
        .fontSize(48)
        .fillColor("#64748B")
        .rotate(style?.watermark.placement === "diagonal" ? -34 : 0, {
          origin: [PAGE_WIDTH / 2, PAGE_HEIGHT / 2],
        })
        .text(watermarkText, 56, PAGE_HEIGHT / 2 - 24, {
          width: PAGE_WIDTH - 112,
          align: "center",
        });
      doc.restore();
    }
    if (pageIndex > 0) {
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor("#7A8495")
        .text(snapshot.organizationName, MARGIN_X, 29, {
          width: CONTENT_WIDTH / 2,
        });
      if (branding.show_report_id) {
        doc.text(snapshot.reportId, MARGIN_X + CONTENT_WIDTH / 2, 29, {
          width: CONTENT_WIDTH / 2,
          align: "right",
        });
      }
      doc
        .moveTo(MARGIN_X, 43)
        .lineTo(PAGE_WIDTH - MARGIN_X, 43)
        .lineWidth(0.5)
        .strokeColor(border)
        .stroke();
    }
    if (footerLabel || showPageNumber || style?.showGeneratedByCred) {
      doc
        .moveTo(MARGIN_X, PAGE_HEIGHT - 42)
        .lineTo(PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 42)
        .lineWidth(0.5)
        .strokeColor(border)
        .stroke();
      doc.font("Helvetica").fontSize(7.5).fillColor("#7A8495");
      if (footerLabel) {
        doc.text(footerLabel, MARGIN_X, PAGE_HEIGHT - 31, {
          width: CONTENT_WIDTH / 2,
        });
      } else if (style?.showGeneratedByCred) {
        doc.text("Generated by CRED", MARGIN_X, PAGE_HEIGHT - 31, {
          width: CONTENT_WIDTH / 2,
        });
      }
      if (showPageNumber) {
        doc.text(`Page ${pageIndex + 1} of ${range.count}`, MARGIN_X, PAGE_HEIGHT - 31, {
          width: CONTENT_WIDTH,
          align: "right",
          lineBreak: false,
        });
      }
    }
    doc.page.margins.bottom = originalBottomMargin;
  }
}

export async function renderExecutiveReportPdf(params: {
  snapshot: FinalReportSnapshot;
  branding: WorkspaceBrandProfile;
  assets?: ExecutivePdfAssets;
}): Promise<Buffer> {
  const { snapshot, branding } = params;
  const assets = params.assets ?? {};
  const primary = safeHex(branding.colors.primary, "#2457C5");
  const accent = safeHex(branding.colors.accent, "#172033");
  const border = safeHex(branding.colors.border, "#D9E0EA");
  const muted = safeHex(branding.colors.mutedBackground, "#F4F6F9");
  const stableDate = new Date(
    snapshot.approval.approvedAt || snapshot.reportDate || "2000-01-01T00:00:00.000Z",
  );
  const creationDate = Number.isNaN(stableDate.getTime())
    ? new Date("2000-01-01T00:00:00.000Z")
    : stableDate;
  const doc = new PDFDocument({
    autoFirstPage: true,
    bufferPages: true,
    compress: true,
    size: "LETTER",
    margins: { top: 56, right: MARGIN_X, bottom: 66, left: MARGIN_X },
    info: {
      Title: snapshot.reportTitle,
      Author: snapshot.organizationName,
      Subject: snapshot.reportType,
      Keywords: "executive report, documented items, supporting photos",
      CreationDate: creationDate,
      ModDate: creationDate,
    },
  });
  const output = collectPdf(doc);

  const style = getExecutiveStyle(branding);
  const hasCover = !style || style.coverPage !== "none";
  if (hasCover) {
    drawCover(doc, snapshot, branding, assets, primary, accent, border, muted);
  } else {
    drawCompactOpening(doc, snapshot, branding, assets, primary, accent, border, muted);
  }
  drawItems(doc, snapshot, assets, primary, border, branding, hasCover);
  drawDocuments(doc, snapshot, assets, primary, border, branding);
  drawSections(doc, snapshot, primary);
  if (!style || style.approvalBlock || branding.show_signature_block) {
    drawApproval(doc, snapshot, primary, border);
  }
  addPageFurniture(doc, snapshot, border, branding);
  doc.end();

  return output;
}
