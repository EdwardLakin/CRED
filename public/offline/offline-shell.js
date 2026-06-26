import { now, SESSION_STATUSES, SYNCABLE_STATUSES } from './contracts.js';
import { addCapture, capturesForSession, createSession, deleteCapture, deleteSession, getOfflineIdentity, listSessions, retargetSessionCaptures, saveSession, sessionStats, updateCapture } from './store.js';
const state = { identity: null, activeSession: null, objectUrls: [], storageEstimate: null, capabilities: null };
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
const formatBytes = (bytes) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const formatDate = (value) => value ? new Date(value).toLocaleString() : 'Not recorded';
function setMessage(text, className = '') { const el = $('message'); if (el) {
    el.textContent = text || '';
    el.className = className;
} }
function detectCapabilities() {
    const input = document.createElement('input');
    input.type = 'file';
    return {
        serviceWorker: 'serviceWorker' in navigator,
        cacheStorage: 'caches' in globalThis,
        indexedDB: 'indexedDB' in globalThis,
        fileInput: !input.disabled,
        mediaCapture: 'capture' in input || 'mediaDevices' in navigator,
        storageManager: 'storage' in navigator,
        persistentStorage: typeof navigator.storage?.persist === 'function',
        storageEstimate: typeof navigator.storage?.estimate === 'function',
        onlineSignal: navigator.onLine,
    };
}
async function refreshStorageEstimate() {
    if (navigator.storage?.estimate) {
        state.storageEstimate = await navigator.storage.estimate().catch(() => null);
    }
    else {
        state.storageEstimate = null;
    }
}
async function canReachServer() {
    if (!navigator.onLine)
        return false;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const response = await fetch('/api/offline/reachability', { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
        clearTimeout(timeout);
        if (response.status === 401 || response.status === 403)
            throw new Error('Sign-in required to complete sync. Local data remains on this device.');
        return response.ok;
    }
    catch {
        return false;
    }
}
function renderSupport() {
    const c = state.capabilities;
    if (!c)
        return;
    const issues = [];
    if (!c.indexedDB)
        issues.push('Browser storage unavailable: IndexedDB is required for local captures.');
    if (!c.serviceWorker)
        issues.push('Service worker unavailable: local capture can work in this tab, but cold offline relaunch may not work.');
    if (!c.cacheStorage)
        issues.push('Cache Storage unavailable: installed/offline launch shell may be limited.');
    if (!c.fileInput)
        issues.push('File selection unavailable in this browser.');
    const quota = state.storageEstimate?.quota ?? null;
    const usage = state.storageEstimate?.usage ?? null;
    const storage = quota && usage !== null ? `${formatBytes(usage)} used of about ${formatBytes(quota)} (${formatBytes(Math.max(quota - usage, 0))} available)` : 'Storage estimate unavailable; this browser may still work but quota is unknown.';
    $('support').innerHTML = `<span class="status">${issues.length ? 'Supported with limitations' : 'Fully supported by detected capabilities'}</span><p class="muted">${storage}</p>${issues.map((issue) => `<p class="warning">${escapeHtml(issue)}</p>`).join('')}`;
}
async function renderDashboard() {
    state.activeSession = null;
    revokeUrls();
    state.identity = getOfflineIdentity();
    await refreshStorageEstimate();
    renderSupport();
    $('workspace').classList.add('hidden');
    $('dashboard').classList.remove('hidden');
    if (!state.identity) {
        $('provisioning').textContent = 'Device not provisioned. Sign in online once and open Dashboard to save offline identity before creating local sessions.';
        $('sessions').innerHTML = '';
        return;
    }
    $('provisioning').textContent = `Provisioned for organization ${state.identity.organizationId}. Provisioned at ${state.identity.provisionedAt || 'unknown time'}.`;
    const sessions = await listSessions(state.identity);
    const rows = await Promise.all(sessions.map(async (session) => ({ session, stats: await sessionStats(session.localSessionId, state.identity) })));
    $('sessions').innerHTML = rows.length ? rows.map(({ session, stats }) => sessionCard(session, stats)).join('') : '<section class="card"><h2>No local sessions yet</h2><p class="muted">Start a new session before leaving connectivity, or create one now if this device is already provisioned.</p></section>';
    for (const { session } of rows)
        bindSessionCard(session);
}
function sessionCard(session, stats) {
    const progress = stats.captureCount ? `${stats.verifiedCount}/${stats.captureCount} verified` : 'No captures yet';
    return `<article class="card session-card" id="session-${session.localSessionId}">
    <div class="card-header"><div><h2>${escapeHtml(session.title)}</h2><p class="muted">${escapeHtml(session.sessionType)} · Created ${formatDate(session.createdAt)}</p><p class="muted">Last opened ${formatDate(session.lastOpenedAt || session.updatedAt)}</p></div><span class="status">${escapeHtml(session.status)}</span></div>
    <p class="muted">${stats.captureCount} capture(s), ${stats.pendingCount} pending, ${progress}, ${formatBytes(stats.bytes)} local media.</p>
    <p class="muted">Server session: ${session.serverSessionId ? escapeHtml(session.serverSessionId) : 'not assigned yet'}</p>
    ${session.lastError ? `<p class="error">${escapeHtml(session.lastError)}</p>` : ''}
    <div class="button-row"><button data-action="continue">Continue</button><button class="secondary" data-action="rename">Rename</button><button class="secondary" data-action="sync">${session.lastError ? 'Retry online handoff' : 'Prepare online handoff'}</button><button class="danger" data-action="delete">Delete Local Session</button></div>
  </article>`;
}
function bindSessionCard(session) {
    const card = $(`session-${session.localSessionId}`);
    card?.querySelector('[data-action="continue"]')?.addEventListener('click', () => openSession(session.localSessionId));
    card?.querySelector('[data-action="rename"]')?.addEventListener('click', async () => {
        const next = prompt('Rename offline session', session.title);
        if (next?.trim()) {
            await saveSession(session, { title: next.trim() });
            await renderDashboard();
        }
    });
    card?.querySelector('[data-action="sync"]')?.addEventListener('click', () => syncSession(session.localSessionId));
    card?.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
        if (!state.identity)
            return;
        const stats = await sessionStats(session.localSessionId, state.identity);
        const warning = stats.pendingCount > 0 ? `This deletes ${stats.pendingCount} unsynced capture(s) from this local session only. Type DELETE to confirm.` : 'Delete this local session from this device? Type DELETE to confirm.';
        if (prompt(warning) === 'DELETE') {
            await deleteSession(session, state.identity);
            await renderDashboard();
        }
    });
}
async function openSession(localSessionId) {
    const sessions = await listSessions(state.identity);
    const session = sessions.find((candidate) => candidate.localSessionId === localSessionId);
    if (!session)
        return setMessage('Local session not found for this user and organization.', 'error');
    state.activeSession = await saveSession(session, { lastOpenedAt: now() });
    $('dashboard').classList.add('hidden');
    $('workspace').classList.remove('hidden');
    await renderWorkspace();
}
function revokeUrls() { state.objectUrls.forEach((url) => URL.revokeObjectURL(url)); state.objectUrls = []; }
async function renderWorkspace() {
    revokeUrls();
    const session = state.activeSession;
    if (!session)
        return;
    const captures = await capturesForSession(session.localSessionId, state.identity);
    $('workspace').innerHTML = `<section class="card"><button class="ghost" id="backToDashboard">← Offline dashboard</button><p class="eyebrow">Offline capture</p><h1>${escapeHtml(session.title)}</h1><p class="muted">${escapeHtml(session.sessionType)} · ${captures.length} local capture(s)</p><div class="button-row"><button id="takePhoto">Take photo / video</button><button class="secondary" id="chooseMedia">Choose media</button><button class="secondary" id="syncActive">Prepare this session online</button></div><input id="cameraInput" class="hidden" type="file" accept="image/*,video/*" capture="environment" multiple><input id="galleryInput" class="hidden" type="file" accept="image/*,video/*" multiple></section><section class="grid" id="captureList"></section>`;
    $('backToDashboard').onclick = renderDashboard;
    $('syncActive').onclick = () => syncSession(session.localSessionId);
    $('takePhoto').onclick = () => $('cameraInput').click();
    $('chooseMedia').onclick = () => $('galleryInput').click();
    $('cameraInput').onchange = $('galleryInput').onchange = (event) => addFiles(Array.from((event.target.files ?? [])));
    const list = $('captureList');
    if (!captures.length)
        list.innerHTML = '<section class="card"><h2>No captures in this session</h2><p class="muted">Add media; blobs are saved immediately in IndexedDB.</p></section>';
    captures.forEach((capture, index) => renderCaptureCard(list, captures, capture, index));
}
function renderCaptureCard(list, captures, capture, index) {
    const url = URL.createObjectURL(capture.blob);
    state.objectUrls.push(url);
    const article = document.createElement('article');
    article.className = 'card capture';
    article.innerHTML = `<div class="card-header"><div><h2>Capture ${index + 1}</h2><p class="muted">${escapeHtml(capture.metadata.filename)} · ${formatBytes(capture.metadata.size)}</p></div><span class="status">${escapeHtml(capture.status)}</span></div>${capture.metadata.mimeType.startsWith('video/') ? `<video controls preload="metadata" src="${url}"></video>` : `<img alt="Offline capture ${index + 1}" src="${url}">`}<label>Technician notes<textarea rows="4">${escapeHtml(capture.metadata.technicianNote)}</textarea></label><div class="button-row"><button class="secondary" data-up>Move up</button><button class="secondary" data-down>Move down</button><button class="danger" data-delete>Delete capture</button></div>`;
    article.querySelector('textarea').addEventListener('input', async (event) => {
        capture.metadata.technicianNote = event.target.value;
        capture.metadata.noteSource = 'edited';
        capture.metadata.noteSaveStatus = 'saved';
        await updateCapture(capture, { metadata: capture.metadata });
    });
    article.querySelector('[data-delete]').onclick = async () => { await deleteCapture(capture); await renderWorkspace(); };
    article.querySelector('[data-up]').onclick = () => moveCapture(captures, index, -1);
    article.querySelector('[data-down]').onclick = () => moveCapture(captures, index, 1);
    list.append(article);
}
async function addFiles(files) {
    if (!state.activeSession || !files.length)
        return;
    const estimate = state.storageEstimate;
    const available = estimate?.quota && estimate?.usage !== undefined ? estimate.quota - estimate.usage : null;
    const required = files.reduce((sum, file) => sum + file.size, 0);
    if (available !== null && required > available)
        return setMessage('This device does not report enough available browser storage for those files.', 'error');
    const existing = await capturesForSession(state.activeSession.localSessionId, state.identity);
    let order = existing.length;
    for (const file of files) {
        if (!state.identity)
            return;
        const limit = file.type.startsWith('video/') ? state.identity.captureLimits.maxVideoFileSizeBytes : state.identity.captureLimits.maxCaptureFileSizeBytes;
        if (file.size > limit) {
            setMessage(`${file.name} exceeds the configured offline capture limit.`, 'error');
            continue;
        }
        await addCapture(state.activeSession, file, order++);
    }
    await refreshStorageEstimate();
    setMessage(`${files.length} capture(s) saved locally.`, 'success');
    await renderWorkspace();
}
async function moveCapture(captures, index, direction) {
    const next = index + direction;
    if (next < 0 || next >= captures.length)
        return;
    [captures[index], captures[next]] = [captures[next], captures[index]];
    await Promise.all(captures.map((capture, reportOrder) => updateCapture(capture, { metadata: { ...capture.metadata, reportOrder } })));
    await renderWorkspace();
}
async function syncSession(localSessionId) {
    const reachable = await canReachServer();
    if (!reachable)
        return setMessage('Server is not reachable yet. Local data is preserved and sync can be retried.', 'warning');
    const sessions = await listSessions(state.identity);
    let session = sessions.find((candidate) => candidate.localSessionId === localSessionId);
    if (!session)
        return;
    try {
        session = await saveSession(session, { status: SESSION_STATUSES.creatingServerSession, serverCreateAttemptCount: (session.serverCreateAttemptCount || 0) + 1, serverCreateLastAttemptAt: now(), lastError: null });
        if (!session.serverSessionId) {
            const response = await fetch('/api/dashboard/sessions/offline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientSessionId: session.localSessionId, organizationId: session.organizationId, idempotencyKey: session.idempotencyKey, title: session.title, sessionType: session.sessionType, createdAt: session.createdAt }) });
            if (response.status === 401 || response.status === 403)
                throw new Error('Sign-in required to complete sync. Local data remains on this device.');
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.sessionId)
                throw new Error(result.error || 'Unable to create or recover the server session.');
            if (!state.identity)
                throw new Error('Device identity is unavailable.');
            await retargetSessionCaptures(session.localSessionId, result.sessionId, state.identity);
            session = await saveSession(session, { serverSessionId: result.sessionId, serverCreateRecoveredAt: now(), status: SESSION_STATUSES.handoffPending });
        }
        const stats = await sessionStats(session.localSessionId, state.identity);
        await saveSession(session, { status: stats.pendingCount > 0 ? SESSION_STATUSES.handoffPending : SESSION_STATUSES.synced, syncedAt: stats.pendingCount > 0 ? session.syncedAt : now(), lastError: null });
        setMessage('Prepared for online handoff. Opening CRED to upload and verify queued media.', 'success');
        window.setTimeout(() => { window.location.href = '/dashboard?offlineSync=1'; }, 300);
    }
    catch (error) {
        await saveSession(session, { status: SESSION_STATUSES.error, lastError: error instanceof Error ? error.message : 'Sync failed.' });
        setMessage(error instanceof Error ? error.message : 'Sync failed.', 'error');
    }
    if (state.activeSession?.localSessionId === localSessionId)
        await openSession(localSessionId);
    else
        await renderDashboard();
}
async function boot() {
    state.capabilities = detectCapabilities();
    if (navigator.storage?.persist)
        navigator.storage.persist().catch(() => { });
    $('newSession').onclick = async () => { if (!state.identity)
        return setMessage('Device not provisioned. Sign in online first.', 'error'); const session = await createSession(state.identity); await openSession(session.localSessionId); };
    $('syncAll').onclick = async () => { const sessions = await listSessions(state.identity); for (const session of sessions.filter((candidate) => SYNCABLE_STATUSES.includes(candidate.status)))
        await syncSession(session.localSessionId); };
    window.addEventListener('online', () => setMessage('Network signal returned. Use Prepare online handoff to verify server reachability and continue upload.', 'success'));
    if (navigator.serviceWorker?.controller) {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => { $('version').textContent = `Service worker: ${JSON.stringify(event.data)}`; };
        navigator.serviceWorker.controller.postMessage({ type: 'CRED_SW_DIAGNOSTICS' }, [channel.port2]);
    }
    await renderDashboard();
}
boot().catch((error) => { console.error(error); setMessage(error instanceof Error ? error.message : 'Offline shell failed to start.', 'error'); });
