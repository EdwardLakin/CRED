export type QueueStatus =
  | "local"
  | "queued"
  | "uploading"
  | "creating_record"
  | "synced"
  | "blocked"
  | "failed";

export type SyncStatus = "idle" | "syncing" | "paused" | "error";

export type OfflineUploadState = {
  storagePath: string | null;
  uploadedAt: string | null;
  finalizedAt: string | null;
};

export type OfflineCaptureMetadata = {
  captureIntent: string;
  manualType: string | null;
  guidedStep: string | null;
  guidedLabel: string | null;
  workflow: string | null;
  technicianNote: string;
  transcriptStatus: string;
  noteSource: string;
  reportOrder: number | null;
  includeInReport: boolean;
  filename: string;
  mimeType: string;
  size: number;
  uploadStatus?: string;
  uiError?: string;
  captureItemId?: string;
  storageUploaded?: boolean;
  noteSaveStatus?: string;
};

export type OfflineCaptureRecord = {
  localId: string;
  clientMutationId: string;
  organizationId: string;
  workspaceId: string | null;
  sessionId: string;
  userId: string;
  blob: Blob;
  metadata: OfflineCaptureMetadata;
  status: QueueStatus;
  retryCount: number;
  lastError: string | null;
  uploadState: OfflineUploadState;
  serverCaptureId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CachedSessionRecord = {
  sessionId: string;
  organizationId: string;
  workspaceId: string | null;
  userId: string;
  title: string;
  sessionType: string | null;
  workflow: string | null;
  cachedAt: string;
  expiresAt: string | null;
  data: unknown;
};

export type SyncStateRecord = {
  id: string;
  status: SyncStatus;
  pendingCount: number;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

export type OfflineSettings = {
  key: string;
  value: unknown;
  updatedAt: string;
};

export type OfflineSessionStatus =
  | "local"
  | "creating"
  | "ready"
  | "failed";

export type OfflineSessionRecord = {
  localSessionId: string;
  organizationId: string;
  userId: string;
  title: string;
  sessionType: string;
  status: OfflineSessionStatus;
  serverSessionId: string | null;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};
