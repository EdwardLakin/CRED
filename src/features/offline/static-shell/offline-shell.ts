import type { OfflineCapabilities, OfflineCaptureRecord, OfflineIdentity, OfflineLocalSession, ReachabilityResult, SessionStatus } from './contracts.js';
import { now, SESSION_STATUSES, SYNCABLE_STATUSES } from './contracts.js';
import { addCapture, capturesForSession, createSession, deleteCapture, deleteSession, getOfflineIdentity, listSessions, retargetSessionCaptures, saveSession, sessionStats, updateCapture } from './store.js';

const REQUIRED_OFFLINE_ASSETS = ['/offline.html', '/offline/offline-shell.css', '/offline/offline-shell.js', '/offline/contracts.js', '/offline/db.js', '/offline/store.js', '/manifest.webmanifest', '/apple-touch-icon.png'];
const CONTROL_RELOAD_KEY = 'cred-offline-control-reload-attempted';

type ServiceWorkerReadiness = { registered: boolean; active: boolean; controlled: boolean; cached: boolean; cacheMissing: string[]; error: string | null };

const state: { identity: OfflineIdentity | null; activeSession: OfflineLocalSession | null; objectUrls: string[]; storageEstimate: StorageEstimate | null; capabilities: OfflineCapabilities | null; serviceWorker: ServiceWorkerReadiness } = { identity: null, activeSession: null, objectUrls: [], storageEstimate: null, capabilities: null, serviceWorker: { registered: false, active: false, controlled: false, cached: false, cacheMissing: REQUIRED_OFFLINE_ASSETS, error: null } };
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const escapeHtml = (value: unknown): string => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
const formatBytes = (bytes: number): string => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const formatDate = (value: string | null | undefined): string => value ? new Date(value).toLocaleString() : 'Not recorded';
function setMessage(text: string, className = '') { const el = $('message'); if (el) { el.textContent = text || ''; el.className = className; } }


function waitForControllerChange(timeoutMs = 2500): Promise<boolean> {
  if (navigator.serviceWorker?.controller) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => { cleanup(); resolve(Boolean(navigator.serviceWorker?.controller)); }, timeoutMs);
    const onControllerChange = () => { cleanup(); resolve(true); };
    const cleanup = () => { window.clearTimeout(timeout); navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange); };
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange, { once: true });
  });
}

async function requiredAssetsCached(): Promise<{ cached: boolean; missing: string[] }> {
  if (!('caches' in globalThis)) return { cached: false, missing: REQUIRED_OFFLINE_ASSETS };
  const results = await Promise.all(REQUIRED_OFFLINE_ASSETS.map(async (asset) => ({ asset, response: await caches.match(asset).catch(() => undefined) })));
  const missing = results.filter(({ response }) => !response?.ok).map(({ asset }) => asset);
  return { cached: missing.length === 0, missing };
}

async function ensureServiceWorkerControl(): Promise<ServiceWorkerReadiness> {
  if (!('serviceWorker' in navigator)) return { registered: false, active: false, controlled: false, cached: false, cacheMissing: REQUIRED_OFFLINE_ASSETS, error: 'Service workers are not supported in this browser.' };
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    await registration.update().catch(() => undefined);
    if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    const readyRegistration = await navigator.serviceWorker.ready;
    const active = Boolean(readyRegistration.active || registration.active);
    let controlled = Boolean(navigator.serviceWorker.controller);
    if (!controlled) controlled = await waitForControllerChange();
    const cacheState = await requiredAssetsCached();
    const readiness: ServiceWorkerReadiness = { registered: true, active, controlled, cached: cacheState.cached, cacheMissing: cacheState.missing, error: null };
    state.serviceWorker = readiness;
    if (navigator.onLine && !controlled && sessionStorage.getItem(CONTROL_RELOAD_KEY) !== 'true') {
      sessionStorage.setItem(CONTROL_RELOAD_KEY, 'true');
      setMessage('Installing the offline Home Screen app shell. Reloading once so this page is controlled by the service worker…', 'warning');
      window.setTimeout(() => window.location.reload(), 250);
    } else if (controlled) {
      sessionStorage.removeItem(CONTROL_RELOAD_KEY);
    }
    return readiness;
  } catch (error) {
    const cacheState = await requiredAssetsCached();
    const readiness: ServiceWorkerReadiness = { registered: false, active: false, controlled: Boolean(navigator.serviceWorker.controller), cached: cacheState.cached, cacheMissing: cacheState.missing, error: error instanceof Error ? error.message : 'Service worker registration failed.' };
    state.serviceWorker = readiness;
    return readiness;
  }
}

