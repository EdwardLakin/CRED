import { getOfflineDb } from "@/features/offline/db";
import type { OfflineCaptureRecord, QueueStatus } from "@/features/offline/types";

export type QueueCaptureInput = Omit<
  OfflineCaptureRecord,
  | "localId"
  | "clientMutationId"
  | "status"
  | "retryCount"
  | "lastError"
  | "serverCaptureId"
  | "createdAt"
  | "updatedAt"
> & {
  localId?: string;
  clientMutationId?: string;
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

  const record: OfflineCaptureRecord = {
    ...input,
    localId: input.localId ?? createId(),
    clientMutationId: input.clientMutationId ?? createId(),
    status: input.status ?? "queued",
    retryCount: 0,
    lastError: null,
    serverCaptureId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.put("queuedCaptures", record);
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
