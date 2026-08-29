import type {
  CaptureAttachmentKind,
  DocumentationItemKind,
  SourceDocumentType,
} from "@/features/capture/types";

export type QueueStatus =
  | "local"
  | "queued"
  | "uploading"
  | "creating_record"
  | "finalized_unverified"
  | "verifying"
  | "synced"
  | "blocked"
  | "failed";

export type SyncStatus = "idle" | "syncing" | "paused" | "error";

export type OfflineUploadState = {
  storagePath: string | null;
  uploadedAt: string | null;
  finalizedAt: string | null;
  verifiedAt?: string | null;
};

export type OfflineCaptureFailureStage =
  | "local_blob_empty"
  | "upload_failed"
  | "storage_upload_empty"
  | "finalize_failed"
  | "verify_failed";

export type OfflineCaptureDiagnostics = {
  localBlobSize?: number | null;
  expectedSize?: number | null;
  mimeType?: string | null;
  filename?: string | null;
  storagePath?: string | null;
  uploadAttemptCount?: number;
  serverObjectSize?: number | null;
  failureStage?: OfflineCaptureFailureStage | null;
};

export type OfflineCaptureMetadata = {
  clientItemId: string;
  documentationItemId: string | null;
  attachmentOrder: number | null;
  sourceKind: DocumentationItemKind;
  attachmentKind: CaptureAttachmentKind;
  sourceDocumentType: SourceDocumentType | null;
  sourceDocumentLabel: string | null;
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
  checksum?: string | null;
  uploadStatus?: string;
  uiError?: string;
  captureItemId?: string;
  storageUploaded?: boolean;
  noteSaveStatus?: string;
  verified?: boolean;
  diagnostics?: OfflineCaptureDiagnostics;
};

export type OfflineCaptureRecord = {
  localId: string;
  localSessionId: string;
  serverSessionId: string | null;
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

export type PersistedOfflineCaptureRecord = Omit<
  OfflineCaptureRecord,
  "blob"
> & {
  blob: Blob | ArrayBuffer;
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
  | "draft"
  | "capturing"
  | "ready_to_sync"
  | "creating_server_session"
  | "server_session_created"
  | "handoff_pending"
  | "uploading"
  | "finalizing"
  | "verifying"
  | "syncing"
  | "partially_synced"
  | "synced"
  | "error"
  | "auth_required"
  | "local"
  | "creating"
  | "ready"
  | "failed";

export type OfflineSessionRecord = {
  localSessionId: string;
  serverSessionId: string | null;
  organizationId: string;
  userId: string;
  title: string;
  sessionType: string;
  status: OfflineSessionStatus;
  idempotencyKey?: string;
  lastOpenedAt?: string;
  serverCreateAttemptCount?: number;
  serverCreateLastAttemptAt?: string | null;
  serverCreateRecoveredAt?: string | null;
  retryCount: number;
  lastError: string | null;
  syncedAt?: string | null;
  originalCaptureCount?: number;
  verifiedCaptureCount?: number;
  createdAt: string;
  updatedAt: string;
};