function renderOfflineReadiness() {
  const sw = state.serviceWorker;
  const identityReady = Boolean(state.identity);
  const ready = identityReady && sw.registered && sw.active && sw.controlled && sw.cached;
  const missing = [];
  if (!identityReady) missing.push('offline identity is not provisioned');
  if (!sw.registered) missing.push('service worker is not registered');
  if (!sw.active) missing.push('service worker is not active');
  if (!sw.controlled) missing.push('this page is not controlled by the service worker yet');
  if (!sw.cached) missing.push(`required offline assets are not cached${sw.cacheMissing.length ? ` (${sw.cacheMissing.join(', ')})` : ''}`);
  const detail = sw.error ? ` ${escapeHtml(sw.error)}` : '';
  $('offlineReady').innerHTML = ready
    ? '<span class="status success">Offline ready on this device</span><p class="muted">Use Share → Add to Home Screen from this /offline.html page on iPhone or iPad. Then launch once online before relying on Airplane Mode.</p>'
    : `<span class="status warning">Offline setup incomplete</span><p class="muted">Waiting for: ${escapeHtml(missing.join('; ') || 'offline setup checks')}.${detail}</p>`;
}

function detectCapabilities(): OfflineCapabilities {
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
  } else {
    state.storageEstimate = null;
  }
}

