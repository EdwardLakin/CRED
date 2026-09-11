import PDFDocument from "pdfkit";

import type { WorkspaceBrandProfile } from "@/features/branding/types";
import type { FinalReportDetail, FinalReportSnapshot } from "@/features/reports/final-report-snapshot";

export type ExecutivePdfAssets = Readonly<{
  logo?: Buffer | null;
  signature?: Buffer | null;
  media?: Readonly<Record<string, Buffer | null | undefined>>;
}>;

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 52;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const CONTENT_BOTTOM = PAGE_HEIGHT - 62;

type ExecutivePdfStyle = WorkspaceBrandProfile["report_style"];
type FontPair = Readonly<{ regular: string; bold: string }>;
type PdfTheme = Readonly<{
  primary: string;
  accent: string;
  evidenceAccent: string;
  border: string;
  muted: string;
  heading: string;
  headerBackground: string;
  headerText: string;
  footerBackground: string;
  footerText: string;
  fonts: Readonly<{
    cover: FontPair;
    header: FontPair;
    section: FontPair;
    body: FontPair;
    evidenceTitle: FontPair;
    evidenceNote: FontPair;
    footer: FontPair;
    signature: FontPair;
  }>;
  sectionGap: number;
}>;

function safeHex(value: string | null | undefined, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function pdfFontFromStack(stack: string | null | undefined, bold = false) {
  const value = (stack ?? "").toLowerCase();
  if (/courier|mono|menlo|consolas/.test(value)) return bold ? "Courier-Bold" : "Courier";
  if (/georgia|times|serif|garamond|baskerville|palatino|merriweather/.test(value)) return bold ? "Times-Bold" : "Times-Roman";
  return bold ? "Helvetica-Bold" : "Helvetica";
}

function fontPair(stack: string | null | undefined): FontPair {
  return { regular: pdfFontFromStack(stack), bold: pdfFontFromStack(stack, true) };
}

function buildTheme(branding: WorkspaceBrandProfile): PdfTheme {
  const style = branding.report_style;
  const area = (branding.typography as { areaStacks?: Record<string, string> }).areaStacks ?? {};
  const heading = branding.typography.headingStack;
  const body = branding.typography.bodyStack;
  return {
    primary: safeHex(branding.colors.primary, "#2457C5"),
    accent: safeHex(branding.colors.accent, "#172033"),
    evidenceAccent: safeHex(branding.colors.evidenceAccent, safeHex(branding.colors.primary, "#2457C5")),
    border: safeHex(branding.colors.border, "#D9E0EA"),
    muted: safeHex(branding.colors.mutedBackground, "#F4F6F9"),
    heading: safeHex(branding.colors.sectionHeading, "#172033"),
    headerBackground: safeHex(branding.colors.headerBackground, "#FFFFFF"),
    headerText: safeHex(branding.colors.headerText, "#172033"),
    footerBackground: safeHex(branding.colors.footerBackground, "#FFFFFF"),
    footerText: safeHex(branding.colors.footerText, "#667085"),
    fonts: {
      cover: fontPair(area.cover_page ?? heading),
      header: fontPair(area.header ?? heading),
      section: fontPair(area.section_headings ?? heading),
      body: fontPair(area.body_text ?? body),
      evidenceTitle: fontPair(area.evidence_titles ?? heading),
      evidenceNote: fontPair(area.evidence_notes ?? body),
      footer: fontPair(area.footer ?? body),
      signature: fontPair(area.signature ?? body),
    },
    sectionGap: style.sectionSpacing === "compact" ? 10 : style.sectionSpacing === "spacious" ? 28 : 18,
  };
}

function collectPdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed <= CONTENT_BOTTOM) return false;
  doc.addPage();
  return true;
}

function getWatermarkText(style: ExecutivePdfStyle) {
  const watermark = style.watermark;
  if (!watermark || watermark.option === "none" || watermark.draftOnly) return "";
  if (watermark.option === "custom_text") return watermark.text.trim();
  return watermark.option.toUpperCase();
}

function organizationName(snapshot: FinalReportSnapshot, branding: WorkspaceBrandProfile) {
  return branding.display_name?.trim() || snapshot.organizationName;
}

