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
  updateQueuedCapture,
} from "@/features/offline/queue";
import {
  getCachedCaptureSessions,
  getCaptureSessionSnapshot,
  type OfflineCaptureSessionData,
} from "@/features/offline/session-cache";
import {
  getMostRecentOfflineSession,
  getOfflineSession,
} from "@/features/offline/offline-sessions";
import {
  estimateStorage,
  requestPersistentStorage,
} from "@/features/offline/storage";
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

function withTimeout<T>(
  promise: Promise<T>,
  fallback: T,
  timeoutMs = 2500,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

async function safeRequestPersistentStorage() {
  return withTimeout(
    requestPersistentStorage(),
    { supported: false, persisted: false },
  );
}

async function safeEstimateStorage() {
  return withTimeout(
    estimateStorage(),
    {
      supported: false,
      quota: null,
      usage: null,
      available: null,
      percentUsed: null,
    },
  );
}

export function OfflineCaptureWorkspace({
  forcedLocalSessionId = null,
}: {
  forcedLocalSessionId?: string | null;
}) {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const localSessionId =
    forcedLocalSessionId ??
    searchParams.get("localSessionId") ??
    (sessionId?.startsWith("offline-") ? sessionId : null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [session, setSession] =
    useState<CachedSessionRecord | null>(null);
  const [items, setItems] = useState<OfflineWorkspaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] =
    useState<string | null>(null);

  const sessionData = useMemo(() => {
    if (!session || !isCaptureSessionData(session.data)) {
      return null;
    }

    return session.data;
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    let finished = false;
    const createdUrls: string[] = [];

    const loadingTimeout = window.setTimeout(() => {
      if (cancelled || finished) {
        return;
      }

      cancelled = true;
      setError(
        "The local workspace took too long to open. Reload this page or reconnect and open the session again.",
      );
      setLoading(false);
    }, 8000);

    async function loadWorkspace() {
      const identity = getOfflineIdentity();

      if (!identity) {
        setError(
          "CRED could not verify the offline user on this device. Reconnect and open the session once before using it offline.",
        );
        setLoading(false);
        return;
      }

      let cachedSession: CachedSessionRecord | null = null;

      if (localSessionId) {
        const offlineSession = await withTimeout(
          getOfflineSession(localSessionId),
          null,
          5000,
        );

        if (
          !offlineSession ||
          offlineSession.userId !== identity.userId ||
          offlineSession.organizationId !== identity.organizationId
        ) {
          setError("This offline session is not available for the current user.");
          setLoading(false);
          return;
        }

        cachedSession = {
          sessionId: offlineSession.serverSessionId ?? offlineSession.localSessionId,
          organizationId: offlineSession.organizationId,
          workspaceId: null,
          userId: offlineSession.userId,
          title: offlineSession.title,
          sessionType: offlineSession.sessionType,
          workflow: "observation_capture",
          cachedAt: offlineSession.updatedAt,
          expiresAt: null,
          data: {
            captureTitle: "Observation Capture",
            returnPath: "/offline",
            donePath: "/offline",
            observationGroupId: null,
            maxCaptureFileSizeBytes: 25 * 1024 * 1024,
            maxVideoFileSizeBytes: 50 * 1024 * 1024,
          },
        };
      } else {
        let targetSessionId = sessionId;

        if (!targetSessionId) {
          const cachedSessions = await withTimeout(
            getCachedCaptureSessions(identity.userId),
            [],
            5000,
          );
          const offlineSession = await withTimeout(
            getMostRecentOfflineSession(identity.userId),
            null,
            5000,
          );

          targetSessionId =
            cachedSessions[0]?.sessionId ??
            offlineSession?.localSessionId ??
            null;
        }

        if (!targetSessionId) {
          setError("No offline capture session is saved on this device yet.");
          setLoading(false);
          return;
        }

        cachedSession = await withTimeout(
          getCaptureSessionSnapshot(
            targetSessionId,
            identity.userId,
          ),
          null,
          5000,
        );

        if (!cachedSession && targetSessionId.startsWith("offline-")) {
          const offlineSession = await withTimeout(
            getOfflineSession(targetSessionId),
            null,
            5000,
          );

          if (offlineSession) {
            cachedSession = {
              sessionId: offlineSession.serverSessionId ?? offlineSession.localSessionId,
              organizationId: offlineSession.organizationId,
              workspaceId: null,
              userId: offlineSession.userId,
              title: offlineSession.title,
              sessionType: offlineSession.sessionType,
              workflow: "observation_capture",
              cachedAt: offlineSession.updatedAt,
              expiresAt: null,
              data: {
                captureTitle: "Observation Capture",
                returnPath: "/offline",
                donePath: "/offline",
                observationGroupId: null,
                maxCaptureFileSizeBytes: 25 * 1024 * 1024,
                maxVideoFileSizeBytes: 50 * 1024 * 1024,
              },
            };
          }
        }

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
      }

      await safeRequestPersistentStorage();

      const storageEstimate = await safeEstimateStorage();

      if (
        storageEstimate.available !== null &&
        storageEstimate.available < 100 * 1024 * 1024
      ) {
        setStorageWarning(
          "Device storage is running low. Sync existing captures before adding a large batch.",
        );
      } else if (
        storageEstimate.percentUsed !== null &&
        storageEstimate.percentUsed >= 85
      ) {
        setStorageWarning(
          "CRED is using most of the storage currently available to this browser.",
        );
      }

      const records = await withTimeout(
        getPendingCaptures(identity.userId),
        [],
        5000,
      );
      const scopedRecords = records
        .filter(
          (record) =>
            record.sessionId === cachedSession.sessionId &&
            record.organizationId === identity.organizationId,
        )
        .sort((left, right) => {
          const leftOrder =
            left.metadata.reportOrder ?? Number.MAX_SAFE_INTEGER;
          const rightOrder =
            right.metadata.reportOrder ?? Number.MAX_SAFE_INTEGER;

          if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
          }

          return left.createdAt.localeCompare(right.createdAt);
        });

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

      finished = true;
      window.clearTimeout(loadingTimeout);
      setSession(cachedSession);
      setItems(restoredItems);
      setLoading(false);
    }

    void loadWorkspace().catch((loadError: unknown) => {
      console.warn("Unable to load offline capture workspace", loadError);

      if (!cancelled) {
        finished = true;
        window.clearTimeout(loadingTimeout);
        setError(
          "CRED could not open the locally saved capture workspace.",
        );
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimeout);
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [localSessionId, sessionId]);

  async function addFiles(files: File[]) {
    if (!session || !sessionData) {
      return;
    }

    const requiredBytes = files.reduce(
      (total, file) => total + file.size,
      0,
    );
    const storageEstimate = await safeEstimateStorage();

    if (
      storageEstimate.available !== null &&
      storageEstimate.available <= requiredBytes
    ) {
      setError(
        "This device does not currently have enough browser storage for the selected files.",
      );
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
    const startingOrder = items.length + 1;

    try {
      for (const [fileIndex, file] of files.entries()) {
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
            reportOrder: startingOrder + fileIndex,
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
    const updatedRecord = await updateQueuedCapture(
      localId,
      (record) => ({
        ...record,
        metadata: {
          ...record.metadata,
          technicianNote,
          noteSource: "edited",
          noteSaveStatus: "unsaved",
        },
      }),
    );

    if (!updatedRecord) {
      return;
    }

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

  async function moveItem(
    localId: string,
    direction: -1 | 1,
  ) {
    const currentIndex = items.findIndex(
      (candidate) => candidate.record.localId === localId,
    );
    const nextIndex = currentIndex + direction;

    if (
      currentIndex < 0 ||
      nextIndex < 0 ||
      nextIndex >= items.length
    ) {
      return;
    }

    const reordered = [...items];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);

    const normalized = reordered.map((item, index) => ({
      ...item,
      record: {
        ...item.record,
        metadata: {
          ...item.record.metadata,
          reportOrder: index + 1,
        },
      },
    }));

    setItems(normalized);

    await Promise.all(
      normalized.map((item, index) =>
        updateQueuedCapture(
          item.record.localId,
          (record) => ({
            ...record,
            metadata: {
              ...record.metadata,
              reportOrder: index + 1,
            },
          }),
        ),
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
      {storageWarning ? (
        <p className="warning">{storageWarning}</p>
      ) : null}
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

              {(record.lastError ||
                record.metadata.uiError ||
                record.metadata.diagnostics) ? (
                <div className="diagnostics-grid">
                  {record.metadata.uiError || record.lastError ? (
                    <>
                      <strong>Upload issue</strong>
                      <span>
                        {record.metadata.uiError ?? record.lastError}
                      </span>
                    </>
                  ) : null}
                  <strong>Failure stage</strong>
                  <span>
                    {record.metadata.diagnostics?.failureStage ??
                      "none"}
                  </span>
                  <strong>Local Blob size</strong>
                  <span>
                    {record.metadata.diagnostics?.localBlobSize ??
                      record.blob?.size ??
                      "unknown"}
                  </span>
                  <strong>Expected size</strong>
                  <span>
                    {record.metadata.diagnostics?.expectedSize ??
                      record.metadata.size}
                  </span>
                  <strong>MIME type</strong>
                  <span>
                    {record.metadata.diagnostics?.mimeType ??
                      record.metadata.mimeType}
                  </span>
                  <strong>Filename</strong>
                  <span>
                    {record.metadata.diagnostics?.filename ??
                      record.metadata.filename}
                  </span>
                  <strong>Storage path</strong>
                  <span>
                    {record.metadata.diagnostics?.storagePath ??
                      record.uploadState.storagePath ??
                      "not assigned"}
                  </span>
                  <strong>Upload attempts</strong>
                  <span>
                    {record.metadata.diagnostics
                      ?.uploadAttemptCount ?? record.retryCount}
                  </span>
                  <strong>Server object size</strong>
                  <span>
                    {record.metadata.diagnostics
                      ?.serverObjectSize ?? "unknown"}
                  </span>
                </div>
              ) : null}

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

              <div className="button-row">
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={index === 0}
                  onClick={() =>
                    void moveItem(record.localId, -1)
                  }
                >
                  Move up
                </button>

                <button
                  className="button button-secondary"
                  type="button"
                  disabled={index === items.length - 1}
                  onClick={() =>
                    void moveItem(record.localId, 1)
                  }
                >
                  Move down
                </button>

                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() =>
                    void discardItem(record.localId)
                  }
                >
                  Discard local capture
                </button>
              </div>
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
