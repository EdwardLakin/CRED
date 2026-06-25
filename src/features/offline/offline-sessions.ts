import { getOfflineDb } from "@/features/offline/db";
import type {
  OfflineSessionRecord,
  OfflineSessionStatus,
} from "@/features/offline/types";

function now() {
  return new Date().toISOString();
}

function createId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type CreateOfflineSessionInput = {
  organizationId: string;
  userId: string;
  title?: string;
  sessionType?: string;
};

export async function createOfflineSession(
  input: CreateOfflineSessionInput,
) {
  const db = await getOfflineDb();
  const timestamp = now();
  const localSessionId = createId();

  const record: OfflineSessionRecord = {
    localSessionId,
    organizationId: input.organizationId,
    userId: input.userId,
    title:
      input.title?.trim() ||
      `New Offline Session ${new Date(timestamp).toLocaleString()}`,
    sessionType:
      input.sessionType?.trim() ||
      "General Evidence Report",
    status: "local",
    serverSessionId: null,
    retryCount: 0,
    lastError: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.put("offlineSessions", record);
  return record;
}

export async function getOfflineSession(
  localSessionId: string,
) {
  const db = await getOfflineDb();
  return db.get("offlineSessions", localSessionId);
}

export async function getPendingOfflineSessions(
  userId: string,
) {
  const db = await getOfflineDb();
  const records = await db.getAllFromIndex(
    "offlineSessions",
    "by-user",
    userId,
  );

  return records
    .filter(
      (record) =>
        record.status !== "ready" ||
        !record.serverSessionId,
    )
    .sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
}

export async function getAllOfflineSessions(
  userId: string,
) {
  const db = await getOfflineDb();
  const records = await db.getAllFromIndex(
    "offlineSessions",
    "by-user",
    userId,
  );

  return records.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function updateOfflineSession(
  localSessionId: string,
  patch: Partial<
    Omit<
      OfflineSessionRecord,
      "localSessionId" | "createdAt"
    >
  >,
) {
  const db = await getOfflineDb();
  const transaction = db.transaction(
    "offlineSessions",
    "readwrite",
  );
  const store = transaction.objectStore(
    "offlineSessions",
  );
  const current = await store.get(localSessionId);

  if (!current) {
    await transaction.done;
    return null;
  }

  const updated: OfflineSessionRecord = {
    ...current,
    ...patch,
    localSessionId: current.localSessionId,
    createdAt: current.createdAt,
    updatedAt: now(),
  };

  await store.put(updated);
  await transaction.done;

  return updated;
}

export async function setOfflineSessionStatus(
  localSessionId: string,
  status: OfflineSessionStatus,
  options: {
    serverSessionId?: string | null;
    lastError?: string | null;
    incrementRetry?: boolean;
  } = {},
) {
  const current = await getOfflineSession(localSessionId);

  if (!current) {
    return null;
  }

  return updateOfflineSession(localSessionId, {
    status,
    serverSessionId:
      options.serverSessionId !== undefined
        ? options.serverSessionId
        : current.serverSessionId,
    lastError:
      options.lastError !== undefined
        ? options.lastError
        : current.lastError,
    retryCount: options.incrementRetry
      ? current.retryCount + 1
      : current.retryCount,
  });
}