function drawRule(doc: PDFKit.PDFDocument, y: number, color: string, width = 0.7) {
  doc.moveTo(MARGIN_X, y).lineTo(PAGE_WIDTH - MARGIN_X, y).lineWidth(width).strokeColor(color).stroke();
}

function sectionHeading(doc: PDFKit.PDFDocument, title: string, branding: WorkspaceBrandProfile, theme: PdfTheme, number?: number) {
  const style = branding.report_style;
  ensureSpace(doc, 48);
  const y = doc.y;
  if (style.sectionStyle === "boxed" || style.sectionStyle === "carded") {
    doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, 30, 5).fill(theme.muted);
  } else if (["executive", "clean_document", "ruled", "inspection"].includes(style.sectionStyle)) {
    doc.moveTo(MARGIN_X, y + 1).lineTo(MARGIN_X + 32, y + 1).lineWidth(3).strokeColor(theme.primary).stroke();
  }
  const showLabel = style.showSectionLabels !== false;
  const label = showLabel ? `${style.showSectionNumbers && number ? `${number}. ` : ""}${title}` : "";
  if (label) {
    const inset = style.sectionStyle === "boxed" || style.sectionStyle === "carded" ? 12 : 0;
    doc.font(theme.fonts.section.bold).fontSize(style.sectionStyle === "minimal" ? 13 : 15).fillColor(theme.heading).text(label, MARGIN_X + inset, y + (inset ? 8 : 9), { width: CONTENT_WIDTH - inset * 2 });
    doc.y = Math.max(doc.y + 6, y + 38);
  } else {
    doc.y = y + 12;
  }
  if (style.showSectionDividers) drawRule(doc, doc.y, theme.border, 0.6);
  doc.y += style.sectionSpacing === "compact" ? 8 : 12;
}

function drawDetailRows(doc: PDFKit.PDFDocument, rows: readonly FinalReportDetail[], theme: PdfTheme, options: { columns?: 1 | 2; compact?: boolean; x?: number; width?: number; background?: string | null; font?: FontPair } = {}) {
  if (!rows.length) return;
  const columns = options.columns ?? 2;
  const gap = 18;
  const x = options.x ?? MARGIN_X;
  const availableWidth = options.width ?? CONTENT_WIDTH;
  const columnWidth = (availableWidth - gap * (columns - 1)) / columns;
  const font = options.font ?? theme.fonts.body;
  for (let start = 0; start < rows.length; start += columns) {
    const group = rows.slice(start, start + columns);
    doc.font(font.bold).fontSize(7.5);
    const labelHeight = Math.max(...group.map((entry) => doc.heightOfString(entry.label.toUpperCase(), { width: columnWidth, characterSpacing: 0.45 })));
    doc.font(font.regular).fontSize(9.5);
    const valueHeight = Math.max(...group.map((entry) => doc.heightOfString(entry.value, { width: columnWidth, lineGap: 1 })));
    const valueOffset = Math.max(13, labelHeight + 4);
    const groupHeight = Math.max(options.compact ? 27 : 35, valueOffset + valueHeight + 7);
    ensureSpace(doc, groupHeight);
    const y = doc.y;
    if (options.background) doc.roundedRect(x - 8, y - 5, availableWidth + 16, groupHeight + 4, 5).fill(options.background);
    group.forEach((row, column) => {
      const rowX = x + column * (columnWidth + gap);
      doc.font(font.bold).fontSize(7.5).fillColor("#667085").text(row.label.toUpperCase(), rowX, y, { width: columnWidth, characterSpacing: 0.45 });
      doc.font(font.regular).fontSize(9.5).fillColor(theme.accent).text(row.value, rowX, y + valueOffset, { width: columnWidth, lineGap: 1 });
    });
    doc.y = y + groupHeight;
  }
}

function drawImage(doc: PDFKit.PDFDocument, asset: Buffer | null | undefined, x: number, y: number, width: number, height: number, theme: PdfTheme) {
  doc.roundedRect(x, y, width, height, 7).fillAndStroke("#F8FAFC", theme.border);
  if (!asset) {
    doc.font(theme.fonts.body.regular).fontSize(8).fillColor("#7A8495").text("Preview unavailable", x + 10, y + height / 2 - 5, { width: width - 20, align: "center" });
    return;
  }
  try {
    doc.image(asset, x + 4, y + 4, { fit: [width - 8, height - 8], align: "center", valign: "center" });
  } catch {
    doc.font(theme.fonts.body.regular).fontSize(8).fillColor("#7A8495").text("Preview unavailable", x + 10, y + height / 2 - 5, { width: width - 20, align: "center" });
  }
}