async function canReachServer(identity: OfflineIdentity | null): Promise<ReachabilityResult> {
  if (!identity) return { ok: false, status: 'unauthenticated', error: 'Device is not provisioned for offline handoff.' };
  if (!navigator.onLine) return { ok: false, status: 'offline', error: 'Network signal is offline.' };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const response = await fetch('/api/offline/reachability', { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
    clearTimeout(timeout);
    const result = (await response.json().catch(() => null)) as ReachabilityResult | null;
    if (response.status === 401 || response.status === 403 || result?.status === 'unauthenticated') {
      return { ok: false, status: 'unauthenticated', error: 'Sign-in required to complete sync. Local data remains on this device.' };
    }
    if (!response.ok || !result?.ok) return { ok: false, status: 'api_unavailable', error: result?.error || 'CRED API is unavailable.' };
    if (result.userId !== identity.userId || result.organizationId !== identity.organizationId) {
      return { ok: false, status: 'auth_mismatch', userId: result.userId, organizationId: result.organizationId, error: 'Wrong account or organization. Sign into the account that provisioned these offline sessions; local data was not changed.' };
    }
    return result;
  } catch {
    return { ok: false, status: 'api_unavailable', error: 'CRED API is unavailable or the connection is captive/intermittent.' };
  }
}

function renderSupport() {
  const c = state.capabilities;
  if (!c) return;
  const issues = [];
  if (!c.indexedDB) issues.push('Browser storage unavailable: IndexedDB is required for local captures.');
  if (!c.serviceWorker) issues.push('Service worker unavailable: local capture can work in this tab, but cold offline relaunch may not work.');
  if (!c.cacheStorage) issues.push('Cache Storage unavailable: installed/offline launch shell may be limited.');
  if (!c.fileInput) issues.push('File selection unavailable in this browser.');
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
  renderOfflineReadiness();
  if (!state.identity) {
    $('provisioning').textContent = 'Device not provisioned. Sign in online once and open Dashboard to save offline identity before creating local sessions.';
    $('sessions').innerHTML = '';
    renderOfflineReadiness();
    return;
  }
  $('provisioning').textContent = `Provisioned for organization ${state.identity.organizationId}. Provisioned at ${state.identity.provisionedAt || 'unknown time'}.`;
  renderOfflineReadiness();
  const sessions = await listSessions(state.identity);
  const rows = await Promise.all(sessions.map(async (session: OfflineLocalSession) => ({ session, stats: await sessionStats(session.localSessionId, state.identity) })));
  $('sessions').innerHTML = rows.length ? rows.map(({ session, stats }) => sessionCard(session, stats)).join('') : '<section class="card"><h2>No local sessions yet</h2><p class="muted">Start a new session before leaving connectivity, or create one now if this device is already provisioned.</p></section>';
  for (const { session } of rows) bindSessionCard(session);
}

function sessionCard(session: OfflineLocalSession, stats: { captureCount: number; pendingCount: number; verifiedCount: number; bytes: number }): string {
  const progress = stats.captureCount ? `${stats.verifiedCount}/${stats.captureCount} verified` : 'No captures yet';
  return `<article class="card session-card" id="session-${session.localSessionId}">
    <div class="card-header"><div><h2>${escapeHtml(session.title)}</h2><p class="muted">${escapeHtml(session.sessionType)} · Created ${formatDate(session.createdAt)}</p><p class="muted">Last opened ${formatDate(session.lastOpenedAt || session.updatedAt)}</p></div><span class="status">${escapeHtml(session.status)}</span></div>
    <p class="muted">${stats.captureCount} capture(s), ${stats.pendingCount} pending, ${progress}, ${formatBytes(stats.bytes)} local media.</p>
    <p class="muted">Server session: ${session.serverSessionId ? escapeHtml(session.serverSessionId) : 'not assigned yet'}</p>
    ${session.lastError ? `<p class="error">${escapeHtml(session.lastError)}</p>` : ''}
    <div class="button-row"><button data-action="continue">Continue</button><button class="secondary" data-action="rename">Rename</button><button class="secondary" data-action="sync">${session.lastError ? 'Retry online handoff' : 'Prepare online handoff'}</button><button class="danger" data-action="delete">Delete Local Session</button></div>
  </article>`;
}

function bindSessionCard(session: OfflineLocalSession): void {
  const card = $(`session-${session.localSessionId}`);
  card?.querySelector('[data-action="continue"]')?.addEventListener('click', () => openSession(session.localSessionId));
  card?.querySelector('[data-action="rename"]')?.addEventListener('click', async () => {
    const next = prompt('Rename offline session', session.title);
    if (next?.trim()) { await saveSession(session, { title: next.trim() }); await renderDashboard(); }
  });
  card?.querySelector('[data-action="sync"]')?.addEventListener('click', () => syncSession(session.localSessionId));
  card?.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
    if (!state.identity) return;
    const stats = await sessionStats(session.localSessionId, state.identity);
    const warning = stats.pendingCount > 0 ? `This deletes ${stats.pendingCount} unsynced capture(s) from this local session only. Type DELETE to confirm.` : 'Delete this local session from this device? Type DELETE to confirm.';
    if (prompt(warning) === 'DELETE') { await deleteSession(session, state.identity); await renderDashboard(); }
  });
}

async function openSession(localSessionId: string) {
  const sessions = await listSessions(state.identity);
  const session = sessions.find((candidate: OfflineLocalSession) => candidate.localSessionId === localSessionId);
  if (!session) return setMessage('Local session not found for this user and organization.', 'error');
  state.activeSession = await saveSession(session, { lastOpenedAt: now() });
  $('dashboard').classList.add('hidden');
  $('workspace').classList.remove('hidden');
  await renderWorkspace();
}

function revokeUrls() { state.objectUrls.forEach((url) => URL.revokeObjectURL(url)); state.objectUrls = []; }

