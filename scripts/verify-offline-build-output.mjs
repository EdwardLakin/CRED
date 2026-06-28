import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const checks = [
  { path: 'public/offline.html', contains: '<script type="module" src="/offline/offline-shell.js"></script>' },
  { path: 'public/offline/offline-shell.js', contains: 'Test offline reload' },
  { path: 'public/sw.js', contains: 'OFFLINE_DOCUMENT = "/offline.html"' },
  { path: '.next/server/app/offline.html.body', contains: '<title>CRED Offline</title>' },
  { path: '.next/server/app/offline.html/route.js' },
  { path: '.next/server/app/manifest.webmanifest/route.js' },
];

const missing = [];
for (const check of checks) {
  const absolute = path.join(root, check.path);
  let text = '';
  try {
    text = await fs.readFile(absolute, 'utf8');
  } catch {
    missing.push(`${check.path} is missing`);
    continue;
  }
  if (check.contains && !text.includes(check.contains)) missing.push(`${check.path} does not include ${check.contains}`);
}

const prerenderManifest = JSON.parse(await fs.readFile(path.join(root, '.next/prerender-manifest.json'), 'utf8').catch(() => '{}'));
const routes = Object.keys(prerenderManifest.routes || {});
if (!routes.includes('/offline.html')) missing.push('.next/prerender-manifest.json does not list /offline.html as a static route');

if (missing.length) {
  console.error(JSON.stringify({ ok: false, missing }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, checked: checks.map((check) => check.path), staticRoutes: routes.filter((route) => route.includes('offline')) }, null, 2));
