import { getOfflineDb } from "@/features/offline/db";
import type { OfflineSessionRecord, OfflineSessionStatus } from "@/features/offline/types";

function now() {
  return new Date().toISOString();
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `offline-${crypto.randomUUID()}`;
  }

  return `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createOfflineSessionIdempotencyKey(organizationId: string, localSessionId: string) {
  return `offline-session:${organizationId}:${localSessionId}`;
}

function normalizeSession(record: OfflineSessionRecord): OfflineSessionRecord {
  const timestamp = now();
  return {
    ...record,
    status: record.status === "local" ? "ready_to_sync" : record.status === "creating" ? "creating_server_session" : record.status === "ready" ? "synced" : record.status === "failed" ? "error" : record.status,
    lastOpenedAt: record.lastOpenedAt ?? record.updatedAt ?? record.createdAt ?? timestamp,
    idempotencyKey: record.idempotencyKey ?? createOfflineSessionIdempotencyKey(record.organizationId, record.localSessionId),
    serverCreateAttemptCount: record.serverCreateAttemptCount ?? 0,
    serverCreateLastAttemptAt: record.serverCreateLastAttemptAt ?? null,
    serverCreateRecoveredAt: record.serverCreateRecoveredAt ?? null,
    syncedAt: record.syncedAt ?? null,
    originalCaptureCount: record.originalCaptureCount ?? 0,
    verifiedCaptureCount: record.verifiedCaptureCount ?? 0,
  };
}

export async function createOfflineSessionDraft(input: {
  organizationId: string;
  userId: string;
  title?: string;
  sessionType?: string;
}) {
  const db = await getOfflineDb();
  const timestamp = now();
  const localSessionId = createId();

  const record: OfflineSessionRecord = {
    localSessionId,
    organizationId: input.organizationId,
    userId: input.userId,
    title: input.title || `Offline Evidence ${new Date().toLocaleString()}`,
    sessionType: input.sessionType || "General Evidence Report",
    status: "capturing",
    serverSessionId: null,
    idempotencyKey: createOfflineSessionIdempotencyKey(input.organizationId, localSessionId),
    lastOpenedAt: timestamp,
    serverCreateAttemptCount: 0,
    serverCreateLastAttemptAt: null,
    serverCreateRecoveredAt: null,
    retryCount: 0,
    lastError: null,
    syncedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.put("offlineSessions", record);
  return record;
}

export async function getOfflineSessionsForIdentity(userId: string, organizationId: string) {
  const db = await getOfflineDb();
  const records = await db.getAllFromIndex("offlineSessions", "by-organization-user", [organizationId, userId]);
  const normalized = records.map(normalizeSession);
  await Promise.all(records.map((record, index) => normalized[index] === record ? Promise.resolve() : db.put("offlineSessions", normalized[index])));
  return normalized.sort((left, right) => (right.lastOpenedAt ?? right.updatedAt).localeCompare(left.lastOpenedAt ?? left.updatedAt));
}

export async function getPendingOfflineSessions(userId: string) {
  const db = await getOfflineDb();
  const records = (await db.getAllFromIndex("offlineSessions", "by-user", userId)).map(normalizeSession);

  return records
    .filter((record) => !record.serverSessionId || ["draft", "capturing", "ready_to_sync", "creating_server_session", "partially_synced", "error"].includes(record.status))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function saveOfflineSession(record: OfflineSessionRecord) {
  const db = await getOfflineDb();
  const updated = normalizeSession({ ...record, updatedAt: now() });
  await db.put("offlineSessions", updated);
  return updated;
}

export async function touchOfflineSession(localSessionId: string) {
  const db = await getOfflineDb();
  const existing = await db.get("offlineSessions", localSessionId);
  if (!existing) return null;
  return saveOfflineSession({ ...existing, lastOpenedAt: now() });
}

export async function updateOfflineSessionStatus(localSessionId: string, status: OfflineSessionStatus, patch: Partial<OfflineSessionRecord> = {}) {
  const db = await getOfflineDb();
  const existing = await db.get("offlineSessions", localSessionId);
  if (!existing) return null;
  return saveOfflineSession({ ...existing, ...patch, status });
}

export async function getOfflineSession(localSessionId: string) {
  const db = await getOfflineDb();
  const record = await db.get("offlineSessions", localSessionId);
  if (!record) return undefined;
  const normalized = normalizeSession(record);
  if (normalized !== record) await db.put("offlineSessions", normalized);
  return normalized;
}

export async function getMostRecentOfflineSession(userId: string) {
  const db = await getOfflineDb();
  const records = (await db.getAllFromIndex("offlineSessions", "by-user", userId)).map(normalizeSession);
  return records
    .filter((record) => record.status !== "synced" || !record.serverSessionId)
    .sort((left, right) => (right.lastOpenedAt ?? right.updatedAt).localeCompare(left.lastOpenedAt ?? left.updatedAt))[0] ?? null;
}

export async function incrementOfflineSessionCaptureCount(localSessionId: string) {
  const db = await getOfflineDb();
  const existing = await db.get("offlineSessions", localSessionId);
  if (!existing) return null;
  return saveOfflineSession({
    ...existing,
    originalCaptureCount: (existing.originalCaptureCount ?? 0) + 1,
    status: existing.status === "synced" ? "partially_synced" : existing.status,
    syncedAt: existing.status === "synced" ? null : existing.syncedAt,
  });
}

export async function recordVerifiedOfflineCapture(localSessionId: string, expectedCaptureCount: number) {
  const db = await getOfflineDb();
  const existing = await db.get("offlineSessions", localSessionId);
  if (!existing) return null;
  const verifiedCaptureCount = (existing.verifiedCaptureCount ?? 0) + 1;
  const originalCaptureCount = Math.max(existing.originalCaptureCount ?? 0, expectedCaptureCount, verifiedCaptureCount);
  return saveOfflineSession({
    ...existing,
    originalCaptureCount,
    verifiedCaptureCount,
    status: verifiedCaptureCount >= originalCaptureCount ? "synced" : "partially_synced",
    syncedAt: verifiedCaptureCount >= originalCaptureCount ? now() : existing.syncedAt,
    lastError: null,
  });
}
