import { getOfflineDb } from "@/features/offline/db";
import type { CachedSessionRecord } from "@/features/offline/types";

export type OfflineCaptureSessionData = {
  captureTitle: string;
  returnPath: string;
  donePath: string;
  observationGroupId: string | null;
  maxCaptureFileSizeBytes: number;
  maxVideoFileSizeBytes: number;
};

export type SaveCaptureSessionInput = {
  sessionId: string;
  organizationId: string;
  userId: string;
  title: string;
  sessionType: string | null;
  data: OfflineCaptureSessionData;
};

function now() {
  return new Date().toISOString();
}

export async function saveCaptureSessionSnapshot(
  input: SaveCaptureSessionInput,
) {
  const db = await getOfflineDb();
  const timestamp = now();

  const record: CachedSessionRecord = {
    sessionId: input.sessionId,
    organizationId: input.organizationId,
    workspaceId: null,
    userId: input.userId,
    title: input.title,
    sessionType: input.sessionType,
    workflow: "observation_capture",
    cachedAt: timestamp,
    expiresAt: null,
    data: input.data,
  };

  await db.put("cachedSessions", record);
  return record;
}

export async function getCaptureSessionSnapshot(
  sessionId: string,
  userId?: string,
) {
  const db = await getOfflineDb();
  const record = await db.get("cachedSessions", sessionId);

  if (!record) {
    return null;
  }

  if (userId && record.userId !== userId) {
    return null;
  }

  return record;
}

export async function getCachedCaptureSessions(userId: string) {
  const db = await getOfflineDb();
  const records = await db.getAllFromIndex(
    "cachedSessions",
    "by-user",
    userId,
  );

  return records
    .filter((record) => record.workflow === "observation_capture")
    .sort((left, right) =>
      right.cachedAt.localeCompare(left.cachedAt),
    );
}