function getPrimaryMediaHeight(style: ExecutivePdfStyle) {
  return style.evidenceImageSize === "compact" ? 104 : style.evidenceImageSize === "large" ? 220 : style.evidenceImageSize === "full_width" ? 270 : 154;
}

function drawHeader(doc: PDFKit.PDFDocument, snapshot: FinalReportSnapshot, branding: WorkspaceBrandProfile, assets: ExecutivePdfAssets, theme: PdfTheme) {
  const layout = branding.header_layout;
  const y = doc.y;
  const height = layout === "compact_service" || layout === "minimal" ? 62 : 82;
  if (theme.headerBackground !== "#FFFFFF") doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, height, 8).fill(theme.headerBackground);
  const rail = branding.report_style.headerOptions?.gradientPreset || layout === "left_rail" || layout === "industrial_strip";
  if (rail) doc.rect(MARGIN_X, y, 8, height).fill(theme.primary);
  const left = MARGIN_X + (rail ? 18 : 14);
  const right = MARGIN_X + CONTENT_WIDTH - 14;
  const name = organizationName(snapshot, branding);
  const centered = layout === "centered_logo" || layout === "report_cover";
  const companyX = centered ? MARGIN_X + 110 : left;
  const companyWidth = centered ? CONTENT_WIDTH - 220 : 220;
  if (assets.logo) {
    try { doc.image(assets.logo, companyX, y + 12, { fit: [110, 34] }); }
    catch { doc.font(theme.fonts.header.bold).fontSize(11).fillColor(theme.headerText).text(name, companyX, y + 15, { width: companyWidth, align: centered ? "center" : "left" }); }
  } else {
    doc.font(theme.fonts.header.bold).fontSize(11).fillColor(theme.headerText).text(name, companyX, y + 15, { width: companyWidth, align: centered ? "center" : "left" });
  }
  if (branding.tagline) doc.font(theme.fonts.header.regular).fontSize(8).fillColor(theme.headerText).text(branding.tagline, companyX, y + 44, { width: companyWidth, align: centered ? "center" : "left" });
  const contact = [branding.address, branding.phone, branding.email].filter(Boolean).join("\n");
  if (branding.show_contact_info !== false && contact && !centered && layout !== "minimal") doc.font(theme.fonts.header.regular).fontSize(8).fillColor(theme.headerText).text(contact, MARGIN_X + 250, y + 13, { width: 150, align: "center", lineGap: 2 });
  if (branding.show_report_id) doc.font(theme.fonts.header.bold).fontSize(8.2).fillColor(theme.headerText).text(snapshot.reportId, right - 112, y + 15, { width: 112, align: "right" });
  doc.y = y + height + theme.sectionGap;
}

function drawSummary(doc: PDFKit.PDFDocument, snapshot: FinalReportSnapshot, branding: WorkspaceBrandProfile, theme: PdfTheme) {
  sectionHeading(doc, "Executive Summary", branding, theme);
  const height = Math.max(82, doc.font(theme.fonts.body.regular).fontSize(10.5).heightOfString(snapshot.summary, { width: CONTENT_WIDTH - 32, lineGap: 3 }) + 30);
  ensureSpace(doc, height + 8);
  const y = doc.y;
  doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, height, 8).fill(theme.muted);
  doc.font(theme.fonts.body.regular).fontSize(10.5).fillColor("#263044").text(snapshot.summary, MARGIN_X + 16, y + 15, { width: CONTENT_WIDTH - 32, lineGap: 3 });
  doc.y = y + height + theme.sectionGap;
}

