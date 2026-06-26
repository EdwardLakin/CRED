import fs from 'node:fs/promises';

const baseUrl = process.argv[2] || process.env.VERCEL_PREVIEW_URL || process.env.OFFLINE_VERIFY_BASE_URL;
const localWorker = await fs.readFile('public/sw.js', 'utf8');
const localVersion = localWorker.match(/CACHE_VERSION = "([^"]+)"/)?.[1];
const precacheJson = localWorker.match(/const PRECACHE_ASSETS = (\[[\s\S]*?\]);/)?.[1] ?? '[]';
const precacheAssets = JSON.parse(precacheJson);

if (!baseUrl) {
  console.log(JSON.stringify({ ok: false, reason: 'No preview URL supplied. Run: node scripts/verify-offline-deployment.mjs https://<vercel-preview-host>', localVersion, precacheAssetCount: precacheAssets.length }, null, 2));
  process.exit(0);
}

const origin = baseUrl.startsWith('http') ? baseUrl.replace(/\/$/, '') : `https://${baseUrl}`;

function matchesContentType(contentType, expectedType) {
  if (expectedType === 'html') return contentType.includes('text/html');
  if (expectedType === 'javascript') return contentType.includes('javascript') || contentType.includes('ecmascript');
  if (expectedType === 'css') return contentType.includes('text/css');
  if (expectedType === 'manifest') return contentType.includes('manifest') || contentType.includes('json');
  return !contentType.includes('text/html');
}

function expectedTypeFor(pathname) {
  if (pathname.endsWith('.html')) return 'html';
  if (pathname.endsWith('.js')) return 'javascript';
  if (pathname.endsWith('.css')) return 'css';
  if (pathname.endsWith('.webmanifest') || pathname.endsWith('/manifest.json')) return 'manifest';
  return 'asset';
}

async function check(pathname, expectedType = expectedTypeFor(pathname)) {
  const response = await fetch(`${origin}${pathname}`, { redirect: 'manual', cache: 'no-store' });
  const text = pathname === '/sw.js' ? await response.text() : '';
  const contentType = response.headers.get('content-type') || '';
  return {
    pathname,
    status: response.status,
    redirected: response.status >= 300 && response.status < 400,
    contentType,
    version: pathname === '/sw.js' ? text.match(/CACHE_VERSION = "([^"]+)"/)?.[1] : undefined,
    ok: response.status === 200 && !response.redirected && matchesContentType(contentType, expectedType),
  };
}

const requiredShell = ['/sw.js', '/offline.html', '/offline/offline-shell.js', '/offline/offline-shell.css'];
const requiredResults = [];
for (const pathname of requiredShell) requiredResults.push(await check(pathname));

const precacheResults = [];
for (const pathname of precacheAssets) precacheResults.push(await check(pathname));

const deployedVersion = requiredResults.find((result) => result.pathname === '/sw.js')?.version;
const ok = requiredResults.every((result) => result.ok) && precacheResults.every((result) => result.ok) && deployedVersion === localVersion;
console.log(JSON.stringify({ ok, localVersion, deployedVersion, origin, requiredResults, precacheAssetCount: precacheAssets.length, precacheFailures: precacheResults.filter((result) => !result.ok) }, null, 2));
process.exit(ok ? 0 : 1);