async function renderWorkspace() {
  revokeUrls();
  const session = state.activeSession;
  if (!session) return;
  const captures = await capturesForSession(session.localSessionId, state.identity);
  $('workspace').innerHTML = `<section class="card"><button class="ghost" id="backToDashboard">← Offline dashboard</button><p class="eyebrow">Offline capture</p><h1>${escapeHtml(session.title)}</h1><p class="muted">${escapeHtml(session.sessionType)} · ${captures.length} local capture(s)</p><div class="button-row"><button id="takePhoto">Take photo / video</button><button class="secondary" id="chooseMedia">Choose media</button><button class="secondary" id="syncActive">Prepare this session online</button></div><input id="cameraInput" class="hidden" type="file" accept="image/*,video/*" capture="environment" multiple><input id="galleryInput" class="hidden" type="file" accept="image/*,video/*" multiple></section><section class="grid" id="captureList"></section>`;
  ($('backToDashboard') as HTMLButtonElement).onclick = renderDashboard;
  ($('syncActive') as HTMLButtonElement).onclick = () => syncSession(session.localSessionId);
  ($('takePhoto') as HTMLButtonElement).onclick = () => $('cameraInput').click();
  ($('chooseMedia') as HTMLButtonElement).onclick = () => $('galleryInput').click();
  ($('cameraInput') as HTMLInputElement).onchange = ($('galleryInput') as HTMLInputElement).onchange = (event: Event) => addFiles(Array.from(((event.target as HTMLInputElement).files ?? [])));
  const list = $('captureList');
  if (!captures.length) list.innerHTML = '<section class="card"><h2>No captures in this session</h2><p class="muted">Add media; blobs are saved immediately in IndexedDB.</p></section>';
  captures.forEach((capture, index) => renderCaptureCard(list, captures, capture, index));
}

function renderCaptureCard(list: HTMLElement, captures: OfflineCaptureRecord[], capture: OfflineCaptureRecord, index: number): void {
  const url = URL.createObjectURL(capture.blob);
  state.objectUrls.push(url);
  const article = document.createElement('article');
  article.className = 'card capture';
  article.innerHTML = `<div class="card-header"><div><h2>Capture ${index + 1}</h2><p class="muted">${escapeHtml(capture.metadata.filename)} · ${formatBytes(capture.metadata.size)}</p></div><span class="status">${escapeHtml(capture.status)}</span></div>${capture.metadata.mimeType.startsWith('video/') ? `<video controls preload="metadata" src="${url}"></video>` : `<img alt="Offline capture ${index + 1}" src="${url}">`}<label>Technician notes<textarea rows="4">${escapeHtml(capture.metadata.technicianNote)}</textarea></label><div class="button-row"><button class="secondary" data-up>Move up</button><button class="secondary" data-down>Move down</button><button class="danger" data-delete>Delete capture</button></div>`;
  (article.querySelector('textarea') as HTMLTextAreaElement).addEventListener('input', async (event: Event) => {
    capture.metadata.technicianNote = (event.target as HTMLTextAreaElement).value;
    capture.metadata.noteSource = 'edited';
    capture.metadata.noteSaveStatus = 'saved';
    await updateCapture(capture, { metadata: capture.metadata });
  });
  (article.querySelector('[data-delete]') as HTMLButtonElement).onclick = async () => { await deleteCapture(capture); await renderWorkspace(); };
  (article.querySelector('[data-up]') as HTMLButtonElement).onclick = () => moveCapture(captures, index, -1);
  (article.querySelector('[data-down]') as HTMLButtonElement).onclick = () => moveCapture(captures, index, 1);
  list.append(article);
}

async function addFiles(files: File[]) {
  if (!state.activeSession || !files.length) return;
  const estimate = state.storageEstimate;
  const available = estimate?.quota && estimate?.usage !== undefined ? estimate.quota - estimate.usage : null;
  const required = files.reduce((sum: number, file: File) => sum + file.size, 0);
  if (available !== null && required > available) return setMessage('This device does not report enough available browser storage for those files.', 'error');
  const existing = await capturesForSession(state.activeSession.localSessionId, state.identity);
  let order = existing.length;
  for (const file of files) {
    if (!state.identity) return;
    const limit = file.type.startsWith('video/') ? state.identity.captureLimits.maxVideoFileSizeBytes : state.identity.captureLimits.maxCaptureFileSizeBytes;
    if (file.size > limit) { setMessage(`${file.name} exceeds the configured offline capture limit.`, 'error'); continue; }
    await addCapture(state.activeSession, file, order++);
  }
  await refreshStorageEstimate();
  setMessage(`${files.length} capture(s) saved locally.`, 'success');
  await renderWorkspace();
}

