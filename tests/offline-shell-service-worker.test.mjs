import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const generator = fs.readFileSync('scripts/generate-offline-sw.mjs', 'utf8');
const offlineHtml = fs.readFileSync('public/offline.html', 'utf8');

test('offline shell is a static document that loads deterministic local assets', () => {
  assert.match(offlineHtml, /CRED offline shell/);
  assert.match(offlineHtml, /\/offline\/offline-shell\.css/);
  assert.match(offlineHtml, /type="module" src="\/offline\/offline-shell\.js"/);
  assert.doesNotMatch(offlineHtml, /indexedDB\.open/);
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');
  assert.match(shell, /navigator\.serviceWorker\.register\('\/sw\.js'/);
  assert.match(shell, /navigator\.serviceWorker\.controller/);
  assert.match(shell, /CONTROL_RELOAD_KEY/);
  assert.match(shell, /Offline ready on this device/);
});

test('service-worker generation precaches static offline entry and all shell assets', () => {
  assert.match(generator, /"\/offline\.html"/);
  assert.match(generator, /"\/apple-touch-icon\.png"/);
  assert.match(generator, /offlineFiles/);
  assert.match(generator, /redirect: "error"/);
  assert.match(generator, /Refusing to precache HTML for asset/);
  assert.match(generator, /response\.redirected/);
  assert.match(generator, /response\.type === "opaque"/);
});

test('offline navigation fallback returns cached document directly without redirects', () => {
  assert.match(generator, /return offlineDocument\(\)/);
  assert.doesNotMatch(generator, /Response\.redirect/);
  assert.match(generator, /NAVIGATION_PATHS = new Set\(\["\/", "\/dashboard", "\/offline", "\/offline\/capture"\]\)/);
  assert.match(generator, /url\.pathname\.startsWith\("\/dashboard\/"\)/);
});

test('RSC requests are handled separately and never receive an HTML fallback', () => {
  assert.match(generator, /isRscRequest/);
  assert.match(generator, /text\/x-component/);
  assert.match(generator, /RSC data is unavailable offline/);
  assert.match(generator, /"Content-Type": "application\/json; charset=utf-8"/);
});



test('offline readiness polls cache installation instead of finalizing at registration', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');

  assert.match(shell, /async function waitForOfflineAssets\(requiredAssets = REQUIRED_OFFLINE_ASSETS, timeoutMs = TIMEOUTS\.cache, intervalMs = TIMEOUTS\.cachePoll\)/);
  assert.match(shell, /while \(Date\.now\(\) < expires\)/);
  assert.match(shell, /await requiredAssetsCached\(requiredAssets\)/);
  assert.match(shell, /finalStatus: 'Installing offline assets…'/);
  assert.match(shell, /finalStatus: 'Offline assets installed\.'/);
  assert.match(shell, /finalStatus: 'Offline asset installation timed out\.'/);
  assert.match(shell, /cacheMissing: cacheState\.missing \|\| REQUIRED_OFFLINE_ASSETS/);
});

test('offline readiness watches service worker lifecycle states', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');

  assert.match(shell, /function waitForWorkerState\(registration: ServiceWorkerRegistration, targetStates: ServiceWorkerState\[\], timeoutMs = TIMEOUTS\.workerState\)/);
  assert.match(shell, /registration\.installing, registration\.waiting, registration\.active/);
  assert.match(shell, /worker\.addEventListener\('statechange', listener\)/);
  assert.match(shell, /registration\.addEventListener\('updatefound', onUpdateFound\)/);
  assert.match(shell, /waitForWorkerState\(registration, \['installed', 'activating', 'activated'\], TIMEOUTS\.workerState\)/);
});

test('offline readiness distinguishes controlled and uncontrolled installed assets', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');

  assert.match(shell, /Offline capture available now; cold launch protection pending\./);
  assert.match(shell, /Test offline reload/);
  assert.match(shell, /const ready = identityReady && sw\.registered && sw\.activated && sw\.cached;/);
  assert.doesNotMatch(shell, /const ready = identityReady && sw\.registered && sw\.activated && sw\.controlled && sw\.cached;/);
});

test('offline readiness does not leave registration as the final status', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');
  const ensureBody = shell.slice(shell.indexOf('async function ensureServiceWorkerControl'), shell.indexOf('function diagnosticsPayload'));

  assert.doesNotMatch(ensureBody, /finalStatus: 'Registration succeeded'/);
  assert.doesNotMatch(ensureBody, /finalStatus: 'Checking offline readiness…'/);
  assert.match(ensureBody, /finalStatus: 'Installing offline assets…'/);
});

test('offline shell renders readiness panel before awaiting service worker readiness', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');
  const bootBody = shell.slice(shell.indexOf('async function boot'), shell.indexOf('boot().catch'));

  assert.match(bootBody, /renderOfflineReadiness\(\);/);
  assert.match(bootBody, /const serviceWorkerReadiness = ensureServiceWorkerControl\(\);/);
  assert.match(bootBody, /await renderDashboard\(\);[\s\S]*await serviceWorkerReadiness;/);
  assert.doesNotMatch(bootBody, /await ensureServiceWorkerControl\(\);/);
});

test('Apple Home Screen icon is declared, generated as 180px PNG, and precached', () => {
  const layout = fs.readFileSync('app/layout.tsx', 'utf8');
  const iconScript = fs.readFileSync('scripts/generate-apple-touch-icon.mjs', 'utf8');
  const generated = spawnSync(process.execPath, ['scripts/generate-apple-touch-icon.mjs'], { encoding: 'utf8' });
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const icon = fs.readFileSync('public/apple-touch-icon.png');
  assert.deepEqual([...icon.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(icon.readUInt32BE(16), 180);
  assert.equal(icon.readUInt32BE(20), 180);
  assert.equal(icon[24], 8, 'PNG bit depth should be 8');
  assert.equal(icon[25], 6, 'PNG color type should be RGBA');
  assert.match(layout, /apple: \[\{ url: '\/apple-touch-icon\.png', sizes: '180x180', type: 'image\/png' \}\]/);
  assert.match(iconScript, /public.+icons.+cred-icon\.svg/s);
  assert.match(iconScript, /CRED by ProFixIQ app icon/);
  assert.match(generator, /await fs\.access\(path\.join\(root, "public", "apple-touch-icon\.png"\)\)/);
  assert.match(generator, /"\/apple-touch-icon\.png"/);
  assert.match(generator, /url\.pathname === "\/apple-touch-icon\.png"/);
});


test('iOS/iPadOS Home Screen documentation points users to offline install page', () => {
  const docs = fs.readFileSync('docs/OFFLINE_HOME_SCREEN_INSTALL.md', 'utf8');
  assert.match(docs, /Set up offline Home Screen app/);
  assert.match(docs, /\/offline\.html/);
  assert.match(docs, /Share → Add to Home Screen/);
  assert.match(docs, /Airplane Mode/);
});