function drawClientAsset(doc: PDFKit.PDFDocument, snapshot: FinalReportSnapshot, branding: WorkspaceBrandProfile, theme: PdfTheme) {
  const visible = snapshot.identity.filter((row) => row.value?.trim()).slice(0, 8);
  if (!visible.length) return;
  sectionHeading(doc, "Client / Asset", branding, theme, 1);
  drawDetailRows(doc, visible, theme, { columns: visible.length === 1 ? 1 : 2, background: ["boxed", "carded", "clean_document", "executive"].includes(branding.report_style.sectionStyle) ? theme.muted : null });
  doc.y += theme.sectionGap;
}

function drawCover(doc: PDFKit.PDFDocument, snapshot: FinalReportSnapshot, branding: WorkspaceBrandProfile, assets: ExecutivePdfAssets, theme: PdfTheme) {
  const style = branding.report_style;
  const background = safeHex(style.coverBackgroundColor, "#FFFFFF");
  const textColor = style.coverTextColor === "auto" ? theme.accent : safeHex(style.coverTextColor, theme.accent);
  if (background !== "#FFFFFF") doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(background);
  if (["modern_gradient_cover", "full_color_cover", "industrial_bold_cover"].includes(style.coverPage)) doc.rect(0, 0, 18, PAGE_HEIGHT).fill(safeHex(style.coverAccentColor, theme.primary));
  if (assets.logo && style.showCoverLogo !== false) {
    try { const maxWidth = style.coverLogoSize === "large" ? 180 : style.coverLogoSize === "small" ? 100 : 140; doc.image(assets.logo, MARGIN_X, 54, { fit: [maxWidth, 48] }); } catch {}
  }
  if (style.showCoverCompanyInfo !== false) doc.font(theme.fonts.cover.bold).fontSize(10).fillColor(textColor).text(organizationName(snapshot, branding), MARGIN_X, 58, { width: CONTENT_WIDTH, align: "right" });
  drawRule(doc, 118, theme.border, 0.8);
  doc.font(theme.fonts.cover.bold).fontSize(8.5).fillColor(theme.primary).text(snapshot.reportType.toUpperCase(), MARGIN_X, 148, { characterSpacing: 1.2 });
  if (style.showCoverTitle !== false) doc.font(theme.fonts.cover.bold).fontSize(30).fillColor(textColor).text(snapshot.reportTitle, MARGIN_X, 174, { width: CONTENT_WIDTH, align: style.coverTitleAlignment, lineGap: 3 });
  doc.y = Math.max(doc.y + 28, 275);
  const rows = [
    ...(style.showCoverReportId ? [{ label: "Report reference", value: snapshot.reportId }] : []),
    ...(style.showCoverDate ? [{ label: "Report date", value: snapshot.reportDate }] : []),
    ...snapshot.identity.filter((row) => {
      const label = row.label.toLowerCase();
      if (/customer|client/.test(label)) return style.showCoverClient;
      if (/location|address/.test(label)) return style.showCoverLocation;
      if (/asset|equipment|subject|unit|make|model|serial|vin|licen[cs]e|odometer|hours|work order|po/.test(label)) return style.showCoverAsset;
      return true;
    }),
  ].slice(0, 10);
  drawDetailRows(doc, rows, theme, { columns: 2, font: theme.fonts.cover });
  doc.y += 18;
  doc.font(theme.fonts.cover.regular).fontSize(10).fillColor(textColor).text(snapshot.summary, MARGIN_X, doc.y, { width: CONTENT_WIDTH, lineGap: 3 });
}

function severityColor(label: string) {
  const key = label.trim().toLowerCase();
  if (key === "critical") return "#9E2B25";
  if (key === "high") return "#A65A16";
  if (key === "medium") return "#7A6318";
  return "#4A5568";
}

function measureItemIntro(doc: PDFKit.PDFDocument, item: FinalReportSnapshot["items"][number], theme: PdfTheme, width: number) {
  doc.font(theme.fonts.evidenceTitle.bold).fontSize(13.5);
  const titleHeight = doc.heightOfString(item.title, { width });
  doc.font(theme.fonts.evidenceNote.regular).fontSize(9.2);
  const descriptionHeight = item.description ? doc.heightOfString(item.description, { width, lineGap: 2 }) + 9 : 0;
  return 18 + titleHeight + 7 + descriptionHeight;
}

