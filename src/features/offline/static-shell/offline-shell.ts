import type { OfflineCapabilities, OfflineCaptureRecord, OfflineIdentity, OfflineLocalSession, ReachabilityResult, SessionStatus } from './contracts.js';
import { now, SESSION_STATUSES, SYNCABLE_STATUSES } from './contracts.js';
import { addCapture, capturesForSession, createSession, deleteCapture, deleteSession, getOfflineIdentity, listSessions, retargetSessionCaptures, saveSession, sessionStats, updateCapture } from './store.js';

const REQUIRED_OFFLINE_ASSETS = ['/offline.html', '/offline/offline-shell.css', '/offline/offline-shell.js', '/offline/contracts.js', '/offline/db.js', '/offline/store.js', '/manifest.webmanifest', '/apple-touch-icon.png'];
const CONTROL_RELOAD_KEY = 'cred-offline-control-reload-attempted';
const TIMEOUTS = { swFetch: 5000, registration: 10000, ready: 10000, controller: 3500, cache: 5000, diagnostics: 3500 };
type ServiceWorkerReadiness = { supported: boolean; registrationAttempted: boolean; registered: boolean; registrationError: string | null; installing: boolean; installed: boolean; waiting: boolean; activating: boolean; activated: boolean; skipWaitingSent: boolean; controllerChangeReceived: boolean; controlled: boolean; readyResolved: boolean; readyTimedOut: boolean; cacheNames: string[]; cached: boolean; cacheMissing: string[]; diagnostics: any; finalStatus: string; error: string | null; swScriptCheck: any };
const state: { identity: OfflineIdentity | null; activeSession: OfflineLocalSession | null; objectUrls: string[]; storageEstimate: StorageEstimate | null; capabilities: OfflineCapabilities | null; serviceWorker: ServiceWorkerReadiness } = { identity: null, activeSession: null, objectUrls: [], storageEstimate: null, capabilities: null, serviceWorker: { supported: 'serviceWorker' in navigator, registrationAttempted: false, registered: false, registrationError: null, installing: false, installed: false, waiting: false, activating: false, activated: false, skipWaitingSent: false, controllerChangeReceived: false, controlled: Boolean(navigator.serviceWorker?.controller), readyResolved: false, readyTimedOut: false, cacheNames: [], cached: false, cacheMissing: REQUIRED_OFFLINE_ASSETS, diagnostics: null, finalStatus: 'Checking offline readiness…', error: null, swScriptCheck: null } };
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const escapeHtml = (value: unknown): string => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
const formatBytes = (bytes: number): string => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const formatDate = (value: string | null | undefined): string => value ? new Date(value).toLocaleString() : 'Not recorded';
function setMessage(text: string, className = '') { const el = $('message'); if (el) { el.textContent = text || ''; el.className = className; } }
function logReadiness(step: string, detail?: unknown) { console.log(`[CRED offline readiness] ${step}`, detail ?? ''); }
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> { let timeoutId = 0; const timeout = new Promise<T>((_, reject) => { timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms); }); return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId)); }
function updateSw(patch: Partial<ServiceWorkerReadiness>) { state.serviceWorker = { ...state.serviceWorker, ...patch }; renderOfflineReadiness(); }
function watchRegistration(registration: ServiceWorkerRegistration) { const watchWorker = (worker: ServiceWorker | null) => { if (!worker) return; const sync = () => updateSw({ installing: worker.state === 'installing', installed: worker.state === 'installed' || worker.state === 'activated', activating: worker.state === 'activating', activated: worker.state === 'activated' }); sync(); logReadiness(`worker state ${worker.state}`); worker.addEventListener('statechange', () => { logReadiness(`worker state ${worker.state}`); sync(); }); }; watchWorker(registration.installing || registration.waiting || registration.active); registration.addEventListener('updatefound', () => watchWorker(registration.installing)); }
async function checkServiceWorkerScript(): Promise<any> { logReadiness('checking /sw.js'); const response = await withTimeout(fetch('/sw.js', { cache: 'no-store', redirect: 'manual', headers: { Accept: 'application/javascript,text/javascript,*/*' } }), TIMEOUTS.swFetch, '/sw.js fetch'); const contentType = response.headers.get('content-type') || ''; const text = await response.clone().text().catch(() => ''); const result = { status: response.status, ok: response.ok, redirected: response.redirected, type: response.type, contentType }; if (!response.ok) throw new Error(`/sw.js unavailable: status=${response.status} content-type=${contentType || 'missing'}`); if (response.redirected || response.type === 'opaqueredirect') throw new Error(`/sw.js redirected: status=${response.status} type=${response.type}`); if (contentType.includes('text/html') || /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)) throw new Error(`/sw.js returned HTML: status=${response.status} content-type=${contentType || 'missing'}`); if (contentType && !/(javascript|ecmascript|text\/plain|application\/octet-stream)/i.test(contentType)) throw new Error(`/sw.js wrong content-type: ${contentType}`); updateSw({ swScriptCheck: result }); return result; }
function waitForControllerChange(timeoutMs = TIMEOUTS.controller): Promise<boolean> { if (navigator.serviceWorker?.controller) return Promise.resolve(true); logReadiness('waiting for controllerchange'); return new Promise((resolve) => { const timeout = window.setTimeout(() => { cleanup(); resolve(Boolean(navigator.serviceWorker?.controller)); }, timeoutMs); const onControllerChange = () => { updateSw({ controllerChangeReceived: true, controlled: Boolean(navigator.serviceWorker?.controller) }); cleanup(); resolve(true); }; const cleanup = () => { window.clearTimeout(timeout); navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange); }; navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange, { once: true }); }); }
async function requiredAssetsCached(): Promise<{ cached: boolean; missing: string[]; cacheNames: string[]; error?: string }> { logReadiness('verifying cache assets'); if (!('caches' in globalThis)) return { cached: false, missing: REQUIRED_OFFLINE_ASSETS, cacheNames: [], error: 'Cache Storage is not supported.' }; return withTimeout((async () => { const cacheNames = await caches.keys(); const results = await Promise.all(REQUIRED_OFFLINE_ASSETS.map(async (asset) => ({ asset, response: await caches.match(asset).catch(() => undefined) }))); const missing = results.filter(({ response }) => !response?.ok).map(({ asset }) => asset); return { cached: missing.length === 0, missing, cacheNames }; })(), TIMEOUTS.cache, 'Cache verification'); }
async function getServiceWorkerDiagnostics(): Promise<any> { const target = navigator.serviceWorker?.controller || (await navigator.serviceWorker?.getRegistration('/'))?.active; if (!target) return null; return withTimeout(new Promise((resolve) => { const channel = new MessageChannel(); channel.port1.onmessage = (event) => resolve(event.data); target.postMessage({ type: 'CRED_SW_DIAGNOSTICS' }, [channel.port2]); }), TIMEOUTS.diagnostics, 'Service worker diagnostics').catch((error) => ({ error: error instanceof Error ? error.message : String(error) })); }
async function ensureServiceWorkerControl(): Promise<ServiceWorkerReadiness> { if (!('serviceWorker' in navigator)) { updateSw({ supported: false, finalStatus: 'Service workers are not supported in this browser.', error: 'Service workers are not supported in this browser.' }); return state.serviceWorker; } navigator.serviceWorker.addEventListener('controllerchange', () => { logReadiness('controllerchange received'); updateSw({ controllerChangeReceived: true, controlled: Boolean(navigator.serviceWorker.controller) }); }); try { await checkServiceWorkerScript(); updateSw({ registrationAttempted: true, finalStatus: 'Registration attempted' }); logReadiness('registering /sw.js'); const registration = await withTimeout(navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }), TIMEOUTS.registration, 'Service worker registration'); watchRegistration(registration); updateSw({ registered: true, registrationError: null, waiting: Boolean(registration.waiting), activated: Boolean(registration.active), finalStatus: 'Registration succeeded' }); await registration.update().catch((error) => logReadiness('registration update failed', error)); if (registration.waiting) { registration.waiting.postMessage({ type: 'SKIP_WAITING' }); updateSw({ skipWaitingSent: true, waiting: true }); logReadiness('skipWaiting message sent'); } try { const readyRegistration = await withTimeout(navigator.serviceWorker.ready, TIMEOUTS.ready, 'navigator.serviceWorker.ready'); updateSw({ readyResolved: true, readyTimedOut: false, activated: Boolean(readyRegistration.active || registration.active) }); logReadiness('navigator.serviceWorker.ready resolved'); } catch (error) { updateSw({ readyResolved: false, readyTimedOut: true, error: error instanceof Error ? error.message : String(error) }); logReadiness('navigator.serviceWorker.ready timed out', error); } let controlled = Boolean(navigator.serviceWorker.controller); if (!controlled) controlled = await waitForControllerChange(); const cacheState = await requiredAssetsCached().catch((error) => ({ cached: false, missing: REQUIRED_OFFLINE_ASSETS, cacheNames: [], error: error instanceof Error ? error.message : String(error) })); const diagnostics = await getServiceWorkerDiagnostics(); const base = { controlled, cacheNames: cacheState.cacheNames || [], cached: cacheState.cached, cacheMissing: cacheState.missing || REQUIRED_OFFLINE_ASSETS, diagnostics }; if (!controlled) { const reloaded = sessionStorage.getItem(CONTROL_RELOAD_KEY) === 'true'; updateSw({ ...base, finalStatus: reloaded ? 'Service worker installed but this browser has not attached control yet. Close and reopen CRED while online.' : 'Service worker installed. Reload once to finish offline setup.', error: null }); return state.serviceWorker; } sessionStorage.removeItem(CONTROL_RELOAD_KEY); const finalStatus = cacheState.cached ? 'Offline ready' : `Missing required offline assets: ${(cacheState.missing || []).join(', ') || cacheState.error || 'unknown'}`; updateSw({ ...base, finalStatus, error: cacheState.error || null }); return state.serviceWorker; } catch (error) { const message = error instanceof Error ? error.message : String(error); updateSw({ registered: false, registrationError: message, error: message, finalStatus: message }); return state.serviceWorker; } }
function diagnosticsPayload() { return { origin: window.location.origin, href: window.location.href, userAgent: navigator.userAgent, online: navigator.onLine, reloadedOnce: sessionStorage.getItem(CONTROL_RELOAD_KEY) === 'true', serviceWorker: state.serviceWorker, capabilities: state.capabilities, storageEstimate: state.storageEstimate }; }
async function copyDiagnostics() { const payload = JSON.stringify(diagnosticsPayload(), null, 2); await navigator.clipboard?.writeText(payload).catch(() => undefined); setMessage(navigator.clipboard ? 'Diagnostics copied.' : payload, navigator.clipboard ? 'success' : 'warning'); }
function renderOfflineReadiness(): void { const sw = state.serviceWorker; const identityReady = Boolean(state.identity); const readyCopy = 'Offline ready on this device'; const ready = identityReady && sw.registered && sw.activated && sw.controlled && sw.cached; const rows = [['Current origin', window.location.origin], ['Service worker supported', sw.supported ? 'yes' : 'no'], ['Registration attempted', sw.registrationAttempted ? 'yes' : 'no'], ['Registration', sw.registrationError ? `failed: ${sw.registrationError}` : sw.registered ? 'succeeded' : 'not complete'], ['Installing', sw.installing ? 'yes' : 'no'], ['Installed', sw.installed ? 'yes' : 'no'], ['Waiting', sw.waiting ? 'yes' : 'no'], ['Activating', sw.activating ? 'yes' : 'no'], ['Activated', sw.activated ? 'yes' : 'no'], ['skipWaiting message sent', sw.skipWaitingSent ? 'yes' : 'no'], ['controllerchange received', sw.controllerChangeReceived ? 'yes' : 'no'], ['navigator.serviceWorker.controller', sw.controlled ? 'present' : 'absent'], ['navigator.serviceWorker.ready', sw.readyResolved ? 'resolved' : sw.readyTimedOut ? 'timed out' : 'pending/not reached'], ['Cache names found', sw.cacheNames.length ? sw.cacheNames.join(', ') : 'none'], ['Required offline assets', sw.cached ? 'found' : `missing: ${sw.cacheMissing.join(', ') || 'unknown'}`], ['Final status', sw.finalStatus]]; const reloadButton = !sw.controlled && sw.registered && sessionStorage.getItem(CONTROL_RELOAD_KEY) !== 'true' ? '<button id="reloadOfflineSetup" class="secondary">Reload</button>' : ''; $('offlineReady').innerHTML = `<span class="status ${ready ? 'success' : sw.error || sw.registrationError ? 'error' : 'warning'}">${escapeHtml(ready ? readyCopy : sw.finalStatus)}</span><div class="diagnostics-grid">${rows.map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong></div><div>${escapeHtml(value)}</div>`).join('')}</div><div class="button-row">${reloadButton}<button id="copyDiagnostics" class="secondary">Copy diagnostics</button></div>`; $('reloadOfflineSetup')?.addEventListener('click', () => { sessionStorage.setItem(CONTROL_RELOAD_KEY, 'true'); window.location.reload(); }); $('copyDiagnostics')?.addEventListener('click', copyDiagnostics); $('version').textContent = `Service worker: ${sw.diagnostics?.version || sw.diagnostics?.activeCacheName || sw.finalStatus}`; }

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
