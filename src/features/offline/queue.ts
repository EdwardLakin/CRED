import { getOfflineDb } from "@/features/offline/db";
import { incrementOfflineSessionCaptureCount } from "@/features/offline/offline-sessions";
import type { OfflineCaptureRecord, QueueStatus } from "@/features/offline/types";

export type QueueCaptureInput = Omit<
  OfflineCaptureRecord,
  | "localId"
  | "clientMutationId"
  | "localSessionId"
  | "serverSessionId"
  | "status"
  | "retryCount"
  | "lastError"
  | "serverCaptureId"
  | "createdAt"
  | "updatedAt"
> & {
  localId?: string;
  clientMutationId?: string;
  localSessionId?: string;
  serverSessionId?: string | null;
  status?: QueueStatus;
};

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const ACTIONABLE_QUEUE_STATUSES: QueueStatus[] = ["local", "queued", "uploading", "creating_record", "blocked", "failed"];
export function isActionableQueuedCapture(record: Pick<OfflineCaptureRecord, "status" | "serverCaptureId">) {
  if (record.status === "synced") return false;
  if ((record.status === "finalized_unverified" || record.status === "verifying") && record.serverCaptureId) return false;
  return ACTIONABLE_QUEUE_STATUSES.includes(record.status);
}

function now() {
  return new Date().toISOString();
}

async function normalizeCaptureBlobForIndexedDb(record: OfflineCaptureRecord) {
  const source = record.blob;
  if (!(source instanceof Blob)) {
    throw new Error("IndexedDB capture record does not contain Blob data.");
  }

  const blob = source instanceof File
    ? new Blob([await source.arrayBuffer()], {
        type: record.metadata.mimeType || source.type || "application/octet-stream",
      })
    : source;

  return {
    ...record,
    blob,
  };
}

async function putQueuedCapture(record: OfflineCaptureRecord) {
  try {
    return dbPutQueuedCapture(await normalizeCaptureBlobForIndexedDb(record));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`IndexedDB queued capture write failed while preparing Blob data: ${message}`);
  }
}

async function dbPutQueuedCapture(record: OfflineCaptureRecord) {
  const db = await getOfflineDb();
  await db.put("queuedCaptures", record);
  return record;
}

