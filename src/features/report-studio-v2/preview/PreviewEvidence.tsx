/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */

function mediaFor(session: any, id: string | null | undefined) {
  if (!id) return null;
  return session?.evidence?.find((entry: any) => entry.id === id) ?? null;
}

function itemImage(session: any, mediaId: string | null | undefined, label: string) {
  const media = mediaFor(session, mediaId);
  return media?.thumbnailUrl ? (
    <img className="rsv2-evidence-img" src={media.thumbnailUrl} alt={label} />
  ) : (
    <span className="rsv2-evidence-img">No photo</span>
  );
}

export function PreviewEvidence({
  brand,
  session,
  activeSection,
  setActiveSection,
}: any) {
  const reportStyle = brand.report_style;
  const snapshot = session?.snapshot;
  const items = (snapshot?.items ?? []).slice(0, 4);
  const documents = (snapshot?.documents ?? []).slice(0, 2);
  return (
    <button
      type="button"
      className={`rsv2-section rsv2-evidence ${activeSection === "evidence" ? "active" : ""}`}
      onClick={() => setActiveSection("evidence")}
    >
      <h2>Documented Items</h2>
      <div className="rsv2-evidence-list">
        {items.length ? (
          items.map((item: any, index: number) => (
            <article
              key={item.id}
              className={`rsv2-evidence-item evidence-size-${reportStyle.evidenceImageSize} evidence-style-${reportStyle.evidenceStyle}`}
            >
              <div className="rsv2-evidence-copy">
                {reportStyle.evidenceNumbering ? (
                  <b>ITEM {String(index + 1).padStart(2, "0")}</b>
                ) : null}
                <h3>{item.title}</h3>
                {reportStyle.notes && item.description ? (
                  <p>{item.description}</p>
                ) : null}
                {reportStyle.timestamps && item.mediaIds?.length ? (
                  <small>{item.mediaIds.length} supporting photo{item.mediaIds.length === 1 ? "" : "s"}</small>
                ) : null}
                {reportStyle.captureMetadata && item.category ? (
                  <small>{item.category}</small>
                ) : null}
              </div>
              {itemImage(session, item.mediaIds?.[0], `${item.title} supporting photo`)}
            </article>
          ))
        ) : (
          <p>No documented items yet.</p>
        )}
      </div>
      {documents.length ? (
        <div className="rsv2-evidence-list">
          <h2>Forms &amp; Documents</h2>
          {documents.map((document: any) => (
            <article
              key={document.id}
              className={`rsv2-evidence-item evidence-size-${reportStyle.evidenceImageSize} evidence-style-${reportStyle.evidenceStyle}`}
            >
              <div className="rsv2-evidence-copy">
                <h3>{document.title}</h3>
                {document.summary ? <p>{document.summary}</p> : null}
              </div>
              {itemImage(
                session,
                document.mediaId,
                `${document.title} document preview`,
              )}
            </article>
          ))}
        </div>
      ) : null}
    </button>
  );
}
