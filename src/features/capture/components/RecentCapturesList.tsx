import Link from "next/link";

import { DeleteEvidenceButton } from "@/features/capture/components/DeleteEvidenceButton";
import { EvidenceImageTrigger } from "@/features/reports/review/EvidenceImageLightbox";
import { formatDateTime } from "@/features/sessions";

import type { CaptureItem } from "../types";
import {
  CAPTURE_TYPE_LABELS,
  getSourceDocumentMetadata,
  type CaptureType,
} from "../types";
import styles from "./CaptureComposer.module.css";

type CapturedItemKind = "observation" | "document" | "note";

type RecentItem = {
  id: string;
  documentationItemId: string | null;
  legacyGroupId: string;
  kind: CapturedItemKind;
  title: string;
  date: string | null;
  captures: CaptureItem[];
  thumbnail?: CaptureItem;
};

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3h8l4 4v14H6V3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M14 3v5h4M9 12h6M9 16h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function getItemGroupKey(capture: CaptureItem) {
  return (
    capture.documentation_item_id ||
    capture.observation_group_id ||
    capture.id
  );
}

function captureIsImage(capture: CaptureItem) {
  return capture.media_kind === "image" || capture.type === "photo";
}

function captureIsDocument(capture: CaptureItem) {
  return (
    Boolean(getSourceDocumentMetadata(capture.extracted_data)) ||
    capture.type === "document" ||
    capture.media_kind === "document"
  );
}

function captureIsNote(capture: CaptureItem) {
  return (
    capture.type === "text_note" ||
    capture.type === "voice_note" ||
    capture.media_kind === "note" ||
    capture.media_kind === "audio"
  );
}

function getItemKind(captures: CaptureItem[]): CapturedItemKind {
  if (captures.some(captureIsDocument)) return "document";
  if (captures.every(captureIsNote)) return "note";
  return "observation";
}

function getCaptureLabel(capture: CaptureItem, kind: CapturedItemKind) {
  const sourceDocument = getSourceDocumentMetadata(capture.extracted_data);
  const note = capture.technician_note?.trim() || capture.transcript?.trim();

  if (kind === "document") {
    return sourceDocument?.label || "Form or document";
  }

  if (kind === "note") {
    return note || "Session note";
  }

  return (
    note ||
    CAPTURE_TYPE_LABELS[capture.type as CaptureType] ||
    "Untitled item"
  );
}

function buildRecentItems(captures: CaptureItem[]) {
  const groups = new Map<string, CaptureItem[]>();

  captures.forEach((capture) => {
    const key = getItemGroupKey(capture);
    groups.set(key, [...(groups.get(key) ?? []), capture]);
  });

  return Array.from(groups.entries())
    .map(([id, groupCaptures]): RecentItem => {
      const orderedCaptures = [...groupCaptures].sort((left, right) => {
        const leftOrder =
          left.attachment_order ?? left.group_order ?? left.report_order ?? 1;
        const rightOrder =
          right.attachment_order ?? right.group_order ?? right.report_order ?? 1;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return (
          new Date(left.captured_at ?? left.created_at).getTime() -
          new Date(right.captured_at ?? right.created_at).getTime()
        );
      });
      const kind = getItemKind(orderedCaptures);
      const primary =
        orderedCaptures.find(
          (capture) => capture.attachment_kind === "primary",
        ) ??
        orderedCaptures.find(
          (capture) =>
            capture.technician_note?.trim() || capture.transcript?.trim(),
        ) ??
        orderedCaptures[0];
      const thumbnail = orderedCaptures.find(captureIsImage);

      return {
        id,
        documentationItemId: primary.documentation_item_id ?? null,
        legacyGroupId:
          primary.observation_group_id || orderedCaptures[0]?.id || primary.id,
        kind,
        title: getCaptureLabel(primary, kind),
        date: primary.captured_at ?? primary.created_at,
        captures: orderedCaptures,
        thumbnail,
      };
    })
    .sort(
      (left, right) =>
        new Date(right.date ?? "").getTime() -
        new Date(left.date ?? "").getTime(),
    );
}

function getPhotoCount(item: RecentItem) {
  return item.captures.filter(captureIsImage).length;
}

