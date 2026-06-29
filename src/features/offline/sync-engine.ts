import {
  createCaptureRecordFromUploadedFile,
  validateCaptureBillingAccess,
} from "@/features/capture/actions";
import type {
  CaptureIntent,
  CaptureType,
} from "@/features/capture/types";
import {
  getCurrentStatus,
  subscribe,
} from "@/features/offline/connectivity";
import {
  getPendingCaptures,
  removeCapture,
  retargetQueuedCaptures,
  saveQueuedCapture,
} from "@/features/offline/queue";
import {
  getPendingOfflineSessions,
  recordVerifiedOfflineCapture,
  updateOfflineSessionStatus,
} from "@/features/offline/offline-sessions";
import type {
  OfflineCaptureFailureStage,
  OfflineCaptureRecord,
  QueueStatus,
} from "@/features/offline/types";
import { createClient } from "@/lib/supabase/client";

const CAPTURE_BUCKET = "documentation-captures";
const MAX_AUTOMATIC_RETRIES = 5;

type SyncEngineListener = (state: OfflineSyncEngineState) => void;

export type OfflineSyncEngineState = {
  running: boolean;
  syncing: boolean;
  pendingCount: number;
  lastError: string | null;
};

function sanitizeFilename(filename: string) {
  const sanitized = filename
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 96);

  return sanitized || "capture-file";
}

function createStoragePath(record: OfflineCaptureRecord) {
  const timestamp = record.createdAt
    .replace(/[:.]/g, "-")
    .replace(/Z$/, "");

  return [
    "organizations",
    record.organizationId,
    "sessions",
    record.sessionId,
    "captures",
    `${timestamp}-${record.clientMutationId}-${sanitizeFilename(
      record.metadata.filename,
    )}`,
  ].join("/");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Offline capture sync failed.";
}

function storageObjectAlreadyExists(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("already exists") ||
    normalized.includes("duplicate") ||
    normalized.includes("resource already exists")
  );
}

function getBlobSize(blob: Blob | null | undefined) {
  return typeof blob?.size === "number" ? blob.size : null;
}

function buildDiagnostics(
  record: OfflineCaptureRecord,
  storagePath: string | null,
  failureStage: OfflineCaptureFailureStage | null = null,
  serverObjectSize: number | null = record.metadata.diagnostics?.serverObjectSize ?? null,
) {
  return {
    ...record.metadata.diagnostics,
    localBlobSize: getBlobSize(record.blob),
    expectedSize: record.metadata.size,
    mimeType: record.metadata.mimeType,
    filename: record.metadata.filename,
    storagePath,
    uploadAttemptCount: record.retryCount + 1,
    serverObjectSize,
    failureStage,
  };
}

async function getAuthenticatedUserId() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

function canAutomaticallyRetry(record: OfflineCaptureRecord) {
  if (record.retryCount >= MAX_AUTOMATIC_RETRIES) {
    return false;
  }

  return (
    record.status === "local" ||
    record.status === "queued" ||
    record.status === "failed" ||
    record.status === "blocked" ||
    record.status === "finalized_unverified"
  );
}

async function updateRecord(
  record: OfflineCaptureRecord,
  patch: Partial<OfflineCaptureRecord> & {
    status?: QueueStatus;
  },
) {
  return saveQueuedCapture({
    ...record,
    ...patch,
    metadata: {
      ...record.metadata,
      ...(patch.metadata ?? {}),
    },
    uploadState: {
      ...record.uploadState,
      ...(patch.uploadState ?? {}),
    },
  });
}

async function syncOfflineSessions(userId: string) {
  const pendingSessions = await getPendingOfflineSessions(userId);

  for (const session of pendingSessions) {
    if (!getCurrentStatus().online) {
      break;
    }

    await updateOfflineSessionStatus(session.localSessionId, "creating_server_session", {
      lastError: null,
      serverCreateAttemptCount: (session.serverCreateAttemptCount ?? 0) + 1,
      serverCreateLastAttemptAt: new Date().toISOString(),
    });

    const response = await fetch("/api/dashboard/sessions/offline", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientSessionId: session.localSessionId,
        title: session.title,
        sessionType: session.sessionType,
        createdAt: session.createdAt,
        idempotencyKey: session.idempotencyKey,
        organizationId: session.organizationId,
      }),
    });

    const result = (await response.json()) as {
      ok?: boolean;
      sessionId?: string;
      error?: string;
    };

    if (!response.ok || !result.ok || !result.sessionId) {
      const message =
        result.error ?? "Unable to create offline session on the server.";

      await updateOfflineSessionStatus(session.localSessionId, "error", {
        retryCount: session.retryCount + 1,
        lastError: message,
      });

      throw new Error(message);
    }

    await retargetQueuedCaptures(
      session.localSessionId,
      result.sessionId,
      userId,
    );

    await updateOfflineSessionStatus(session.localSessionId, "partially_synced", {
      serverSessionId: result.sessionId,
      serverCreateRecoveredAt: new Date().toISOString(),
      lastError: null,
    });
  }
}


