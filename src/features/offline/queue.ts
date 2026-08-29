import { isSourceDocumentType } from "@/features/capture/types";
import { getOfflineDb } from "@/features/offline/db";
import { incrementOfflineSessionCaptureCount } from "@/features/offline/offline-sessions";
import type {
  OfflineCaptureRecord,
  PersistedOfflineCaptureRecord,
  QueueStatus,
} from "@/features/offline/types";

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

export function normalizeQueuedCaptureItemMetadata<
  T extends OfflineCaptureRecord | PersistedOfflineCaptureRecord,
>(record: T): T {
  const metadata = record.metadata as OfflineCaptureRecord["metadata"] & {
    clientItemId?: unknown;
    documentationItemId?: unknown;
    attachmentOrder?: unknown;
    sourceKind?: unknown;
    attachmentKind?: unknown;
    sourceDocumentType?: unknown;
    sourceDocumentLabel?: unknown;
  };
  const clientItemId =
    typeof metadata.clientItemId === "string" && metadata.clientItemId.trim()
      ? metadata.clientItemId.trim().slice(0, 160)
      : record.localId;
  const documentationItemId =
    typeof metadata.documentationItemId === "string" &&
    metadata.documentationItemId.trim()
      ? metadata.documentationItemId.trim()
      : null;
  const rawSourceDocumentType =
    typeof metadata.sourceDocumentType === "string" &&
    metadata.sourceDocumentType.trim()
      ? metadata.sourceDocumentType.trim()
      : null;
  const sourceDocumentType =
    rawSourceDocumentType && isSourceDocumentType(rawSourceDocumentType)
      ? rawSourceDocumentType
      : null;
  const sourceDocumentLabel =
    typeof metadata.sourceDocumentLabel === "string" &&
    metadata.sourceDocumentLabel.trim()
      ? metadata.sourceDocumentLabel.trim().slice(0, 80)
      : null;
  const sourceKind =
    metadata.sourceKind === "document" ||
    metadata.sourceKind === "note" ||
    metadata.sourceKind === "observation"
      ? metadata.sourceKind
      : sourceDocumentType || metadata.manualType === "document"
        ? "document"
        : metadata.manualType === "voice_note" ||
            metadata.manualType === "text_note"
          ? "note"
          : "observation";
  const attachmentOrder =
    Number.isInteger(metadata.attachmentOrder) &&
    Number(metadata.attachmentOrder) > 0
      ? Number(metadata.attachmentOrder)
      : 1;
  const attachmentKind =
    metadata.attachmentKind === "primary" ||
    metadata.attachmentKind === "supporting" ||
    metadata.attachmentKind === "document" ||
    metadata.attachmentKind === "note"
      ? metadata.attachmentKind
      : sourceKind === "document"
        ? "document"
        : sourceKind === "note"
          ? "note"
          : attachmentOrder === 1
            ? "primary"
            : "supporting";

  return {
    ...record,
    metadata: {
      ...metadata,
      clientItemId,
      documentationItemId,
      attachmentOrder,
      sourceKind,
      attachmentKind,
      sourceDocumentType,
      sourceDocumentLabel,
    },
  } as T;
}

async function normalizeCaptureBlobForIndexedDb(
  record: PersistedOfflineCaptureRecord,
): Promise<OfflineCaptureRecord> {
  const normalizedRecord = normalizeQueuedCaptureItemMetadata(record);
  const source = normalizedRecord.blob;
  if (!(source instanceof Blob) && !(source instanceof ArrayBuffer)) {
    throw new Error("IndexedDB capture record does not contain media byte data.");
  }

  const blob =
    source instanceof ArrayBuffer
      ? new Blob([source], {
          type:
            normalizedRecord.metadata.mimeType || "application/octet-stream",
        })
      : source instanceof File
        ? new Blob([await source.arrayBuffer()], {
            type:
              normalizedRecord.metadata.mimeType ||
              source.type ||
              "application/octet-stream",
          })
        : source;

  return {
    ...normalizedRecord,
    blob,
  };
}

async function putQueuedCapture(record: OfflineCaptureRecord) {
  try {
    const prepared = await normalizeCaptureBlobForIndexedDb(record);
    const blobBytes = await prepared.blob.arrayBuffer();
    await dbPutQueuedCapture({ ...prepared, blob: blobBytes });
    return prepared;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`IndexedDB queued capture write failed while preparing Blob data: ${message}`);
  }
}

