"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";

import { getOfflineIdentity } from "@/features/offline/offline-identity";
import {
  getPendingCaptures,
  queueCapture,
  removeCapture,
  saveQueuedCapture,
} from "@/features/offline/queue";
import {
  getCaptureSessionSnapshot,
  type OfflineCaptureSessionData,
} from "@/features/offline/session-cache";
import type {
  CachedSessionRecord,
  OfflineCaptureRecord,
} from "@/features/offline/types";

type OfflineWorkspaceItem = {
  record: OfflineCaptureRecord;
  previewUrl: string;
};

function createLocalId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isCaptureSessionData(
  value: unknown,
): value is OfflineCaptureSessionData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<OfflineCaptureSessionData>;

  return (
    typeof candidate.captureTitle === "string" &&
    typeof candidate.returnPath === "string" &&
    typeof candidate.donePath === "string" &&
    typeof candidate.maxCaptureFileSizeBytes === "number" &&
    typeof candidate.maxVideoFileSizeBytes === "number"
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusLabel(record: OfflineCaptureRecord) {
  if (record.status === "uploading") return "Uploading";
  if (record.status === "creating_record") return "Finishing save";
  if (record.status === "blocked") return "Needs attention";
  if (record.status === "failed") return "Waiting to retry";
  return "Saved on device";
}

export function OfflineCaptureWorkspace() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [session, setSession] =
    useState<CachedSessionRecord | null>(null);
  const [items, setItems] = useState<OfflineWorkspaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionData = useMemo(() => {
    if (!session || !isCaptureSessionData(session.data)) {
      return null;
    }

    return session.data;
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];

    async function loadWorkspace() {
      if (!sessionId) {
        setError("No offline capture session was selected.");
        setLoading(false);
        return;
      }

      const identity = getOfflineIdentity();

      if (!identity) {
        setError(
          "CRED could not verify the offline user on this device. Reconnect and open the session once before using it offline.",
        );
        setLoading(false);
        return;
      }

      const cachedSession = await getCaptureSessionSnapshot(
        sessionId,
        identity.userId,
      );

      if (
        !cachedSession ||
        cachedSession.organizationId !== identity.organizationId
      ) {
        setError(
          "This session is not available offline for the current user.",
        );
        setLoading(false);
        return;
      }

      const records = await getPendingCaptures(identity.userId);
      const scopedRecords = records
        .filter(
          (record) =>
            record.sessionId === sessionId &&
            record.organizationId === identity.organizationId,
        )
        .sort((left, right) =>
          left.createdAt.localeCompare(right.createdAt),
        );

      const restoredItems = scopedRecords.map((record) => {
        const previewUrl = URL.createObjectURL(record.blob);
        createdUrls.push(previewUrl);

        return {
          record,
          previewUrl,
        };
      });

      if (cancelled) {
        createdUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      setSession(cachedSession);
      setItems(restoredItems);
      setLoading(false);
    }

    void loadWorkspace().catch((loadError: unknown) => {
      console.warn("Unable to load offline capture workspace", loadError);

      if (!cancelled) {
        setError(
          "CRED could not open the locally saved capture workspace.",
        );
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [sessionId]);

  async function addFiles(files: File[]) {
    if (!session || !sessionData) {
      return;
    }

    const identity = getOfflineIdentity();

    if (
      !identity ||
      identity.userId !== session.userId ||
      identity.organizationId !== session.organizationId
    ) {
      setError("The offline user no longer matches this session.");
      return;
    }

    const oversized = files.find((file) => {
      const maxSize = file.type.startsWith("video/")
        ? sessionData.maxVideoFileSizeBytes
        : sessionData.maxCaptureFileSizeBytes;

      return file.size > maxSize;
    });

    if (oversized) {
      setError(
        `${oversized.name} is larger than the allowed offline capture size.`,
      );
      return;
    }

    setError(null);
    setMessage(
      `Saving ${files.length} capture${files.length === 1 ? "" : "s"} on this device…`,
    );

    const addedItems: OfflineWorkspaceItem[] = [];

    try {
      for (const file of files) {
        const localId = createLocalId();

        const record = await queueCapture({
          localId,
          clientMutationId: localId,
          organizationId: session.organizationId,
          workspaceId: session.workspaceId,
          sessionId: session.sessionId,
          userId: session.userId,
          blob: file,
          metadata: {
            captureIntent: "auto_evidence",
            manualType: null,
            guidedStep: null,
            guidedLabel: null,
            workflow: null,
            technicianNote: "",
            transcriptStatus: "not_started",
            noteSource: "manual",
            reportOrder: null,
            includeInReport: true,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            uploadStatus: "queued",
            noteSaveStatus: "idle",
          },
          uploadState: {
            storagePath: null,
            uploadedAt: null,
            finalizedAt: null,
          },
          status: "local",
        });

        addedItems.push({
          record,
          previewUrl: URL.createObjectURL(file),
        });
      }

      setItems((current) => [...current, ...addedItems]);
      setMessage(
        `${addedItems.length} capture${addedItems.length === 1 ? "" : "s"} saved on this device. They will sync automatically when a connection is available.`,
      );
    } catch (saveError) {
      addedItems.forEach((item) =>
        URL.revokeObjectURL(item.previewUrl),
      );
      console.warn("Unable to save offline capture", saveError);
      setError(
        "CRED could not save the capture on this device. Do not close the app until you retry.",
      );
    }
  }

  async function handleInputFiles(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    await addFiles(files);
  }

  async function updateNote(
    localId: string,
    technicianNote: string,
  ) {
    const item = items.find(
      (candidate) => candidate.record.localId === localId,
    );

    if (!item) {
      return;
    }

    const updatedRecord = await saveQueuedCapture({
      ...item.record,
      metadata: {
        ...item.record.metadata,
        technicianNote,
        noteSource: "edited",
        noteSaveStatus: "unsaved",
      },
    });

    setItems((current) =>
      current.map((candidate) =>
        candidate.record.localId === localId
          ? {
              ...candidate,
              record: updatedRecord,
            }
          : candidate,
      ),
    );
  }

  async function discardItem(localId: string) {
    const item = items.find(
      (candidate) => candidate.record.localId === localId,
    );

    if (!item) {
      return;
    }

    if (
      !window.confirm(
        "Discard this locally saved capture? This cannot be undone.",
      )
    ) {
      return;
    }

    await removeCapture(localId);
    URL.revokeObjectURL(item.previewUrl);

    setItems((current) =>
      current.filter(
        (candidate) => candidate.record.localId !== localId,
      ),
    );
  }

  if (loading) {
    return (
      <main className="page-shell">
        <section className="card form-stack">
          <p className="eyebrow">Offline capture</p>
          <h1>Opening local workspace…</h1>
        </section>
      </main>
    );
  }

  if (error && !session) {
    return (
      <main className="page-shell">
        <section className="card form-stack">
          <p className="eyebrow">Offline capture</p>
          <h1>Workspace unavailable</h1>
          <p className="error">{error}</p>
          <Link className="button button-secondary" href="/offline">
            Back
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell dashboard-shell focused-capture-shell">
      <div className="section-header page-header focused-capture-header">
        <div>
          <p className="eyebrow">Offline capture</p>
          <h1>{sessionData?.captureTitle ?? "Observation Capture"}</h1>
          <p className="muted">{session?.title}</p>
          <p className="muted">
            Captures remain on this device until CRED can sync them.
          </p>
        </div>
      </div>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <section className="card detail-card form-stack">
        <div className="button-row">
          <button
            className="button button-primary"
            type="button"
            onClick={() => cameraInputRef.current?.click()}
          >
            Camera
          </button>

          <button
            className="button button-secondary"
            type="button"
            onClick={() => galleryInputRef.current?.click()}
          >
            Gallery
          </button>
        </div>

        <input
          ref={cameraInputRef}
          hidden
          type="file"
          accept="image/*,video/*"
          capture="environment"
          multiple
          onChange={(event) => void handleInputFiles(event)}
        />

        <input
          ref={galleryInputRef}
          hidden
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={(event) => void handleInputFiles(event)}
        />

        <p className="muted">
          {items.length} locally saved capture
          {items.length === 1 ? "" : "s"}
        </p>
      </section>

      {items.length === 0 ? (
        <section className="card detail-card">
          <h2>No local captures yet</h2>
          <p className="muted">
            Use Camera or Gallery to begin capturing while offline.
          </p>
        </section>
      ) : (
        <section className="form-stack">
          {items.map(({ record, previewUrl }, index) => (
            <article
              className="card detail-card form-stack"
              key={record.localId}
            >
              <div className="section-header">
                <div>
                  <h2>Capture {index + 1}</h2>
                  <p className="muted">
                    {record.metadata.filename} ·{" "}
                    {formatSize(record.metadata.size)}
                  </p>
                </div>

                <span className="status-pill neutral">
                  {getStatusLabel(record)}
                </span>
              </div>

              {record.metadata.mimeType.startsWith("video/") ? (
                <video
                  controls
                  preload="metadata"
                  src={previewUrl}
                  style={{
                    display: "block",
                    maxHeight: "28rem",
                    maxWidth: "100%",
                    width: "100%",
                  }}
                />
              ) : (
                <img
                  alt={`Offline capture ${index + 1}`}
                  src={previewUrl}
                  style={{
                    display: "block",
                    height: "auto",
                    maxHeight: "28rem",
                    maxWidth: "100%",
                    objectFit: "contain",
                    width: "100%",
                  }}
                />
              )}

              <label className="form-stack">
                <span>Technician note</span>
                <textarea
                  rows={3}
                  value={record.metadata.technicianNote}
                  onChange={(event) => {
                    const technicianNote = event.target.value;

                    setItems((current) =>
                      current.map((candidate) =>
                        candidate.record.localId === record.localId
                          ? {
                              ...candidate,
                              record: {
                                ...candidate.record,
                                metadata: {
                                  ...candidate.record.metadata,
                                  technicianNote,
                                },
                              },
                            }
                          : candidate,
                      ),
                    );

                    void updateNote(
                      record.localId,
                      technicianNote,
                    );
                  }}
                />
              </label>

              <button
                className="button button-secondary"
                type="button"
                onClick={() => void discardItem(record.localId)}
              >
                Discard local capture
              </button>
            </article>
          ))}
        </section>
      )}

      <section className="card detail-card form-stack">
        <p className="muted">
          Report generation and final review require a connection.
        </p>

        <Link
          className="button button-secondary"
          href={sessionData?.returnPath ?? "/dashboard"}
        >
          Try online session
        </Link>
      </section>
    </main>
  );
}
