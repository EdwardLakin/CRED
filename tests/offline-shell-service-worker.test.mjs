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
  assert.match(generator, /NAVIGATION_PATHS = new Set\(\["\/", "\/dashboard", "\/sign-in", "\/offline", "\/offline\/capture"\]\)/);
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

  assert.match(shell, /Offline Ready/);
  assert.match(shell, /Developer diagnostics/);
  assert.match(shell, /const ready = identityReady && storageReady && sw\.registered && sw\.activated && sw\.cached;/);
  assert.doesNotMatch(shell, /const ready = identityReady && storageReady && sw\.registered && sw\.activated && sw\.controlled && sw\.cached;/);
});

test('offline readiness does not leave registration as the final status', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');
  const ensureBody = shell.slice(shell.indexOf('async function ensureServiceWorkerControl'), shell.indexOf('function diagnosticsPayload'));

  assert.doesNotMatch(ensureBody, /finalStatus: 'Registration succeeded'/);
  assert.doesNotMatch(ensureBody, /finalStatus: 'Checking offline readiness…'/);
  assert.match(ensureBody, /finalStatus: 'Installing offline assets…'/);
});


test('offline boot with existing controller skips /sw.js fetch check', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');
  const ensureBody = shell.slice(shell.indexOf('async function ensureServiceWorkerControl'), shell.indexOf('function diagnosticsPayload'));

  assert.match(ensureBody, /const controlledAtBoot = Boolean\(navigator\.serviceWorker\.controller\)/);
  assert.match(ensureBody, /if \(!navigator\.onLine && controlledAtBoot && activeAtBoot\) return await finalizeOfflineControlledBoot\(snapshots\);/);
  assert.match(ensureBody, /if \(navigator\.onLine && \(!controlledAtBoot && !activeAtBoot\)\) \{ await checkServiceWorkerScript\(\);/);
});

test('offline boot with active registration but register load failure still succeeds if cache exists', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');
  const ensureBody = shell.slice(shell.indexOf('async function ensureServiceWorkerControl'), shell.indexOf('function diagnosticsPayload'));

  assert.match(ensureBody, /catch \(error\)[\s\S]*if \(navigator\.serviceWorker\.controller && activeRegistrationSnapshot\(snapshots\)\) return await finalizeOfflineControlledBoot\(snapshots\);/);
  assert.match(shell, /if \(cacheState\.cached\) \{ sessionStorage\.removeItem\(CONTROL_RELOAD_KEY\); updateSw\(\{ \.\.\.base, finalStatus: 'Offline ready on this device', error: null \}\);/);
  assert.doesNotMatch(ensureBody, /registrationError: message[\s\S]{0,120}finalStatus: 'Load failed'/);
});

test('offline boot does not clear cacheNames/cacheMissing incorrectly', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');
  const offlineBody = shell.slice(shell.indexOf('async function finalizeOfflineControlledBoot'), shell.indexOf('async function ensureServiceWorkerControl'));

  assert.match(offlineBody, /cacheNames: cacheState\.cacheNames \|\| state\.serviceWorker\.cacheNames/);
  assert.match(offlineBody, /cacheMissing: cacheState\.missing \|\| REQUIRED_OFFLINE_ASSETS/);
  assert.match(shell, /const response = await caches\.match\(asset\)\.catch\(\(\) => undefined\);/);
});

test('offline boot final status becomes Offline ready on this device', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');
  const offlineBody = shell.slice(shell.indexOf('async function finalizeOfflineControlledBoot'), shell.indexOf('async function ensureServiceWorkerControl'));

  assert.match(offlineBody, /finalStatus: 'Offline ready on this device'/);
  assert.match(offlineBody, /registered: Boolean\(activeRegistration\)/);
  assert.match(offlineBody, /activated: Boolean\(activeRegistration\?\.active\.scriptURL \|\| navigator\.serviceWorker\.controller\)/);
});

test('offline boot with controller but missing assets shows cache-missing failure, not load failed', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');
  const offlineBody = shell.slice(shell.indexOf('async function finalizeOfflineControlledBoot'), shell.indexOf('async function ensureServiceWorkerControl'));

  assert.match(offlineBody, /cacheVerificationStatus\(cacheState\.cached, cacheState\.missing, cacheState\.error\)/);
  assert.match(offlineBody, /error: cacheState\.error \|\| 'Offline cache missing required assets'/);
  assert.doesNotMatch(offlineBody, /Load failed/);
});