async function verifySyncedCapture(record: OfflineCaptureRecord, captureItemId: string, storagePath: string) {
  const response = await fetch("/api/offline/captures/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      sessionId: record.sessionId,
      captureItemId,
      localId: record.localId,
      clientMutationId: record.clientMutationId,
      storagePath,
      expectedSize: record.metadata.size,
      filename: record.metadata.filename,
      mimeType: record.metadata.mimeType,
      technicianNote: record.metadata.technicianNote,
      reportOrder: record.metadata.reportOrder,
    }),
  });

  const result = (await response.json().catch(() => null)) as { ok?: boolean; verified?: boolean; error?: string; mismatches?: string[]; serverObjectSize?: number | null; failureStage?: OfflineCaptureFailureStage } | null;

  if (!response.ok || !result?.ok || !result.verified) {
    const error = new Error(result?.error ?? (result?.mismatches?.length ? `Capture verification failed: ${result.mismatches.join(", ")}` : "Capture verification failed."));
    Object.assign(error, {
      serverObjectSize: result?.serverObjectSize ?? null,
      failureStage: result?.failureStage ?? "verify_failed",
    });
    throw error;
  }

  return { serverObjectSize: result.serverObjectSize ?? record.metadata.size };
}

export async function syncCapture(record: OfflineCaptureRecord) {
  const supabase = createClient();
  const storagePath =
    record.uploadState.storagePath ?? createStoragePath(record);

  let current = await updateRecord(record, {
    status: "uploading",
    lastError: null,
    uploadState: {
      ...record.uploadState,
      storagePath,
    },
    metadata: {
      ...record.metadata,
      uploadStatus: "uploading",
      uiError: undefined,
      diagnostics: buildDiagnostics(record, storagePath, null),
    },
  });

  const accessResult = await validateCaptureBillingAccess(
    current.sessionId,
    [
      {
        size: current.metadata.size,
        mimeType: current.metadata.mimeType,
      },
    ],
  );

  if (!accessResult.ok) {
    await updateRecord(current, {
      status: "blocked",
      retryCount: current.retryCount + 1,
      lastError: accessResult.error,
      metadata: {
        ...current.metadata,
        uploadStatus: "failed",
        uiError: accessResult.error,
        diagnostics: buildDiagnostics(current, storagePath, "upload_failed"),
      },
    });

    throw new Error(accessResult.error);
  }

  if (!current.uploadState.uploadedAt) {
    const localBlobSize = getBlobSize(current.blob);
    if (!current.blob || localBlobSize === null || localBlobSize <= 0) {
      const message =
        "Local blob missing/empty. The locally saved capture is empty and cannot be uploaded.";

      await updateRecord(current, {
        status: "blocked",
        retryCount: current.retryCount + 1,
        lastError: message,
        uploadState: { ...current.uploadState, uploadedAt: null },
        metadata: {
          ...current.metadata,
          uploadStatus: "failed",
          uiError: message,
          diagnostics: buildDiagnostics(current, storagePath, "local_blob_empty"),
        },
      });

      throw new Error(message);
    }

    if (Number.isFinite(current.metadata.size) && current.metadata.size > 0 && current.metadata.size !== localBlobSize) {
      const message = `Local blob size mismatch. Expected ${current.metadata.size} bytes but found ${localBlobSize} bytes.`;
      await updateRecord(current, {
        status: "blocked",
        retryCount: current.retryCount + 1,
        lastError: message,
        uploadState: { ...current.uploadState, uploadedAt: null },
        metadata: {
          ...current.metadata,
          uploadStatus: "failed",
          uiError: message,
          diagnostics: buildDiagnostics(current, storagePath, "local_blob_empty"),
        },
      });
      throw new Error(message);
    }

    const file =
      current.blob instanceof File
        ? current.blob
        : new File(
            [current.blob],
            current.metadata.filename,
            {
              type: current.metadata.mimeType,
            },
          );

    if (file.size <= 0 || current.blob.size <= 0) {
      const message =
        "The locally saved capture is empty and cannot be uploaded.";

      await updateRecord(current, {
        status: "blocked",
        retryCount: current.retryCount + 1,
        lastError: message,
        metadata: {
          ...current.metadata,
          uploadStatus: "failed",
          uiError: message,
          diagnostics: buildDiagnostics(current, storagePath, "local_blob_empty"),
        },
      });

      throw new Error(message);
    }

    const { error: uploadError } = await supabase.storage
      .from(CAPTURE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        contentType: current.metadata.mimeType,
        upsert: Boolean(current.uploadState.uploadedAt),
      });

    if (uploadError) {
      if (storageObjectAlreadyExists(uploadError.message)) {
        const { error: overwriteError } = await supabase.storage
          .from(CAPTURE_BUCKET)
          .upload(storagePath, file, {
            cacheControl: "3600",
            contentType: current.metadata.mimeType,
            upsert: true,
          });

        if (overwriteError) {
          const message = getErrorMessage(overwriteError);

          await updateRecord(current, {
            status: "failed",
            retryCount: current.retryCount + 1,
            lastError: message,
            metadata: {
              ...current.metadata,
              uploadStatus: "failed",
              uiError: message,
              diagnostics: buildDiagnostics(current, storagePath, "upload_failed"),
            },
          });

          throw new Error(message);
        }
      } else {
        const message = getErrorMessage(uploadError);

        await updateRecord(current, {
          status: "failed",
          retryCount: current.retryCount + 1,
          lastError: message,
          metadata: {
            ...current.metadata,
            uploadStatus: "failed",
            uiError: message,
            diagnostics: buildDiagnostics(current, storagePath, "upload_failed"),
          },
        });

        throw new Error(message);
      }
    }

    current = await updateRecord(current, {
      status: "creating_record",
      uploadState: {
        ...current.uploadState,
        storagePath,
        uploadedAt: new Date().toISOString(),
      },
      metadata: {
        ...current.metadata,
        uploadStatus: "finishing",
        storageUploaded: true,
        diagnostics: buildDiagnostics(current, storagePath, null),
      },
    });
  } else {
    current = await updateRecord(current, {
      status: "creating_record",
      metadata: {
        ...current.metadata,
        uploadStatus: "finishing",
        storageUploaded: true,
        diagnostics: buildDiagnostics(current, storagePath, null),
      },
    });
  }

  const result = await createCaptureRecordFromUploadedFile({
    sessionId: current.sessionId,
    storagePath,
    filename: current.metadata.filename,
    mimeType: current.metadata.mimeType,
    size: current.metadata.size,
    captureIntent:
      current.metadata.captureIntent as CaptureIntent,
    manualType:
      current.metadata.manualType as CaptureType | null,
    guidedStep: current.metadata.guidedStep ?? undefined,
    guidedLabel: current.metadata.guidedLabel ?? undefined,
    workflow: current.metadata.workflow ?? undefined,
    technicianNote: current.metadata.technicianNote,
    transcriptStatus:
      current.metadata.transcriptStatus as
        | "not_started"
        | "pending"
        | "completed"
        | "failed"
        | "unavailable",
    noteSource:
      current.metadata.noteSource as
        | "manual"
        | "voice"
        | "edited",
    reportOrder: current.metadata.reportOrder,
    includeInReport: current.metadata.includeInReport,
    sourceDocumentType: null,
    sourceDocumentLabel: null,
  });

  if (!result.ok) {
    const message =
      result.message ??
      result.error ??
      "CRED could not finish saving this capture.";

    await updateRecord(current, {
      status: result.storageUploaded ? "blocked" : "failed",
      retryCount: current.retryCount + 1,
      lastError: message,
      uploadState: {
        ...current.uploadState,
        uploadedAt: result.storageUploaded === false ? null : current.uploadState.uploadedAt,
      },
      metadata: {
        ...current.metadata,
        uploadStatus: result.storageUploaded
          ? "metadata_recovery"
          : "failed",
        uiError: message,
        storageUploaded:
          result.storageUploaded ??
          current.metadata.storageUploaded,
        diagnostics: buildDiagnostics(
          current,
          storagePath,
          message.toLowerCase().includes("empty in storage") ? "storage_upload_empty" : "finalize_failed",
          message.toLowerCase().includes("empty in storage") ? 0 : current.metadata.diagnostics?.serverObjectSize ?? null,
        ),
      },
    });

    throw new Error(message);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("cred:offline-capture-synced", {
        detail: {
          localId: current.localId,
          sessionId: current.sessionId,
          captureItemId: result.captureItemId,
        },
      }),
    );
  }

  current = await updateRecord(current, {
    status: "verifying",
    serverCaptureId: result.captureItemId,
    uploadState: {
      ...current.uploadState,
      finalizedAt: new Date().toISOString(),
    },
    metadata: {
      ...current.metadata,
      captureItemId: result.captureItemId,
      uploadStatus: "verifying",
      verified: false,
      diagnostics: buildDiagnostics(current, storagePath, null),
    },
  });

  try {
    const verification = await verifySyncedCapture(current, result.captureItemId, storagePath);
    current = await updateRecord(current, {
      metadata: {
        ...current.metadata,
        diagnostics: buildDiagnostics(current, storagePath, null, verification.serverObjectSize),
      },
    });
  } catch (verificationError) {
    const message = getErrorMessage(verificationError);
    const serverObjectSize = typeof (verificationError as { serverObjectSize?: unknown }).serverObjectSize === "number"
      ? (verificationError as { serverObjectSize: number }).serverObjectSize
      : null;
    const failureStage = ((verificationError as { failureStage?: OfflineCaptureFailureStage }).failureStage ?? "verify_failed");
    await updateRecord(current, {
      status: "finalized_unverified",
      retryCount: current.retryCount + 1,
      lastError: message,
      uploadState: {
        ...current.uploadState,
        uploadedAt: failureStage === "storage_upload_empty" ? null : current.uploadState.uploadedAt,
      },
      metadata: {
        ...current.metadata,
        uploadStatus: "verification_failed",
        uiError: message,
        verified: false,
        diagnostics: buildDiagnostics(current, storagePath, failureStage, serverObjectSize),
      },
    });
    throw verificationError;
  }

  current = await updateRecord(current, {
    status: "synced",
    serverCaptureId: result.captureItemId,
    uploadState: {
      ...current.uploadState,
      finalizedAt: current.uploadState.finalizedAt ?? new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
    },
    metadata: {
      ...current.metadata,
      captureItemId: result.captureItemId,
      uploadStatus: "verified",
      verified: true,
    },
  });

  await recordVerifiedOfflineCapture(current.localSessionId, current.metadata.reportOrder !== null ? current.metadata.reportOrder + 1 : 1);
  await removeCapture(current.localId);

  return result.captureItemId;
}

