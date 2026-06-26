/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { createId, createOfflineSessionIdempotencyKey, DEFAULT_CAPTURE_LIMIT, DEFAULT_VIDEO_LIMIT, now, SESSION_STATUSES } from './contracts.js';
import { getAll, put, remove } from './db.js';

export function getOfflineIdentity() {
  const userId = localStorage.getItem('cred-offline-user-id');
  const organizationId = localStorage.getItem('cred-offline-organization-id');
  if (!userId || !organizationId) return null;
  let limits = {};
  try { limits = JSON.parse(localStorage.getItem('cred-offline-capture-limits') || '{}'); } catch {}
  return {
    userId,
    organizationId,
    provisionedAt: localStorage.getItem('cred-offline-provisioned-at') || '',
    captureLimits: {
      maxCaptureFileSizeBytes: typeof limits.maxCaptureFileSizeBytes === 'number' ? limits.maxCaptureFileSizeBytes : DEFAULT_CAPTURE_LIMIT,
      maxVideoFileSizeBytes: typeof limits.maxVideoFileSizeBytes === 'number' ? limits.maxVideoFileSizeBytes : DEFAULT_VIDEO_LIMIT,
    },
  };
}

export function normalizeSession(session) {
  const localSessionId = session.localSessionId;
  const organizationId = session.organizationId;
  const statusMap = { local: SESSION_STATUSES.readyToSync, creating: SESSION_STATUSES.creatingServerSession, ready: SESSION_STATUSES.synced, failed: SESSION_STATUSES.error };
  return {
    ...session,
    status: statusMap[session.status] || session.status || SESSION_STATUSES.capturing,
    lastOpenedAt: session.lastOpenedAt || session.updatedAt || session.createdAt || now(),
    idempotencyKey: session.idempotencyKey || createOfflineSessionIdempotencyKey(organizationId, localSessionId),
    serverCreateAttemptCount: session.serverCreateAttemptCount || 0,
    serverCreateLastAttemptAt: session.serverCreateLastAttemptAt || null,
    serverCreateRecoveredAt: session.serverCreateRecoveredAt || null,
    syncedAt: session.syncedAt || null,
  };
}

export async function listSessions(identity = getOfflineIdentity()) {
  if (!identity) return [];
  const sessions = (await getAll('offlineSessions')).filter((session) => session.userId === identity.userId && session.organizationId === identity.organizationId).map(normalizeSession);
  await Promise.all(sessions.map((session) => put('offlineSessions', session)));
  return sessions.sort((a, b) => (b.lastOpenedAt || b.updatedAt).localeCompare(a.lastOpenedAt || a.updatedAt));
}

export async function createSession(identity, input = {}) {
  const timestamp = now();
  const localSessionId = `offline-${createId()}`;
  const session = {
    localSessionId,
    serverSessionId: null,
    organizationId: identity.organizationId,
    userId: identity.userId,
    title: input.title || `Offline Evidence ${new Date().toLocaleString()}`,
    sessionType: input.sessionType || 'General Evidence Report',
    status: SESSION_STATUSES.capturing,
    idempotencyKey: createOfflineSessionIdempotencyKey(identity.organizationId, localSessionId),
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
  await put('offlineSessions', session);
  return session;
}

export async function saveSession(session, patch = {}) {
  const updated = normalizeSession({ ...session, ...patch, updatedAt: now() });
  await put('offlineSessions', updated);
  return updated;
}

export async function capturesForSession(localSessionId, identity = getOfflineIdentity()) {
  return (await getAll('queuedCaptures')).filter((capture) => capture.localSessionId === localSessionId && (!identity || (capture.userId === identity.userId && capture.organizationId === identity.organizationId))).sort((a, b) => (a.metadata.reportOrder ?? 999999) - (b.metadata.reportOrder ?? 999999) || a.createdAt.localeCompare(b.createdAt));
}

export async function sessionStats(localSessionId, identity = getOfflineIdentity()) {
  const captures = await capturesForSession(localSessionId, identity);
  const pending = captures.filter((capture) => capture.status !== 'synced' && !capture.uploadState?.verifiedAt);
  const verified = captures.filter((capture) => capture.uploadState?.verifiedAt || capture.metadata?.verified);
  const bytes = captures.reduce((sum, capture) => sum + (capture.metadata?.size || capture.blob?.size || 0), 0);
  return { captureCount: captures.length, pendingCount: pending.length, verifiedCount: verified.length, bytes };
}

export async function addCapture(session, file, order) {
  const timestamp = now();
  const localId = createId();
  const serverSessionId = session.serverSessionId || null;
  const record = {
    localId,
    localSessionId: session.localSessionId,
    serverSessionId,
    clientMutationId: localId,
    organizationId: session.organizationId,
    workspaceId: null,
    sessionId: serverSessionId || session.localSessionId,
    userId: session.userId,
    blob: file,
    metadata: {
      captureIntent: 'auto_evidence', manualType: null, guidedStep: null, guidedLabel: null, workflow: null,
      technicianNote: '', transcriptStatus: 'not_started', noteSource: 'manual', reportOrder: order,
      includeInReport: true, filename: file.name || `capture-${timestamp}`, mimeType: file.type || 'application/octet-stream', size: file.size,
      uploadStatus: 'queued', noteSaveStatus: 'idle', verified: false,
    },
    status: 'local', retryCount: 0, lastError: null,
    uploadState: { storagePath: null, uploadedAt: null, finalizedAt: null, verifiedAt: null },
    serverCaptureId: null, createdAt: timestamp, updatedAt: timestamp,
  };
  await put('queuedCaptures', record);
  const nextStatus = session.status === SESSION_STATUSES.synced ? SESSION_STATUSES.partiallySynced : SESSION_STATUSES.capturing;
  await saveSession(session, { status: nextStatus, syncedAt: nextStatus === SESSION_STATUSES.synced ? session.syncedAt : null });
  return record;
}

export async function updateCapture(capture, patch) { return put('queuedCaptures', { ...capture, ...patch, updatedAt: now() }); }
export async function deleteCapture(capture) { return remove('queuedCaptures', capture.localId); }

export async function deleteSession(session, identity) {
  const captures = await capturesForSession(session.localSessionId, identity);
  await Promise.all(captures.map((capture) => remove('queuedCaptures', capture.localId)));
  await remove('offlineSessions', session.localSessionId);
  return captures.length;
}

export async function retargetSessionCaptures(localSessionId, serverSessionId, identity) {
  const captures = await capturesForSession(localSessionId, identity);
  await Promise.all(captures.map((capture) => put('queuedCaptures', { ...capture, sessionId: serverSessionId, serverSessionId, status: capture.status === 'synced' ? capture.status : 'queued', updatedAt: now() })));
  return captures.length;
}