test('offline event does not reset a controlled ready state to Load failed', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');
  const bootBody = shell.slice(shell.indexOf('async function boot'), shell.indexOf('boot().catch'));
  const updateBody = shell.slice(shell.indexOf('function updateSw'), shell.indexOf('function workerSnapshot'));

  assert.match(bootBody, /window\.addEventListener\('offline', \(\) => \{ renderOnlineNavigation\(\); setMessage\('Network signal is offline/);
  assert.doesNotMatch(bootBody, /offline[\s\S]{0,140}updateSw\(\{[\s\S]{0,80}Load failed/);
  assert.match(updateBody, /if \(\(patch\.finalStatus === 'Load failed' \|\| patch\.finalStatus === 'Registration attempted'\) && \(current\.cached \|\| next\.cached\)\) next\.finalStatus = 'Offline ready on this device';/);
});

test('controller-present state survives register/update Load failed errors', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');
  const ensureBody = shell.slice(shell.indexOf('async function ensureServiceWorkerControl'), shell.indexOf('function diagnosticsPayload'));
  const updateBody = shell.slice(shell.indexOf('function updateSw'), shell.indexOf('function workerSnapshot'));

  assert.match(ensureBody, /if \(navigator\.serviceWorker\.controller && activeRegistrationSnapshot\(snapshots\)\) return await finalizeOfflineControlledBoot\(snapshots\);/);
  assert.match(updateBody, /const authoritativeController = current\.controlled \|\| Boolean\(navigator\.serviceWorker\?\.controller\);/);
  assert.match(updateBody, /next\.controlled = true;/);
});

test('cacheNames/cacheMissing are not overwritten by a failed network check', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');
  const updateBody = shell.slice(shell.indexOf('function updateSw'), shell.indexOf('function workerSnapshot'));
  const cacheBody = shell.slice(shell.indexOf('async function requiredAssetsCached'), shell.indexOf('function detectStuckInstalling'));

  assert.match(updateBody, /if \(current\.cached && !patch\.cached\) \{/);
  assert.match(updateBody, /next\.cacheNames = current\.cacheNames;/);
  assert.match(updateBody, /next\.cacheMissing = current\.cacheMissing;/);
  assert.match(cacheBody, /saveLastGoodCacheVerification\(cacheNames\)/);
});

test('raw diagnostics objects are never rendered in the service-worker summary line', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');
  const bootBody = shell.slice(shell.indexOf('async function boot'), shell.indexOf('boot().catch'));
  const renderBody = shell.slice(shell.indexOf('function renderOfflineReadiness'), shell.indexOf('function detectCapabilities'));

  assert.match(shell, /function safeStatusLabel\(value: unknown\): string/);
  assert.doesNotMatch(bootBody, /JSON\.stringify\(event\.data\)/);
  assert.match(renderBody, /offlineDebugEnabled\(\)/);
  assert.match(renderBody, /Offline Ready/);
  assert.match(renderBody, /Developer diagnostics/);
  assert.doesNotMatch(renderBody, /Service worker: \$\{safeStatusLabel/);
});

test('finalStatus remains Offline ready when controller and cache are present and navigator.onLine becomes false', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');
  const updateBody = shell.slice(shell.indexOf('function updateSw'), shell.indexOf('function workerSnapshot'));
  assert.match(updateBody, /patch\.finalStatus === 'Load failed'/);
  assert.match(updateBody, /next\.finalStatus = 'Offline ready on this device'/);
});

test('finalStatus only becomes Load failed without controller, active registration, or cache fallback', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');
  const ensureBody = shell.slice(shell.indexOf('async function ensureServiceWorkerControl'), shell.indexOf('function diagnosticsPayload'));
  assert.match(ensureBody, /finalStatus: !navigator\.serviceWorker\.controller && !state\.serviceWorker\.cached \? 'Load failed' : message/);
});

test('local sessions remain visible after Airplane Mode and Start New Session remains available offline when provisioned', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');
  const bootBody = shell.slice(shell.indexOf('async function boot'), shell.indexOf('boot().catch'));
  const renderBody = shell.slice(shell.indexOf('async function renderDashboard'), shell.indexOf('function sessionCard'));

  assert.match(bootBody, /window\.addEventListener\('offline', \(\) => \{ renderOnlineNavigation\(\);/);
  assert.doesNotMatch(bootBody, /window\.addEventListener\('offline'[\s\S]{0,200}renderDashboard\(/);
  assert.match(renderBody, /const sessions = await listSessions\(state\.identity\);/);
  assert.match(bootBody, /\$\('newSession'\) as HTMLButtonElement\)\.onclick = async \(\) => \{ if \(!state\.identity\) return setMessage\('Device not provisioned/);
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
  assert.match(docs, /Sign in and provision this device/);
  assert.match(docs, /\/offline\.html/);
  assert.match(docs, /Share → Add to Home Screen/);
  assert.match(docs, /Airplane Mode/);
});

test('service worker install treats icons and generated static assets as optional', () => {
  const worker = fs.readFileSync('public/sw.js', 'utf8');

  assert.match(worker, /const REQUIRED_ASSETS = new Set\(REQUIRED_DIAGNOSTIC_ASSETS\)/);
  assert.match(worker, /optionalErrors\.push\(\{ asset, error: message \}\)/);
  assert.match(worker, /if \(REQUIRED_ASSETS\.has\(asset\)\) throw new Error\(`Required offline asset failed: \$\{asset\}: \$\{message\}`\)/);
  assert.doesNotMatch(worker.match(/const REQUIRED_DIAGNOSTIC_ASSETS = \[[^\]]+\]/)?.[0] || '', /apple-touch-icon|\/icons\/|\/splash\/|\/_next\/static\//);
});

test('service worker install does not reject for skipWaiting or diagnostic storage failures', () => {
  const worker = fs.readFileSync('public/sw.js', 'utf8');

  assert.match(worker, /async function executeSkipWaiting[\s\S]*return false;[\s\S]*\}/);
  assert.doesNotMatch(worker, /throw error; \} \}\n\nasync function storeInstallError/);
  assert.match(worker, /await storeInstallError\(message\)\.catch\(\(\) => undefined\);/);
  assert.match(worker, /await executeSkipWaiting\("install"\);/);
});

test('service worker cache.put failures include the exact asset name', () => {
  const worker = fs.readFileSync('public/sw.js', 'utf8');

  assert.match(worker, /Unable to cache\.put precache asset \$\{asset\}/);
  assert.match(worker, /Unable to fetch precache asset \$\{asset\}/);
});

test('successful required cache install resolves install and then activates with non-fatal clients.claim', () => {
  const worker = fs.readFileSync('public/sw.js', 'utf8');

  assert.match(worker, /markLifecycle\("install", \{ completedAt: new Date\(\)\.toISOString\(\), error: null, optionalErrors \}\);/);
  assert.match(worker, /await executeSkipWaiting\("install"\);/);
  assert.match(worker, /self\.addEventListener\("activate"/);
  assert.match(worker, /await self\.clients\.claim\(\)/);
  assert.match(worker, /clients\.claim failed/);
  assert.doesNotMatch(worker, /clients\.claim[\s\S]{0,220}throw error/);
});

test('fetch diagnostics are guarded so they cannot throw globally', () => {
  const worker = fs.readFileSync('public/sw.js', 'utf8');

  assert.match(worker, /self\.addEventListener\("fetch", \(event\) => \{\n  let request, url;/);
  assert.match(worker, /catch \(error\) \{\n    lifecycleState\.fetch = \{ \.\.\.lifecycleState\.fetch, error: errorMessage\(error\) \};\n    return;\n  \}/);
});

test('offline page reports service worker installing stuck after lifecycle timeout', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');

  assert.match(shell, /function detectStuckInstalling\(registration: ServiceWorkerRegistration, timeoutMs = TIMEOUTS\.workerState\)/);
  assert.match(shell, /worker\.state === 'installing'/);
  assert.match(shell, /finalStatus: 'Service worker install is stuck\.'/);
  assert.match(shell, /installingState: worker\.state/);
  assert.match(shell, /installingScriptURL: worker\.scriptURL/);
  assert.match(shell, /installingLastStateChangeAt/);
  assert.match(shell, /\['Installing state', sw\.installingState \|\| 'none'\]/);
  assert.match(shell, /\['Installing scriptURL', sw\.installingScriptURL \|\| 'none'\]/);
  assert.match(shell, /\['Last installing statechange', sw\.installingLastStateChangeAt \|\| 'not observed'\]/);
});


test('offline shell exposes online navigation actions for Home Screen launches', () => {
  const html = fs.readFileSync('public/offline.html', 'utf8');
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');

  assert.match(html, /id="onlineNavigation"/);
  assert.match(shell, /function navigateTo\(path: string\) \{ window\.location\.href = path; \}/);
  assert.match(shell, /Open CRED Dashboard/);
  assert.match(shell, /Sign in to CRED/);
  assert.match(shell, /Provision this device/);
  assert.match(shell, /Return to Offline Dashboard/);
  assert.match(shell, /Open Online Dashboard/);
  assert.match(shell, /Prepare All Reachable Sessions/);
  assert.match(shell, /Continue Offline Session/);
  assert.match(shell, /navigateTo\('\/dashboard'\)/);
  assert.match(shell, /navigateTo\('\/sign-in'\)/);
  assert.match(shell, /navigateTo\('\/dashboard\?offlineProvision=1'\)/);
});

test('not-provisioned offline shell shows primary sign-in and provision action', () => {
  const shell = fs.readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8');

  assert.match(shell, /Sign in and provision this device/);
  assert.match(shell, /signInProvisionPath/);
  assert.match(shell, /encodeURIComponent\('\/dashboard\?offlineProvision=1'\)/);
  assert.match(shell, /data-nav="signin-provision"/);
  assert.match(shell, /navigateTo\(signInProvisionPath\(\)\)/);
});

test('service worker does not intercept online dashboard and sign-in navigation with offline shell', () => {
  const generator = fs.readFileSync('scripts/generate-offline-sw.mjs', 'utf8');
  const worker = fs.readFileSync('public/sw.js', 'utf8');

  for (const source of [generator, worker]) {
    assert.match(source, /"\/sign-in"/);
    assert.match(source, /if \(!self\.navigator\.onLine && shouldUseOfflineShell\(url\)\) return offlineDocument\(\);/);
    assert.match(source, /const response = await fetchWithTimeout\(request, shouldUseOfflineShell\(url\) \? 10000 : 3000\);/);
    assert.match(source, new RegExp('catch \\{\\n      if \\(shouldUseOfflineShell\\(url\\)\\) return offlineDocument\\(\\);'));
  }
});