function drawItemCopy(doc: PDFKit.PDFDocument, item: FinalReportSnapshot["items"][number], index: number, branding: WorkspaceBrandProfile, theme: PdfTheme, x: number, y: number, width: number) {
  const style = branding.report_style;
  if (style.evidenceNumbering) doc.font(theme.fonts.evidenceTitle.bold).fontSize(7.5).fillColor(theme.evidenceAccent).text(`ITEM ${String(index + 1).padStart(2, "0")}`, x, y, { width, characterSpacing: 0.8 });
  const meta = [item.severity ? `${item.severity} severity` : null, style.captureMetadata ? item.category : null].filter(Boolean).join(" · ");
  if (meta) doc.font(theme.fonts.evidenceTitle.bold).fontSize(7).fillColor(item.severity ? severityColor(item.severity) : "#667085").text(meta.toUpperCase(), x, y, { width, align: "right" });
  doc.font(theme.fonts.evidenceTitle.bold).fontSize(13.5).fillColor(theme.heading).text(item.title, x, y + 18, { width, lineGap: 1 });
  let nextY = doc.y + 6;
  if (item.description && style.notes !== false) {
    doc.font(theme.fonts.evidenceNote.regular).fontSize(9.2).fillColor("#374151").text(item.description, x, nextY, { width, lineGap: 2 });
    nextY = doc.y + 7;
  }
  return nextY;
}

function reserveHeadingWithFirstItem(doc: PDFKit.PDFDocument, snapshot: FinalReportSnapshot, branding: WorkspaceBrandProfile, theme: PdfTheme) {
  const first = snapshot.items[0];
  if (!first) return;
  const style = branding.report_style;
  const sideBySide = ["standard_cards", "photo_left_notes_right", "clean_evidence_list"].includes(style.evidenceStyle) && first.mediaIds.length > 0;
  const photoWidth = style.evidenceImageSize === "large" ? 220 : 185;
  const copyWidth = sideBySide ? CONTENT_WIDTH - photoWidth - 18 : CONTENT_WIDTH;
  const intro = measureItemIntro(doc, first, theme, copyWidth);
  const media = first.mediaIds.length ? getPrimaryMediaHeight(style) : 0;
  ensureSpace(doc, Math.min(58 + Math.max(intro, sideBySide ? media : intro + media), CONTENT_BOTTOM - 56));
}

