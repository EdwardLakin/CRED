import { getOfflineDb } from "@/features/offline/db";
import type {
  OfflineSessionRecord,
  OfflineSessionStatus,
} from "@/features/offline/types";

function now() {
  return new Date().toISOString();
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `offline-${crypto.randomUUID()}`;
  }

  return `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function createOfflineSessionDraft(input: {
  organizationId: string;
  userId: string;
  title?: string;
  sessionType?: string;
}) {
  const db = await getOfflineDb();
  const timestamp = now();

  const record: OfflineSessionRecord = {
    localSessionId: createId(),
    organizationId: input.organizationId,
    userId: input.userId,
    title: input.title || `Offline Evidence ${new Date().toLocaleString()}`,
    sessionType: input.sessionType || "General Evidence Report",
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

export async function getPendingOfflineSessions(userId: string) {
  const db = await getOfflineDb();
  const records = await db.getAllFromIndex("offlineSessions", "by-user", userId);

  return records
    .filter((record) => record.status === "local" || record.status === "failed")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function saveOfflineSession(record: OfflineSessionRecord) {
  const db = await getOfflineDb();
  const updated = { ...record, updatedAt: now() };
  await db.put("offlineSessions", updated);
  return updated;
}

export async function updateOfflineSessionStatus(
  localSessionId: string,
  status: OfflineSessionStatus,
  patch: Partial<OfflineSessionRecord> = {},
) {
  const db = await getOfflineDb();
  const existing = await db.get("offlineSessions", localSessionId);

  if (!existing) return null;

  return saveOfflineSession({
    ...existing,
    ...patch,
    status,
  });
}