async function moveCapture(captures: OfflineCaptureRecord[], index: number, direction: -1 | 1) {
  const next = index + direction;
  if (next < 0 || next >= captures.length) return;
  [captures[index], captures[next]] = [captures[next], captures[index]];
  await Promise.all(captures.map((capture: OfflineCaptureRecord, reportOrder: number) => updateCapture(capture, { metadata: { ...capture.metadata, reportOrder } })));
  await renderWorkspace();
}

async function syncSession(localSessionId: string) {
  const reachability = await canReachServer(state.identity);
  if (!reachability.ok) return setMessage(reachability.error || 'Server is not reachable yet. Local data is preserved and sync can be retried.', reachability.status === 'unauthenticated' ? 'error' : 'warning');
  const sessions = await listSessions(state.identity);
  let session = sessions.find((candidate: OfflineLocalSession) => candidate.localSessionId === localSessionId);
  if (!session) return;
  try {
    session = await saveSession(session, { status: SESSION_STATUSES.creatingServerSession, serverCreateAttemptCount: (session.serverCreateAttemptCount || 0) + 1, serverCreateLastAttemptAt: now(), lastError: null });
    if (!session.serverSessionId) {
      const response = await fetch('/api/dashboard/sessions/offline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientSessionId: session.localSessionId, organizationId: session.organizationId, idempotencyKey: session.idempotencyKey, title: session.title, sessionType: session.sessionType, createdAt: session.createdAt }) });
      if (response.status === 401 || response.status === 403) throw new Error('Sign-in required to complete sync. Local data remains on this device.');
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.sessionId) throw new Error(result.error || 'Unable to create or recover the server session.');
      if (!state.identity) throw new Error('Device identity is unavailable.');
      await retargetSessionCaptures(session.localSessionId, result.sessionId, state.identity);
      session = await saveSession(session, { serverSessionId: result.sessionId, serverCreateRecoveredAt: now(), status: SESSION_STATUSES.handoffPending });
    }
    const stats = await sessionStats(session.localSessionId, state.identity);
    await saveSession(session, { status: stats.pendingCount > 0 ? SESSION_STATUSES.handoffPending : SESSION_STATUSES.synced, syncedAt: stats.pendingCount > 0 ? session.syncedAt : now(), lastError: null });
    setMessage('Prepared for online handoff. Opening CRED to upload and verify queued media.', 'success');
    window.setTimeout(() => { window.location.href = '/dashboard?offlineSync=1'; }, 300);
  } catch (error) {
    await saveSession(session, { status: SESSION_STATUSES.error, lastError: error instanceof Error ? error.message : 'Sync failed.' });
    setMessage(error instanceof Error ? error.message : 'Sync failed.', 'error');
  }
  if (state.activeSession?.localSessionId === localSessionId) await openSession(localSessionId); else await renderDashboard();
}

async function boot() {
  state.capabilities = detectCapabilities();
  await ensureServiceWorkerControl();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  ($('newSession') as HTMLButtonElement).onclick = async () => { if (!state.identity) return setMessage('Device not provisioned. Sign in online first.', 'error'); const session = await createSession(state.identity); await openSession(session.localSessionId); };
  ($('syncAll') as HTMLButtonElement).onclick = async () => { const sessions = await listSessions(state.identity); for (const session of sessions.filter((candidate: OfflineLocalSession) => SYNCABLE_STATUSES.includes(candidate.status as SessionStatus))) await syncSession(session.localSessionId); };
  window.addEventListener('online', () => setMessage('Network signal returned. Use Prepare online handoff to verify server reachability and continue upload.', 'success'));
  if (navigator.serviceWorker?.controller) {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => { $('version').textContent = `Service worker: ${JSON.stringify(event.data)}`; };
    navigator.serviceWorker.controller.postMessage({ type: 'CRED_SW_DIAGNOSTICS' }, [channel.port2]);
  }
  await renderDashboard();
}

boot().catch((error) => { console.error(error); setMessage(error instanceof Error ? error.message : 'Offline shell failed to start.', 'error'); });