function drawItems(doc: PDFKit.PDFDocument, snapshot: FinalReportSnapshot, assets: ExecutivePdfAssets, branding: WorkspaceBrandProfile, theme: PdfTheme, startOnNewPage: boolean) {
  if (!snapshot.items.length) return;
  if (startOnNewPage) doc.addPage();
  else reserveHeadingWithFirstItem(doc, snapshot, branding, theme);
  sectionHeading(doc, "Documented Items", branding, theme, 2);
  const style = branding.report_style;
  snapshot.items.forEach((item, index) => {
    const sideBySide = ["standard_cards", "photo_left_notes_right", "clean_evidence_list"].includes(style.evidenceStyle) && item.mediaIds.length > 0;
    const compactList = ["compact_list", "clean_list", "numbered_appendix"].includes(style.evidenceStyle);
    const grid = ["photo_grid", "two_column_photo_grid", "insurance_photo_grid"].includes(style.evidenceStyle);
    const mediaHeight = getPrimaryMediaHeight(style);
    if (sideBySide) {
      const gap = 18;
      const photoWidth = style.evidenceImageSize === "large" ? 220 : 185;
      const copyWidth = CONTENT_WIDTH - photoWidth - gap;
      const introHeight = measureItemIntro(doc, item, theme, copyWidth);
      ensureSpace(doc, Math.min(Math.max(mediaHeight, introHeight) + 20, CONTENT_BOTTOM - 56));
      const y = doc.y;
      const photoLeft = style.evidenceStyle === "photo_left_notes_right";
      const photoX = photoLeft ? MARGIN_X : MARGIN_X + copyWidth + gap;
      const copyX = photoLeft ? MARGIN_X + photoWidth + gap : MARGIN_X;
      drawImage(doc, assets.media?.[item.mediaIds[0]], photoX, y, photoWidth, mediaHeight, theme);
      const copyBottom = drawItemCopy(doc, item, index, branding, theme, copyX, y, copyWidth);
      doc.y = Math.max(y + mediaHeight, copyBottom) + 10;
      const extras = item.mediaIds.slice(1);
      if (extras.length) {
        const thumbWidth = (CONTENT_WIDTH - 10) / 2;
        for (let start = 0; start < extras.length; start += 2) {
          ensureSpace(doc, 112);
          const extraY = doc.y;
          extras.slice(start, start + 2).forEach((id, column) => drawImage(doc, assets.media?.[id], MARGIN_X + column * (thumbWidth + 10), extraY, thumbWidth, 102, theme));
          doc.y = extraY + 112;
        }
      }
    } else if (grid && item.mediaIds.length) {
      const introHeight = measureItemIntro(doc, item, theme, CONTENT_WIDTH);
      ensureSpace(doc, Math.min(introHeight + 120, CONTENT_BOTTOM - 56));
      const y = doc.y;
      doc.y = drawItemCopy(doc, item, index, branding, theme, MARGIN_X, y, CONTENT_WIDTH);
      const cellWidth = (CONTENT_WIDTH - 10) / 2;
      const cellHeight = Math.min(mediaHeight, 165);
      for (let start = 0; start < item.mediaIds.length; start += 2) {
        ensureSpace(doc, cellHeight + 10);
        const rowY = doc.y;
        item.mediaIds.slice(start, start + 2).forEach((id, column) => drawImage(doc, assets.media?.[id], MARGIN_X + column * (cellWidth + 10), rowY, cellWidth, cellHeight, theme));
        doc.y = rowY + cellHeight + 10;
      }
    } else {
      const imageHeight = compactList ? 94 : mediaHeight;
      const introHeight = measureItemIntro(doc, item, theme, CONTENT_WIDTH);
      ensureSpace(doc, Math.min(item.mediaIds.length ? introHeight + imageHeight + 14 : Math.max(90, introHeight), CONTENT_BOTTOM - 56));
      const y = doc.y;
      doc.y = drawItemCopy(doc, item, index, branding, theme, MARGIN_X, y, CONTENT_WIDTH);
      for (const id of item.mediaIds) {
        ensureSpace(doc, imageHeight + 12);
        drawImage(doc, assets.media?.[id], MARGIN_X, doc.y, compactList ? 180 : CONTENT_WIDTH, imageHeight, theme);
        doc.y += imageHeight + 10;
      }
    }
    const details = item.details.filter((detail) => style.timestamps || !/captured|date|time/i.test(detail.label));
    drawDetailRows(doc, details, theme, { columns: 2, compact: true });
    if (item.recommendations.length) {
      ensureSpace(doc, 42);
      doc.font(theme.fonts.evidenceNote.bold).fontSize(7.5).fillColor("#667085").text("NEXT ACTION", MARGIN_X, doc.y, { characterSpacing: 0.7 });
      doc.y += 14;
      item.recommendations.forEach((recommendation) => { doc.font(theme.fonts.evidenceNote.regular).fontSize(9).fillColor("#263044").text(`• ${recommendation}`, MARGIN_X + 2, doc.y, { width: CONTENT_WIDTH - 2, lineGap: 2 }); doc.y += 5; });
    }
    if (style.showSectionDividers) drawRule(doc, doc.y + 4, theme.border, 0.5);
    doc.y += theme.sectionGap + 8;
  });
}