export async function queueCapture(input: QueueCaptureInput) {
  const timestamp = now();

  const localId = input.localId ?? createId();
  const localSessionId = input.localSessionId ?? (input.sessionId.startsWith("offline-") ? input.sessionId : input.sessionId);
  const record: OfflineCaptureRecord = {
    ...input,
    localId,
    localSessionId,
    serverSessionId: input.serverSessionId ?? (input.sessionId.startsWith("offline-") ? null : input.sessionId),
    clientMutationId: input.clientMutationId ?? localId,
    status: input.status ?? "queued",
    retryCount: 0,
    lastError: null,
    serverCaptureId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await putQueuedCapture(record);
  await incrementOfflineSessionCaptureCount(record.localSessionId);
  return record;
}

export async function removeCapture(localId: string) {
  const db = await getOfflineDb();
  await db.delete("queuedCaptures", localId);
}

export async function retryCapture(localId: string) {
  const db = await getOfflineDb();
  const record = await db.get("queuedCaptures", localId);

  if (!record) {
    return null;
  }

  const updated: OfflineCaptureRecord = {
    ...record,
    status: "queued",
    lastError: null,
    updatedAt: now(),
  };

  await putQueuedCapture(updated);
  return updated;
}

export async function clearQueue(userId?: string) {
  const db = await getOfflineDb();

  if (!userId) {
    await db.clear("queuedCaptures");
    return;
  }

  const records = await db.getAll("queuedCaptures");

  await Promise.all(
    records
      .filter((record) => record.userId === userId)
      .map((record) => db.delete("queuedCaptures", record.localId)),
  );
}

export async function getPendingCaptures(userId?: string) {
  const db = await getOfflineDb();
  const records = await db.getAll("queuedCaptures");
  const pending = records.filter(isActionableQueuedCapture);

  return userId ? pending.filter((record) => record.userId === userId) : pending;
}

export async function getQueuedCapture(localId: string) {
  const db = await getOfflineDb();
  return db.get("queuedCaptures", localId);
}


export async function saveQueuedCapture(record: OfflineCaptureRecord) {
  const updated: OfflineCaptureRecord = {
    ...record,
    updatedAt: now(),
  };

  await putQueuedCapture(updated);
  return updated;
}

export async function updateQueuedCapture(
  localId: string,
  updater: (
    record: OfflineCaptureRecord,
  ) => OfflineCaptureRecord,
) {
  const db = await getOfflineDb();
  const transaction = db.transaction(
    "queuedCaptures",
    "readwrite",
  );
  const store = transaction.objectStore("queuedCaptures");
  const current = await store.get(localId);

  if (!current) {
    await transaction.done;
    return null;
  }

  const updated: OfflineCaptureRecord = {
    ...updater(current),
    localId: current.localId,
    updatedAt: now(),
  };

  await transaction.done;
  await putQueuedCapture(updated);

  return updated;
}

export async function getCapturesForLocalSession(localSessionId: string, userId?: string) {
  const db = await getOfflineDb();
  const records = await db.getAll("queuedCaptures");
  return records.filter((record) => record.localSessionId === localSessionId && (!userId || record.userId === userId));
}

export async function deleteCapturesForLocalSession(localSessionId: string, userId: string, organizationId: string) {
  const db = await getOfflineDb();
  const records = await db.getAll("queuedCaptures");
  const matching = records.filter((record) => record.localSessionId === localSessionId && record.userId === userId && record.organizationId === organizationId);
  await Promise.all(matching.map((record) => db.delete("queuedCaptures", record.localId)));
  return matching.length;
}

function sortCapturesForReportOrder(records: OfflineCaptureRecord[]) {
  return [...records].sort((left, right) =>
    (left.metadata.reportOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.metadata.reportOrder ?? Number.MAX_SAFE_INTEGER) ||
    left.createdAt.localeCompare(right.createdAt),
  );
}

export async function normalizeSessionReportOrders(
  localSessionId: string,
  identity: { userId: string; organizationId: string },
) {
  const db = await getOfflineDb();
  const records = await db.getAll("queuedCaptures");
  const matching = sortCapturesForReportOrder(
    records.filter(
      (record) =>
        record.localSessionId === localSessionId &&
        record.userId === identity.userId &&
        record.organizationId === identity.organizationId,
    ),
  );

  const normalized = matching.map((record, index) => ({
    ...record,
    metadata: {
      ...record.metadata,
      reportOrder: index + 1,
    },
    updatedAt: record.metadata.reportOrder === index + 1 ? record.updatedAt : now(),
  }));

  await Promise.all(
    normalized
      .filter((record, index) => matching[index]?.metadata.reportOrder !== index + 1)
      .map((record) => putQueuedCapture(record)),
  );

  return normalized;
}

export function positiveReportOrder(value: number | null | undefined) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

export async function retargetQueuedCaptures(
  localSessionId: string,
  toSessionId: string,
  userId: string,
) {
  const db = await getOfflineDb();
  const records = await db.getAll("queuedCaptures");
  const matching = records.filter(
    (record) =>
      record.localSessionId === localSessionId &&
      record.userId === userId,
  );

  await Promise.all(
    matching.map((record) =>
      saveQueuedCapture({
        ...record,
        sessionId: toSessionId,
        serverSessionId: toSessionId,
        status: record.status === "synced" ? record.status : "queued",
      }),
    ),
  );

  return matching.length;
}

export async function cleanupCompletedQueuedCaptures(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const db = await getOfflineDb();
  const records = await db.getAll("queuedCaptures");
  const cutoff = Date.now() - maxAgeMs;
  const completed = records.filter((record) => record.status === "synced" || ((record.status === "finalized_unverified" || record.status === "verifying") && record.serverCaptureId && Date.parse(record.updatedAt) < cutoff));
  await Promise.all(completed.map((record) => db.delete("queuedCaptures", record.localId)));
  return completed.length;
}

export async function getSyncQueueDebugItems(userId?: string) {
  const db = await getOfflineDb();
  const records = await db.getAll("queuedCaptures");
  const scoped = userId ? records.filter((record) => record.userId === userId) : records;
  return scoped.map((record) => ({ localId: record.localId, status: record.status, serverCaptureId: record.serverCaptureId, updatedAt: record.updatedAt, lastError: record.lastError, actionable: isActionableQueuedCapture(record) }));
}
