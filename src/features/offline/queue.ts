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

function now() {
  return new Date().toISOString();
}

export async function queueCapture(input: QueueCaptureInput) {
  const db = await getOfflineDb();
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

  await db.put("queuedCaptures", record);
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

  await db.put("queuedCaptures", updated);
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
  const pending = records.filter((record) => record.status !== "synced");

  return userId ? pending.filter((record) => record.userId === userId) : pending;
}

export async function getQueuedCapture(localId: string) {
  const db = await getOfflineDb();
  return db.get("queuedCaptures", localId);
}


export async function saveQueuedCapture(record: OfflineCaptureRecord) {
  const db = await getOfflineDb();

  const updated: OfflineCaptureRecord = {
    ...record,
    updatedAt: now(),
  };

  await db.put("queuedCaptures", updated);
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

  await store.put(updated);
  await transaction.done;

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
      .map((record) => db.put("queuedCaptures", record)),
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