export class OfflineSyncEngine {
  private running = false;
  private syncing = false;
  private listeners = new Set<SyncEngineListener>();
  private unsubscribeConnectivity: (() => void) | null =
    null;
  private pendingCount = 0;
  private lastError: string | null = null;

  start() {
    if (this.running) {
      return;
    }

    this.running = true;

    this.unsubscribeConnectivity = subscribe((status) => {
      if (status.online) {
        void this.syncNow();
      }
    });

    void this.refreshPendingCount();
    this.emit();
  }

  stop() {
    this.running = false;
    this.unsubscribeConnectivity?.();
    this.unsubscribeConnectivity = null;
    this.emit();
  }

  subscribe(listener: SyncEngineListener) {
    this.listeners.add(listener);
    listener(this.getState());

    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): OfflineSyncEngineState {
    return {
      running: this.running,
      syncing: this.syncing,
      pendingCount: this.pendingCount,
      lastError: this.lastError,
    };
  }

  async syncNow() {
    if (this.syncing) {
      return this.getState();
    }

    if (!getCurrentStatus().online) {
      return this.getState();
    }

    this.syncing = true;
    this.lastError = null;
    this.emit();

    try {
      await this.processQueue();
    } catch (error) {
      this.lastError = getErrorMessage(error);
    } finally {
      this.syncing = false;
      await this.refreshPendingCount();
      this.emit();
    }

    return this.getState();
  }

  async processQueue() {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      throw new Error(
        "Your sign-in expired. Sign in again to sync queued captures.",
      );
    }

    await syncOfflineSessions(userId);

    const pending = await getPendingCaptures(userId);
    const retryable = pending
      .filter(canAutomaticallyRetry)
      .sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      );

    this.pendingCount = pending.length;
    this.emit();

    const failures: string[] = [];

    for (const record of retryable) {
      if (!getCurrentStatus().online) {
        break;
      }

      try {
        await syncCapture(record);
      } catch (error) {
        failures.push(getErrorMessage(error));
      }

      await this.refreshPendingCount();
      this.emit();
    }

    if (failures.length > 0) {
      throw new Error(failures[0]);
    }
  }

  private async refreshPendingCount() {
    try {
      const userId = await getAuthenticatedUserId();

      this.pendingCount = userId
        ? (await getPendingCaptures(userId)).length
        : 0;
    } catch {
      this.pendingCount = 0;
    }
  }

  private emit() {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }
}

let offlineSyncEngine: OfflineSyncEngine | null = null;

export function getOfflineSyncEngine() {
  offlineSyncEngine ??= new OfflineSyncEngine();
  return offlineSyncEngine;
}
