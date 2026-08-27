/* eslint-disable @typescript-eslint/no-explicit-any */

function identityValue(session: any, labels: string[], fallback: string) {
  const row = session?.snapshot?.identity?.find((entry: any) =>
    labels.includes(entry.label),
  );
  return row?.value ?? fallback;
}

export function PreviewClientAsset({
  brand,
  session,
  activeSection,
  setActiveSection,
}: any) {
  const reportStyle = brand.report_style;
  return (
    <button
      type="button"
      className={`rsv2-section rsv2-client client-style-${reportStyle.sectionStyle} client-spacing-${reportStyle.sectionSpacing} ${activeSection === "clientAsset" ? "active" : ""}`}
      onClick={() => setActiveSection("clientAsset")}
    >
      {reportStyle.showSectionNumbers ? <span className="rsv2-num">1</span> : null}
      <h2>{reportStyle.showSectionLabels ? "Client / Asset" : "Report Details"}</h2>
      {reportStyle.showSectionDividers ? <hr /> : null}
      <dl>
        <div>
          <dt>Client</dt>
          <dd>
            {identityValue(
              session,
              ["Customer / Client", "Customer", "Client"],
              "No customer recorded",
            )}
          </dd>
        </div>
        <div>
          <dt>Asset</dt>
          <dd>
            {identityValue(
              session,
              ["Asset / Equipment", "Asset", "Equipment"],
              "No asset recorded",
            )}
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{session?.snapshot?.approval?.status ?? "In review"}</dd>
        </div>
      </dl>
    </button>
  );
}