async function dbPutQueuedCapture(record: PersistedOfflineCaptureRecord) {
  const db = await getOfflineDb();
  await db.put("queuedCaptures", record);
}

async function getAllQueuedCaptures() {
  const db = await getOfflineDb();
  const records = await db.getAll("queuedCaptures");
  return Promise.all(records.map(normalizeCaptureBlobForIndexedDb));
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
  const storedRecord = await db.get("queuedCaptures", localId);

  if (!storedRecord) {
    return null;
  }

  const record = await normalizeCaptureBlobForIndexedDb(storedRecord);

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

export type QueuedServerSessionSnapshot = {
  localId: string;
  localSessionId: string;
  serverSessionId: string;
};

export async function getQueuedServerSessionSnapshot(userId: string) {
  const db = await getOfflineDb();
  const records = await db.getAll("queuedCaptures");

  return records.flatMap((record): QueuedServerSessionSnapshot[] =>
    record.userId === userId && record.serverSessionId
      ? [{
          localId: record.localId,
          localSessionId: record.localSessionId,
          serverSessionId: record.serverSessionId,
        }]
      : [],
  );
}

export async function removeQueuedCapturesForMissingServerSessions(
  userId: string,
  staleSnapshot: readonly QueuedServerSessionSnapshot[],
) {
  if (staleSnapshot.length === 0) {
    return { removedCount: 0, localSessionIds: new Set<string>() };
  }

  const db = await getOfflineDb();
  const transaction = db.transaction("queuedCaptures", "readwrite");
  const store = transaction.objectStore("queuedCaptures");
  const localSessionIds = new Set<string>();
  let removedCount = 0;

  for (const candidate of staleSnapshot) {
    const current = await store.get(candidate.localId);
    if (
      current?.userId === userId &&
      current.localSessionId === candidate.localSessionId &&
      current.serverSessionId === candidate.serverSessionId
    ) {
      await store.delete(candidate.localId);
      localSessionIds.add(candidate.localSessionId);
      removedCount += 1;
    }
  }

  await transaction.done;
  return { removedCount, localSessionIds };
}

export async function getPendingCaptures(userId?: string) {
  const db = await getOfflineDb();
  const records = await db.getAll("queuedCaptures");
  const normalizedRecords = await Promise.all(
    records.map(normalizeCaptureBlobForIndexedDb),
  );
  const upgradedRecords = normalizedRecords.filter((record, index) => {
    const previous = records[index]?.metadata as Partial<OfflineCaptureRecord["metadata"]> | undefined;
    return (
      previous?.clientItemId !== record.metadata.clientItemId ||
      previous?.documentationItemId !== record.metadata.documentationItemId ||
      previous?.attachmentOrder !== record.metadata.attachmentOrder ||
      previous?.sourceKind !== record.metadata.sourceKind ||
      previous?.attachmentKind !== record.metadata.attachmentKind ||
      previous?.sourceDocumentType !== record.metadata.sourceDocumentType ||
      previous?.sourceDocumentLabel !== record.metadata.sourceDocumentLabel
    );
  });
  await Promise.all(upgradedRecords.map((record) => putQueuedCapture(record)));
  const pending = normalizedRecords.filter(isActionableQueuedCapture);

  return userId ? pending.filter((record) => record.userId === userId) : pending;
}

export async function getQueuedCapture(localId: string) {
  const db = await getOfflineDb();
  const record = await db.get("queuedCaptures", localId);
  return record ? normalizeCaptureBlobForIndexedDb(record) : undefined;
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

  const normalizedCurrent = await normalizeCaptureBlobForIndexedDb(current);

  const updated: OfflineCaptureRecord = {
    ...updater(normalizedCurrent),
    localId: normalizedCurrent.localId,
    updatedAt: now(),
  };

  await transaction.done;
  await putQueuedCapture(updated);

  return updated;
}

export async function getCapturesForLocalSession(localSessionId: string, userId?: string) {
  const records = await getAllQueuedCaptures();
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
  const records = await getAllQueuedCaptures();
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
  const records = await getAllQueuedCaptures();
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

export async function getSyncQueueDebugItems(userId: string) {
  const db = await getOfflineDb();
  const records = await db.getAll("queuedCaptures");
  const scoped = records.filter((record) => record.userId === userId);
  return scoped.map((record) => ({ localId: record.localId, filename: record.metadata.filename, status: record.status, serverCaptureId: record.serverCaptureId, updatedAt: record.updatedAt, lastError: record.lastError, actionable: isActionableQueuedCapture(record) }));
}
