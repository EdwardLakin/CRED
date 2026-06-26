export const OFFLINE_DB_NAME = 'cred-offline';
export const OFFLINE_DB_VERSION = 3;
export const DEFAULT_CAPTURE_LIMIT = 25 * 1024 * 1024;
export const DEFAULT_VIDEO_LIMIT = 50 * 1024 * 1024;

export type SessionStatus = 'capturing' | 'ready_to_sync' | 'creating_server_session' | 'server_session_created' | 'handoff_pending' | 'uploading' | 'finalizing' | 'verifying' | 'partially_synced' | 'synced' | 'error' | 'auth_required';
export type CaptureSyncStatus = 'local' | 'queued' | 'uploading' | 'creating_record' | 'finalized_unverified' | 'verifying' | 'synced' | 'blocked' | 'failed';
export type OfflineIdentity = { userId: string; organizationId: string; provisionedAt: string; captureLimits: { maxCaptureFileSizeBytes: number; maxVideoFileSizeBytes: number } };
export type OfflineUploadState = { storagePath: string | null; uploadedAt: string | null; finalizedAt: string | null; verifiedAt: string | null };
export type OfflineCaptureMetadata = { captureIntent: string; manualType: string | null; guidedStep: string | null; guidedLabel: string | null; workflow: string | null; technicianNote: string; transcriptStatus: string; noteSource: string; reportOrder: number | null; includeInReport: boolean; filename: string; mimeType: string; size: number; uploadStatus?: string; noteSaveStatus?: string; verified?: boolean; captureItemId?: string; uiError?: string };
export type OfflineLocalSession = { localSessionId: string; serverSessionId: string | null; organizationId: string; userId: string; title: string; sessionType: string; status: SessionStatus | 'local' | 'creating' | 'ready' | 'failed'; idempotencyKey: string; lastOpenedAt: string; serverCreateAttemptCount: number; serverCreateLastAttemptAt: string | null; serverCreateRecoveredAt: string | null; retryCount: number; lastError: string | null; syncedAt: string | null; createdAt: string; updatedAt: string; originalCaptureCount?: number; verifiedCaptureCount?: number };
export type OfflineCaptureRecord = { localId: string; localSessionId: string; serverSessionId: string | null; clientMutationId: string; organizationId: string; workspaceId: string | null; sessionId: string; userId: string; blob: Blob; metadata: OfflineCaptureMetadata; status: CaptureSyncStatus; retryCount: number; lastError: string | null; uploadState: OfflineUploadState; serverCaptureId: string | null; createdAt: string; updatedAt: string };
export type OfflineCapabilities = { serviceWorker: boolean; cacheStorage: boolean; indexedDB: boolean; fileInput: boolean; mediaCapture: boolean; storageManager: boolean; persistentStorage: boolean; storageEstimate: boolean; onlineSignal: boolean };
export type ReachabilityResult = { ok: boolean; status: 'offline' | 'api_unavailable' | 'unauthenticated' | 'ready'; error?: string };
export type OfflineStoreName = 'queuedCaptures' | 'cachedSessions' | 'offlineSessions' | 'syncState' | 'settings';
export const SESSION_STATUSES = { capturing: 'capturing', readyToSync: 'ready_to_sync', creatingServerSession: 'creating_server_session', serverSessionCreated: 'server_session_created', handoffPending: 'handoff_pending', uploading: 'uploading', finalizing: 'finalizing', verifying: 'verifying', partiallySynced: 'partially_synced', synced: 'synced', error: 'error', authRequired: 'auth_required' } as const;
export const SYNCABLE_STATUSES: SessionStatus[] = ['capturing', 'ready_to_sync', 'server_session_created', 'handoff_pending', 'creating_server_session', 'partially_synced', 'error', 'auth_required'];
export function createId(): string { return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
export function now(): string { return new Date().toISOString(); }
export function createOfflineSessionIdempotencyKey(organizationId: string, localSessionId: string): string { return `offline-session:${organizationId}:${localSessionId}`; }
