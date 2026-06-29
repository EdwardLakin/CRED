import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const contracts = fs.readFileSync('src/features/offline/static-shell/contracts.ts', 'utf8');
const store = fs.readFileSync('src/features/offline/static-shell/store.ts', 'utf8');
const app = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');
const db = fs.readFileSync('src/features/offline/db.ts', 'utf8');
const offlineHtml = fs.readFileSync('public/offline.html', 'utf8');

test('offline database exposes multi-session isolation indexes without destructive reset', () => {
  assert.match(db, /OFFLINE_DB_VERSION = 3/);
  assert.match(db, /by-organization-user/);
  assert.match(db, /by-last-opened-at/);
  assert.match(db, /by-local-session/);
  assert.match(db, /by-local-session-status/);
  assert.doesNotMatch(db, /deleteDatabase/);
});

test('static shell supports three retained local sessions and dashboard session picker', () => {
  assert.match(offlineHtml, /session-list/);
  assert.match(app, /listSessions/);
  assert.match(app, /sessionCard/);
  assert.match(offlineHtml, /Start New Session/);
  assert.match(app, /Continue Offline Session/);
});

test('captures are scoped by localSessionId for restore, note edits, reorder, retarget, and deletion', () => {
  assert.match(store, /capture\.localSessionId === localSessionId/);
  assert.match(store, /session\.localSessionId/);
  assert.match(store, /retargetSessionCaptures\(localSessionId/);
  assert.match(store, /remove\('queuedCaptures', capture\.localId\)/);
  assert.match(app, /moveCapture\(captures, index/);
  assert.match(app, /metadata\.technicianNote/);
});

test('server-session idempotency is per organization and local session', () => {
  assert.match(contracts, /offline-session:\$\{organizationId\}:\$\{localSessionId\}/);
  assert.match(store, /createOfflineSessionIdempotencyKey\(identity\.organizationId, localSessionId\)/);
  assert.match(app, /idempotencyKey: session\.idempotencyKey/);
});

test('independent sync preserves auth failures and partial work per session', () => {
  assert.match(app, /async function syncSession\(localSessionId/);
  assert.match(app, /Sign-in required to complete sync\. Local data remains/);
  assert.match(contracts, /handoff_pending/);
  assert.match(app, /for \(const session of sessions\.filter/);
  assert.doesNotMatch(app, /clearQueue/);
});


test('handoff requires authenticated identity to match provisioned user and organization', () => {
  assert.match(app, /result\.userId !== identity\.userId/);
  assert.match(app, /result\.organizationId !== identity\.organizationId/);
  assert.match(app, /Wrong account or organization/);
  assert.match(app, /Device is not provisioned for offline handoff/);
  assert.match(app, /Sign-in required to complete sync/);
  assert.match(app, /fetch\('\/api\/dashboard\/sessions\/offline'/);
});

test('verification uses storage metadata instead of downloading full media blobs', () => {
  const verifyRoute = fs.readFileSync('app/api/offline/captures/verify/route.ts', 'utf8');
  assert.match(verifyRoute, /\.info\(storagePath\)/);
  assert.doesNotMatch(verifyRoute, /\.download\(storagePath\)/);
  assert.match(verifyRoute, /storage_size/);
  assert.match(verifyRoute, /technician_note/);
  assert.match(verifyRoute, /report_order/);
});
