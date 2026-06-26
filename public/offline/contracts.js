/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
export const OFFLINE_DB_NAME = 'cred-offline';
export const OFFLINE_DB_VERSION = 3;
export const DEFAULT_CAPTURE_LIMIT = 25 * 1024 * 1024;
export const DEFAULT_VIDEO_LIMIT = 50 * 1024 * 1024;
export const SESSION_STATUSES = {
  capturing: 'capturing',
  readyToSync: 'ready_to_sync',
  creatingServerSession: 'creating_server_session',
  syncing: 'syncing',
  partiallySynced: 'partially_synced',
  synced: 'synced',
  error: 'error',
};
export const SYNCABLE_STATUSES = ['capturing', 'ready_to_sync', 'creating_server_session', 'partially_synced', 'error'];
export function createId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
export function now() { return new Date().toISOString(); }
export function createOfflineSessionIdempotencyKey(organizationId, localSessionId) { return `offline-session:${organizationId}:${localSessionId}`; }
