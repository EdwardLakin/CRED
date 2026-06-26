import fs from 'node:fs/promises';

const baseUrl = process.argv[2] || process.env.VERCEL_PREVIEW_URL || process.env.OFFLINE_VERIFY_BASE_URL;
const localWorker = await fs.readFile('public/sw.js', 'utf8');
const localVersion = localWorker.match(/CACHE_VERSION = "([^"]+)"/)?.[1];

if (!baseUrl) {
  console.log(JSON.stringify({ ok: false, reason: 'No preview URL supplied. Run: node scripts/verify-offline-deployment.mjs https://<vercel-preview-host>' , localVersion }, null, 2));
  process.exit(0);
}

const origin = baseUrl.startsWith('http') ? baseUrl.replace(/\/$/, '') : `https://${baseUrl}`;
async function check(pathname, expectedType) {
  const response = await fetch(`${origin}${pathname}`, { redirect: 'manual' });
  const text = await response.text();
  return { pathname, status: response.status, redirected: response.status >= 300 && response.status < 400, contentType: response.headers.get('content-type') || '', version: pathname === '/sw.js' ? text.match(/CACHE_VERSION = "([^"]+)"/)?.[1] : undefined, ok: response.status === 200 && !String(response.headers.get('content-type') || '').includes('text/html') === !expectedType?.includes('html') };
}
const results = [];
for (const [pathname, type] of [['/sw.js', 'javascript'], ['/offline.html', 'html'], ['/offline/offline-shell.js', 'javascript'], ['/offline/offline-shell.css', 'css']]) {
  results.push(await check(pathname, type));
}
console.log(JSON.stringify({ ok: results.every((result) => result.status === 200 && !result.redirected) && results.find((result) => result.pathname === '/sw.js')?.version === localVersion, localVersion, origin, results }, null, 2));
