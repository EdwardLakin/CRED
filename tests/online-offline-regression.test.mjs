import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const captureForm = readFileSync('src/features/capture/components/AddCaptureForm.tsx', 'utf8');
const syncEngine = readFileSync('src/features/offline/sync-engine.ts', 'utf8');
const swGenerator = readFileSync('scripts/generate-offline-sw.mjs', 'utf8');
const manifest = readFileSync('app/manifest.ts', 'utf8');

test('online server session capture uploads immediately and clears successful queue backup', () => {
  assert.match(captureForm, /void autoSaveSelectedMedia\(evidenceFiles\)/);
  assert.match(captureForm, /supabase\.storage\s*\n\s*\.from\("documentation-captures"\)\s*\n\s*\.upload\(storagePath, file/);
  assert.match(captureForm, /createCaptureRecordFromUploadedFile\(\{/);
  assert.match(captureForm, /if \(!isLocalUploadPending\(file\.status\)\) \{\s*void deleteUploadQueueRecord\(file\.id\)/s);
});

test('online notes save to the server session immediately', () => {
  assert.match(captureForm, /createTextNoteCaptureRecord\(\{\s*sessionId,/s);
  assert.match(captureForm, /updateCaptureItemNote\(\{\s*sessionId,\s*captureItemId: file\.captureItemId,/s);
});

test('service worker gives online capture navigations enough time before offline fallback', () => {
  assert.match(swGenerator, /fetchWithTimeout\(request, shouldUseOfflineShell\(url\) \? 10000 : 3000\)/);
  assert.doesNotMatch(swGenerator, /fetchWithTimeout\(request, shouldUseOfflineShell\(url\) \? 1200 : 3000\)/);
});

test('idle auth refresh retries upload before falling back to offline queue', () => {
  assert.match(captureForm, /async function refreshAuthSession/);
  assert.match(captureForm, /await supabase\.auth\.refreshSession\(\)/);
  assert.match(captureForm, /result\.stage === "authentication"/);
  assert.match(captureForm, /result = await createCaptureRecordFromUploadedFile\(\{/);
  assert.match(syncEngine, /async function refreshAuthSession/);
});

test('upload state cannot be uploading and failed at the same time', () => {
  assert.match(captureForm, /type UploadStatus =\s*\| "queued"\s*\| "uploading"[\s\S]*\| "failed";/);
  assert.match(captureForm, /status: UploadStatus/);
  assert.doesNotMatch(captureForm, /uploading\s*:\s*true/);
  assert.doesNotMatch(syncEngine, /uploading\s*:\s*true/);
});

test('offline fallback and connection copy only trigger on genuine offline/network failure', () => {
  assert.match(captureForm, /function isConnectivityFailureMessage/);
  assert.match(captureForm, /navigator\.onLine/);
  assert.match(captureForm, /function isAuthFailureMessage/);
  assert.match(captureForm, /Sign in again to continue uploading\./);
});

test('reopening CRED online starts at normal dashboard app, not Offline Dashboard', () => {
  assert.match(manifest, /start_url: "\/"/);
  assert.doesNotMatch(manifest, /start_url: "\/offline\.html"/);
});

test('existing server session receives queued backup captures automatically once reachable', () => {
  assert.match(syncEngine, /this\.unsubscribeConnectivity = subscribe\(\(status\) => \{\s*if \(status\.online\) \{\s*void this\.syncNow\(\);/s);
  assert.match(syncEngine, /const pending = await getPendingCaptures\(userId\)/);
  assert.match(syncEngine, /await syncCapture\(record\)/);
});

test('manual Sync is not required while online', () => {
  assert.match(captureForm, /void resumeQueuedMediaUpload\(resumableFiles\)/);
  assert.match(syncEngine, /start\(\) \{[\s\S]*void this\.refreshPendingCount\(\);/);
});
