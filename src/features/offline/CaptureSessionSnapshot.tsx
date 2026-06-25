"use client";

import { useEffect } from "react";

import { saveOfflineIdentity } from "@/features/offline/offline-identity";
import {
  saveCaptureSessionSnapshot,
  type OfflineCaptureSessionData,
} from "@/features/offline/session-cache";

type CaptureSessionSnapshotProps = {
  sessionId: string;
  organizationId: string;
  userId: string;
  title: string;
  sessionType: string | null;
  data: OfflineCaptureSessionData;
};

export function CaptureSessionSnapshot({
  sessionId,
  organizationId,
  userId,
  title,
  sessionType,
  data,
}: CaptureSessionSnapshotProps) {
  useEffect(() => {
    saveOfflineIdentity(userId, organizationId);

    void saveCaptureSessionSnapshot({
      sessionId,
      organizationId,
      userId,
      title,
      sessionType,
      data,
    }).catch((error: unknown) => {
      console.warn("Unable to cache capture session for offline use", error);
    });
  }, [
    data,
    organizationId,
    sessionId,
    sessionType,
    title,
    userId,
  ]);

  return null;
}