function drawDocuments(doc: PDFKit.PDFDocument, snapshot: FinalReportSnapshot, assets: ExecutivePdfAssets, branding: WorkspaceBrandProfile, theme: PdfTheme) {
  if (!snapshot.documents.length) return;
  sectionHeading(doc, "Forms & Documents", branding, theme, 3);
  const style = branding.report_style;
  snapshot.documents.forEach((document, index) => {
    ensureSpace(doc, 96);
    const y = doc.y;
    const previewWidth = document.mediaId ? 108 : 0;
    if (document.mediaId) drawImage(doc, assets.media?.[document.mediaId], MARGIN_X, y, previewWidth, 80, theme);
    const copyX = MARGIN_X + (previewWidth ? previewWidth + 16 : 0);
    const copyWidth = CONTENT_WIDTH - (previewWidth ? previewWidth + 16 : 0);
    doc.font(theme.fonts.evidenceTitle.bold).fontSize(7).fillColor(theme.evidenceAccent).text(`DOCUMENT ${String(index + 1).padStart(2, "0")}`, copyX, y, { width: copyWidth });
    doc.font(theme.fonts.evidenceTitle.bold).fontSize(13).fillColor(theme.heading).text(document.title, copyX, y + 16, { width: copyWidth });
    if (document.summary) doc.font(theme.fonts.evidenceNote.regular).fontSize(9).fillColor("#4B5563").text(document.summary, copyX, doc.y + 4, { width: copyWidth, lineGap: 2 });
    doc.y = Math.max(doc.y + 8, y + 90);
    const details = document.details.filter((detail) => style.timestamps || !/captured|date|time/i.test(detail.label));
    drawDetailRows(doc, details, theme, { columns: 2, compact: true });
  });
  doc.y += theme.sectionGap;
}

function drawSections(doc: PDFKit.PDFDocument, snapshot: FinalReportSnapshot, branding: WorkspaceBrandProfile, theme: PdfTheme) {
  let sectionNumber = 4;
  snapshot.sections.forEach((section) => {
    if (section.title === "Source Index" && !branding.report_style.evidenceAppendix) return;
    ensureSpace(doc, 88);
    sectionHeading(doc, section.id === "final-notes" ? "Closing Notes" : section.title, branding, theme, sectionNumber++);
    if (section.summary) { doc.font(theme.fonts.body.regular).fontSize(9.5).fillColor("#374151").text(section.summary, MARGIN_X, doc.y, { width: CONTENT_WIDTH, lineGap: 3 }); doc.y += 10; }
    drawDetailRows(doc, section.rows, theme, { columns: 2, compact: section.title === "Source Index" });
    doc.y += theme.sectionGap;
  });
}

function drawCompletion(doc: PDFKit.PDFDocument, snapshot: FinalReportSnapshot, branding: WorkspaceBrandProfile, assets: ExecutivePdfAssets, theme: PdfTheme) {
  if (!branding.show_signature_block) return;
  const completedBy = snapshot.approval.reviewedBy?.trim() || "";
  const completedAt = snapshot.approval.approvedAt || "";
  const role = completedBy && branding.prepared_by_name?.trim() === completedBy ? branding.prepared_by_title?.trim() || "" : "";
  if (!completedBy && !completedAt) return;
  ensureSpace(doc, 170);
  sectionHeading(doc, "Report Completion", branding, theme);
  const y = doc.y;
  const cardHeight = 112;
  doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, cardHeight, 8).strokeColor(theme.border).stroke();
  const rows: FinalReportDetail[] = [
    ...(completedBy ? [{ label: "Completed by", value: completedBy }] : []),
    ...(role ? [{ label: "Role / Title", value: role }] : []),
    ...(completedAt && branding.report_style.signatureDate ? [{ label: "Completed", value: completedAt }] : []),
  ];
  doc.y = y + 16;
  drawDetailRows(doc, rows, theme, { columns: rows.length > 1 ? 2 : 1, x: MARGIN_X + 16, width: CONTENT_WIDTH - 32, compact: true, font: theme.fonts.signature });
  const signatureY = y + 63;
  if (assets.signature) {
    try { doc.image(assets.signature, MARGIN_X + 16, signatureY, { fit: [150, 34] }); } catch {}
  } else if (branding.report_style.typedSignature) {
    doc.font(theme.fonts.signature.regular).fontSize(13).fillColor(theme.accent).text(branding.report_style.typedSignature, MARGIN_X + 16, signatureY, { width: 180 });
  }
  doc.y = y + cardHeight + theme.sectionGap;
}

