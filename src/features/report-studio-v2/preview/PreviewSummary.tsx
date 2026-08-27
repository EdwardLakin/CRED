/* eslint-disable @typescript-eslint/no-explicit-any */

export function PreviewSummary({
  brand,
  session,
  activeSection,
  setActiveSection,
}: any) {
  const reportStyle = brand.report_style;
  const summary = String(
    session?.snapshot?.summary ?? session?.report_summary ?? "",
  ).trim();
  return (
    <section
      data-edit-key="summary"
      data-report-summary-source="final-report-snapshot"
      className={`rsv2-section ${activeSection === "summary" ? "active" : ""}`}
      onClick={() => setActiveSection("summary")}
    >
      <div className="rsv2-section-heading">
        {reportStyle.showSectionNumbers ? <span>1</span> : null}
        <h2>Executive Summary</h2>
      </div>
      {reportStyle.showSectionDividers ? <hr /> : null}
      <p>{summary}</p>
    </section>
  );
}
