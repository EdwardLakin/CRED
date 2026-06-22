import Link from "next/link";

import type { CaptureItem } from "../types";
import {
  CAPTURE_TYPE_LABELS,
  getSourceDocumentMetadata,
  type CaptureType,
} from "../types";
import { formatDateTime } from "@/features/sessions";
import { DeleteEvidenceButton } from "@/features/capture/components/DeleteEvidenceButton";
import { EvidenceImageTrigger } from "@/features/reports/review/EvidenceImageLightbox";

type RecentObservation = {
  id: string;
  title: string;
  date: string | null;
  captures: CaptureItem[];
  thumbnail?: CaptureItem;
};

function getObservationGroupKey(capture: CaptureItem) {
  return capture.observation_group_id || capture.id;
}

function getObservationImageCount(observation: RecentObservation) {
  return observation.captures.filter(
    (capture) => capture.media_kind === "image" || capture.type === "photo",
  ).length;
}

function buildRecentObservations(captures: CaptureItem[]) {
  const groups = new Map<string, CaptureItem[]>();

  captures.forEach((capture) => {
    const key = getObservationGroupKey(capture);
    groups.set(key, [...(groups.get(key) ?? []), capture]);
  });

  return Array.from(groups.entries())
    .map(([id, groupCaptures]) => {
      const orderedCaptures = [...groupCaptures].sort((a, b) => {
        const aOrder = a.group_order ?? 1;
        const bOrder = b.group_order ?? 1;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (
          new Date(a.captured_at ?? a.created_at).getTime() -
          new Date(b.captured_at ?? b.created_at).getTime()
        );
      });
      const primary =
        orderedCaptures.find(
          (capture) =>
            capture.technician_note?.trim() || capture.transcript?.trim(),
        ) ?? orderedCaptures[0];
      const thumbnail = orderedCaptures.find(
        (capture) => capture.media_kind === "image" || capture.type === "photo",
      );

      return {
        id,
        title: getCaptureLabel(primary),
        date: primary.captured_at ?? primary.created_at,
        captures: orderedCaptures,
        thumbnail,
      };
    })
    .sort(
      (a, b) =>
        new Date(b.date ?? "").getTime() - new Date(a.date ?? "").getTime(),
    );
}

function getCaptureLabel(capture: CaptureItem) {
  const sourceDocument = getSourceDocumentMetadata(capture.extracted_data);
  const note = capture.technician_note?.trim() || capture.transcript?.trim();
  return (
    note ||
    sourceDocument?.label ||
    CAPTURE_TYPE_LABELS[capture.type as CaptureType] ||
    "Captured evidence"
  );
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
  const recentObservations = buildRecentObservations(
    captures.filter((capture) => !capture.deleted_at),
  ).slice(0, limit);

  if (recentObservations.length === 0) {
    return (
      <div className="empty-state capture-empty-state">
        No observations yet. Add an image to start documenting an observation.
      </div>
    );
  }

  const lightboxItems = recentObservations
    .flatMap((observation) => observation.captures)
    .filter(
      (capture) =>
        (capture.media_kind === "image" || capture.type === "photo") &&
        signedUrls[capture.id],
    )
    .map((capture) => ({
      id: capture.id,
      src: signedUrls[capture.id],
      title: getCaptureLabel(capture),
      note:
        capture.technician_note?.trim() || capture.transcript?.trim() || null,
    }));

  return (
    <div className="recent-capture-list">
      {recentObservations.map((observation) => {
        const imageCount = getObservationImageCount(observation);
        const thumbnailId = observation.thumbnail?.id;
        return (
          <article
            key={observation.id}
            className="recent-capture-card recent-observation-card"
            data-evidence-card
          >
            <div className="recent-observation-copy">
              <h3>{observation.title}</h3>
              <p className="muted">
                {formatDateTime(observation.date, timeZone)}
              </p>
              <p className="muted">
                {imageCount} Image{imageCount === 1 ? "" : "s"}
              </p>
              <div className="capture-card-actions recent-observation-actions">
                {thumbnailId && signedUrls[thumbnailId] ? (
                  <a
                    href={signedUrls[thumbnailId]}
                    target="_blank"
                    rel="noreferrer"
                    className="secondary-link touch-target"
                  >
                    Open
                  </a>
                ) : null}
                <Link
                  href={`/dashboard/sessions/${observation.captures[0].documentation_session_id}/capture?addTo=${encodeURIComponent(observation.id)}#main-capture-card`}
                  className="secondary-link touch-target"
                  aria-label="Add another image to this observation"
                  title="Add another image to this observation"
                >
                  Add Image
                </Link>
                <details className="observation-more-menu">
                  <summary className="secondary-link touch-target">
                    More
                  </summary>
                  <div className="observation-more-menu-panel">
                    {thumbnailId ? (
                      <a
                        href={`/api/dashboard/sessions/${observation.captures[0].documentation_session_id}/evidence/${thumbnailId}/media?download=1`}
                        download
                        className="secondary-link touch-target"
                      >
                        Download Original
                      </a>
                    ) : null}
                    <DeleteEvidenceButton
                      captureId={observation.captures[0].id}
                      label="Delete Observation"
                    />
                  </div>
                </details>
              </div>
            </div>
            {thumbnailId && signedUrls[thumbnailId] ? (
              <div className="recent-capture-thumb downloadable-evidence-preview">
                <EvidenceImageTrigger
                  items={lightboxItems}
                  currentId={thumbnailId}
                  imageClassName="pdf-safe-image"
                />
              </div>
            ) : (
              <div className="recent-capture-thumb">Note</div>
            )}
          </article>
        );
      })}
    </div>
  );
}
