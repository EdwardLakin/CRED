export function safeReportPdfFileName(title: string, date = new Date()) {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "CRED-Report";
  return `${base}-${date.toISOString().slice(0, 10)}.pdf`;
}