function addPageFurniture(doc: PDFKit.PDFDocument, snapshot: FinalReportSnapshot, branding: WorkspaceBrandProfile, theme: PdfTheme) {
  const style = branding.report_style;
  const watermarkText = getWatermarkText(style);
  const showPageNumber = style.showPageNumber;
  const range = doc.bufferedPageRange();
  const company = organizationName(snapshot, branding);
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    if (watermarkText) {
      const opacity = style.watermark.opacity === "strong" ? 0.15 : style.watermark.opacity === "standard" ? 0.1 : 0.065;
      doc.save(); doc.opacity(opacity); doc.font(theme.fonts.section.bold).fontSize(48).fillColor("#64748B").rotate(style.watermark.placement === "diagonal" ? -34 : 0, { origin: [PAGE_WIDTH / 2, PAGE_HEIGHT / 2] }).text(watermarkText, 56, PAGE_HEIGHT / 2 - 24, { width: PAGE_WIDTH - 112, align: "center" }); doc.restore();
    }
    if (pageIndex > 0) {
      doc.font(theme.fonts.header.regular).fontSize(7.5).fillColor("#7A8495").text(company, MARGIN_X, 29, { width: CONTENT_WIDTH / 2 });
      if (branding.show_report_id) doc.text(snapshot.reportId, MARGIN_X + CONTENT_WIDTH / 2, 29, { width: CONTENT_WIDTH / 2, align: "right" });
      drawRule(doc, 43, theme.border, 0.5);
    }
    const footerText = branding.footer_text?.trim() || (branding.show_confidentiality_note || style.showConfidentialityLabel ? "Confidential" : "");
    if (footerText || showPageNumber || branding.show_page_date || branding.show_report_id) {
      const footerY = PAGE_HEIGHT - 42;
      if (theme.footerBackground !== "#FFFFFF") doc.rect(0, footerY - 4, PAGE_WIDTH, 46).fill(theme.footerBackground); else drawRule(doc, footerY, theme.border, 0.5);
      doc.font(theme.fonts.footer.regular).fontSize(7.5).fillColor(theme.footerText);
      if (footerText) doc.text(footerText, MARGIN_X, PAGE_HEIGHT - 30, { width: String(branding.footer_layout) === "minimal" ? CONTENT_WIDTH : CONTENT_WIDTH / 2, align: String(branding.footer_layout) === "contact_footer" ? "center" : "left", lineBreak: false });
      const rightBits = [branding.show_page_date ? snapshot.reportDate : null, branding.show_report_id ? snapshot.reportId : null, showPageNumber ? `Page ${pageIndex + 1} of ${range.count}` : null].filter(Boolean).join("  ·  ");
      if (rightBits) doc.text(rightBits, MARGIN_X, PAGE_HEIGHT - 30, { width: CONTENT_WIDTH, align: "right", lineBreak: false });
    }
    doc.page.margins.bottom = originalBottomMargin;
  }
}

export async function renderExecutiveReportPdf(params: { snapshot: FinalReportSnapshot; branding: WorkspaceBrandProfile; assets?: ExecutivePdfAssets }): Promise<Buffer> {
  const { snapshot, branding } = params;
  const assets = params.assets ?? {};
  const theme = buildTheme(branding);
  const stableDate = new Date(snapshot.approval.approvedAt || snapshot.reportDate || "2000-01-01T00:00:00.000Z");
  const creationDate = Number.isNaN(stableDate.getTime()) ? new Date("2000-01-01T00:00:00.000Z") : stableDate;
  const doc = new PDFDocument({ autoFirstPage: true, bufferPages: true, compress: true, size: "LETTER", margins: { top: 56, right: MARGIN_X, bottom: 66, left: MARGIN_X }, info: { Title: snapshot.reportTitle, Author: organizationName(snapshot, branding), Subject: snapshot.reportType, Keywords: "professional report, documented items, supporting photos", CreationDate: creationDate, ModDate: creationDate } });
  const output = collectPdf(doc);
  const hasCover = branding.report_style.coverPage !== "none";
  if (hasCover) { drawCover(doc, snapshot, branding, assets, theme); doc.addPage(); }
  drawHeader(doc, snapshot, branding, assets, theme);
  drawSummary(doc, snapshot, branding, theme);
  drawClientAsset(doc, snapshot, branding, theme);
  drawItems(doc, snapshot, assets, branding, theme, false);
  drawDocuments(doc, snapshot, assets, branding, theme);
  drawSections(doc, snapshot, branding, theme);
  if (branding.report_style.approvalBlock || branding.show_signature_block) drawCompletion(doc, snapshot, branding, assets, theme);
  addPageFurniture(doc, snapshot, branding, theme);
  doc.end();
  return output;
}
