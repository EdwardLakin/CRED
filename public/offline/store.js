import { createId, createOfflineSessionIdempotencyKey, DEFAULT_CAPTURE_LIMIT, DEFAULT_VIDEO_LIMIT, now, SESSION_STATUSES } from './contracts.js';
import { getAll, put, remove } from './db.js';
export function getOfflineIdentity() {
    const userId = localStorage.getItem('cred-offline-user-id');
    const organizationId = localStorage.getItem('cred-offline-organization-id');
    if (!userId || !organizationId)
        return null;
    let limits = {};
    try {
        limits = JSON.parse(localStorage.getItem('cred-offline-capture-limits') || '{}');
    }
    catch { }
    return {
        userId,
        organizationId,
        provisionedAt: localStorage.getItem('cred-offline-provisioned-at') || '',
        captureLimits: {
            maxCaptureFileSizeBytes: typeof limits['maxCaptureFileSizeBytes'] === 'number' ? Number(limits['maxCaptureFileSizeBytes']) : DEFAULT_CAPTURE_LIMIT,
            maxVideoFileSizeBytes: typeof limits['maxVideoFileSizeBytes'] === 'number' ? Number(limits['maxVideoFileSizeBytes']) : DEFAULT_VIDEO_LIMIT,
        },
    };
}
async function normalizeCaptureForIndexedDb(record) {
    const source = record.blob;
    if (!(source instanceof Blob))
        throw new Error('IndexedDB capture record does not contain Blob data.');
    const blob = source instanceof File ? new Blob([await source.arrayBuffer()], { type: record.metadata.mimeType || source.type || 'application/octet-stream' }) : source;
    const legacyMetadata = record.metadata;
    const clientItemId = typeof legacyMetadata.clientItemId === 'string' && legacyMetadata.clientItemId.trim() ? legacyMetadata.clientItemId.trim().slice(0, 160) : record.localId;
    const documentationItemId = typeof legacyMetadata.documentationItemId === 'string' && legacyMetadata.documentationItemId.trim() ? legacyMetadata.documentationItemId.trim() : null;
    const attachmentOrder = Number.isInteger(legacyMetadata.attachmentOrder) && Number(legacyMetadata.attachmentOrder) > 0 ? Number(legacyMetadata.attachmentOrder) : 1;
    const sourceDocumentType = typeof legacyMetadata.sourceDocumentType === 'string' && legacyMetadata.sourceDocumentType.trim() ? legacyMetadata.sourceDocumentType.trim() : null;
    const sourceDocumentLabel = typeof legacyMetadata.sourceDocumentLabel === 'string' && legacyMetadata.sourceDocumentLabel.trim() ? legacyMetadata.sourceDocumentLabel.trim().slice(0, 80) : null;
    const sourceKind = legacyMetadata.sourceKind === 'document' || legacyMetadata.sourceKind === 'note' || legacyMetadata.sourceKind === 'observation' ? legacyMetadata.sourceKind : sourceDocumentType || legacyMetadata.manualType === 'document' ? 'document' : legacyMetadata.manualType === 'voice_note' || legacyMetadata.manualType === 'text_note' ? 'note' : 'observation';
    const attachmentKind = legacyMetadata.attachmentKind === 'primary' || legacyMetadata.attachmentKind === 'supporting' || legacyMetadata.attachmentKind === 'document' || legacyMetadata.attachmentKind === 'note' ? legacyMetadata.attachmentKind : sourceKind === 'document' ? 'document' : sourceKind === 'note' ? 'note' : attachmentOrder === 1 ? 'primary' : 'supporting';
    return {
        ...record,
        blob,
        metadata: {
            ...legacyMetadata,
            clientItemId,
            documentationItemId,
            attachmentOrder,
            sourceKind,
            attachmentKind,
            sourceDocumentType,
            sourceDocumentLabel,
        },
    };
}
async function putQueuedCapture(record) {
    try {
        const prepared = await normalizeCaptureForIndexedDb(record);
        return put('queuedCaptures', prepared);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`IndexedDB queued capture write failed while preparing Blob data: ${message}`);
    }
}
export function normalizeSession(session) {
    const localSessionId = String(session.localSessionId ?? '');
    const organizationId = String(session.organizationId ?? '');
    const statusMap = { local: SESSION_STATUSES.readyToSync, creating: SESSION_STATUSES.creatingServerSession, ready: SESSION_STATUSES.synced, failed: SESSION_STATUSES.error };
    return {
        ...session,
        localSessionId,
        organizationId,
        userId: String(session.userId ?? ''),
        title: String(session.title ?? 'Offline Documentation'),
        sessionType: String(session.sessionType ?? 'General Evidence Report'),
        serverSessionId: typeof session.serverSessionId === 'string' ? session.serverSessionId : null,
        retryCount: Number(session.retryCount ?? 0),
        lastError: typeof session.lastError === 'string' ? session.lastError : null,
        createdAt: String(session.createdAt ?? now()),
        updatedAt: String(session.updatedAt ?? now()),
        status: statusMap[String(session.status)] || session.status || SESSION_STATUSES.capturing,
        lastOpenedAt: String(session.lastOpenedAt || session.updatedAt || session.createdAt || now()),
        idempotencyKey: session.idempotencyKey || createOfflineSessionIdempotencyKey(organizationId, localSessionId),
        serverCreateAttemptCount: Number(session.serverCreateAttemptCount || 0),
        serverCreateLastAttemptAt: session.serverCreateLastAttemptAt || null,
        serverCreateRecoveredAt: session.serverCreateRecoveredAt || null,
        syncedAt: session.syncedAt || null,
    };
}
export async function listSessions(identity = getOfflineIdentity()) {
    if (!identity)
        return [];
    const sessions = (await getAll('offlineSessions')).filter((session) => session.userId === identity.userId && session.organizationId === identity.organizationId).map((session) => normalizeSession(session));
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
        title: input.title || `Offline Documentation ${new Date().toLocaleString()}`,
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
    const stored = await getAll('queuedCaptures');
    const scoped = stored.filter((capture) => capture.localSessionId === localSessionId && (!identity || (capture.userId === identity.userId && capture.organizationId === identity.organizationId)));
    const normalized = await Promise.all(scoped.map(normalizeCaptureForIndexedDb));
    await Promise.all(normalized.map(putQueuedCapture));
    return normalized.sort((a, b) => (a.metadata.reportOrder ?? 999999) - (b.metadata.reportOrder ?? 999999) || a.createdAt.localeCompare(b.createdAt));
}
export async function normalizeSessionReportOrders(localSessionId, identity = getOfflineIdentity()) {
    const captures = await capturesForSession(localSessionId, identity);
    const normalized = captures.map((capture, index) => ({
        ...capture,
        metadata: { ...capture.metadata, reportOrder: index + 1 },
        updatedAt: capture.metadata.reportOrder === index + 1 ? capture.updatedAt : now(),
    }));
    await Promise.all(normalized.filter((capture, index) => captures[index]?.metadata.reportOrder !== index + 1).map((capture) => putQueuedCapture(capture)));
    return normalized;
}
export async function sessionStats(localSessionId, identity = getOfflineIdentity()) {
    const captures = await capturesForSession(localSessionId, identity);
    const sessions = await listSessions(identity);
    const session = sessions.find((candidate) => candidate.localSessionId === localSessionId);
    const pending = captures.filter((capture) => capture.status !== 'synced' && !capture.uploadState?.verifiedAt);
    const verified = captures.filter((capture) => capture.uploadState?.verifiedAt || capture.metadata?.verified);
    const bytes = captures.reduce((sum, capture) => sum + (capture.metadata?.size || capture.blob?.size || 0), 0);
    return { captureCount: Math.max(captures.length, session?.originalCaptureCount ?? 0), pendingCount: pending.length, verifiedCount: Math.max(verified.length, session?.verifiedCaptureCount ?? 0), bytes };
}
export async function addCapture(session, file, order, item = {
    clientItemId: createId(),
    attachmentOrder: 1,
}) {
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
        blob: new Blob([file], { type: file.type || 'application/octet-stream' }),
        metadata: {
            clientItemId: item.clientItemId, documentationItemId: null, attachmentOrder: item.attachmentOrder,
            sourceKind: 'observation', attachmentKind: item.attachmentOrder === 1 ? 'primary' : 'supporting',
            sourceDocumentType: null, sourceDocumentLabel: null,
            captureIntent: 'auto_evidence', manualType: null, guidedStep: null, guidedLabel: null, workflow: null,
            technicianNote: '', transcriptStatus: 'not_started', noteSource: 'manual', reportOrder: order,
            includeInReport: true, filename: file.name || `capture-${timestamp}`, mimeType: file.type || 'application/octet-stream', size: file.size,
            uploadStatus: 'queued', noteSaveStatus: 'idle', verified: false,
        },
        status: 'local', retryCount: 0, lastError: null,
        uploadState: { storagePath: null, uploadedAt: null, finalizedAt: null, verifiedAt: null },
        serverCaptureId: null, createdAt: timestamp, updatedAt: timestamp,
    };
    await putQueuedCapture(record);
    const nextStatus = session.status === SESSION_STATUSES.synced ? SESSION_STATUSES.partiallySynced : SESSION_STATUSES.capturing;
    await saveSession(session, { status: nextStatus, syncedAt: null, originalCaptureCount: (session.originalCaptureCount ?? 0) + 1 });
    return record;
}
export async function updateCapture(capture, patch) { return putQueuedCapture({ ...capture, ...patch, updatedAt: now() }); }
export async function deleteCapture(capture) { return remove('queuedCaptures', capture.localId); }
export async function deleteSession(session, identity) {
    const captures = await capturesForSession(session.localSessionId, identity);
    await Promise.all(captures.map((capture) => remove('queuedCaptures', capture.localId)));
    await remove('offlineSessions', session.localSessionId);
    return captures.length;
}
export async function retargetSessionCaptures(localSessionId, serverSessionId, identity) {
    const captures = await capturesForSession(localSessionId, identity);
    await Promise.all(captures.map((capture) => putQueuedCapture({ ...capture, sessionId: serverSessionId, serverSessionId, status: capture.status === 'synced' ? capture.status : 'queued', updatedAt: now() })));
    return captures.length;
}