export function RecentCapturesList({
  captures,
  signedUrls,
  limit = 6,
  timeZone = null,
}: {
  captures: CaptureItem[];
  signedUrls: Record<string, string>;
  limit?: number;
  timeZone?: string | null;
  imageAiAssistEnabled?: boolean;
}) {
  const recentItems = buildRecentItems(
    captures.filter((capture) => !capture.deleted_at),
  );
  const allObservations = recentItems.filter(
    (item) => item.kind === "observation",
  );
  const allDocuments = recentItems.filter((item) => item.kind === "document");
  const allNotes = recentItems.filter((item) => item.kind === "note");
  const observations = allObservations.slice(0, limit);
  const documents = allDocuments.slice(0, limit);
  const notes = allNotes.slice(0, limit);

  if (recentItems.length === 0) {
    return (
      <div className={styles.emptyState}>
        No items yet. Take a photo or scan a form to begin.
      </div>
    );
  }

  const lightboxItems = observations
    .flatMap((item) => item.captures)
    .filter(
      (capture) => captureIsImage(capture) && Boolean(signedUrls[capture.id]),
    )
    .map((capture) => ({
      id: capture.id,
      src: signedUrls[capture.id],
      title: getCaptureLabel(capture, "observation"),
      note:
        capture.technician_note?.trim() || capture.transcript?.trim() || null,
    }));

  function renderRows(items: RecentItem[]) {
    return (
      <div className={styles.recentList}>
        {items.map((item) => {
          const photoCount = getPhotoCount(item);
          const thumbnailId = item.thumbnail?.id;
          const sessionId = item.captures[0].documentation_session_id;
          const itemTypeLabel =
            item.kind === "document"
              ? "Form or document"
              : item.kind === "note"
                ? "Note"
                : `${photoCount} photo${photoCount === 1 ? "" : "s"}`;

          return (
            <article
              key={item.id}
              className={styles.recentRow}
              data-item-card
            >
              <div className={styles.recentThumb}>
                {thumbnailId && signedUrls[thumbnailId] ? (
                  <EvidenceImageTrigger
                    items={lightboxItems}
                    currentId={thumbnailId}
                    imageClassName="pdf-safe-image"
                  />
                ) : (
                  <DocumentIcon />
                )}
              </div>
              <div className={styles.recentCopy}>
                <h4>{item.title}</h4>
                <p className={styles.recentMeta}>{itemTypeLabel}</p>
                <p className={styles.recentMeta}>
                  {formatDateTime(item.date, timeZone)}
                </p>
              </div>
              <div className={styles.recentActions}>
                {item.kind === "observation" ? (
                  <Link
                    href={`/dashboard/sessions/${sessionId}/capture?addTo=${encodeURIComponent(item.legacyGroupId)}#main-capture-card`}
                    className={styles.textButton}
                    aria-label={`Add photo to ${item.title}`}
                  >
                    Add photo
                  </Link>
                ) : null}
                <details className={styles.menu}>
                  <summary className={styles.textButton}>More</summary>
                  <div className={styles.menuPanel}>
                    {thumbnailId ? (
                      <a
                        href={`/api/dashboard/sessions/${sessionId}/evidence/${thumbnailId}/media?download=1`}
                        download
                        className={styles.textButton}
                      >
                        Download original
                      </a>
                    ) : null}
                    <DeleteEvidenceButton
                      captureId={item.captures[0].id}
                      documentationItemId={item.documentationItemId}
                      sessionId={sessionId}
                      className={`${styles.textButton} ${styles.removeControl}`}
                      label={
                        item.kind === "document"
                          ? "Delete form"
                          : item.kind === "note"
                            ? "Delete note"
                            : "Delete item"
                      }
                    />
                  </div>
                </details>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <div className={styles.recentSections}>
      <section
        className={styles.recentSection}
        aria-labelledby="captured-items-title"
      >
        <header className={styles.recentHeading}>
          <div>
            <h3 id="captured-items-title">Items</h3>
            <p>Photos of the same subject stay together.</p>
          </div>
          <span className={styles.kindBadge}>
            {allObservations.length} item
            {allObservations.length === 1 ? "" : "s"}
          </span>
        </header>
        {observations.length > 0 ? (
          renderRows(observations)
        ) : (
          <div className={styles.emptyState}>No documented items yet.</div>
        )}
      </section>

      {documents.length > 0 ? (
        <section
          className={styles.recentSection}
          aria-labelledby="captured-documents-title"
        >
          <header className={styles.recentHeading}>
            <div>
              <h3 id="captured-documents-title">Forms & documents</h3>
              <p>Reference files are kept separate from items.</p>
            </div>
            <span className={styles.countBadge}>{allDocuments.length}</span>
          </header>
          {renderRows(documents)}
        </section>
      ) : null}

      {notes.length > 0 ? (
        <section
          className={styles.recentSection}
          aria-labelledby="captured-notes-title"
        >
          <header className={styles.recentHeading}>
            <div>
              <h3 id="captured-notes-title">Notes</h3>
              <p>Session notes without photos.</p>
            </div>
            <span className={styles.countBadge}>{allNotes.length}</span>
          </header>
          {renderRows(notes)}
        </section>
      ) : null}
    </div>
  );
}
