import { expect, test } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

let server: http.Server;
let baseURL = '';
let reachability = { ok: true, status: 'ready', userId: 'user-mobile', organizationId: 'org-mobile' };
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function readStatic(pathname: string) {
  if (pathname.startsWith('/_next/static/')) {
    return fs.readFile(path.join(process.cwd(), '.next', pathname.replace(/^\/_next\//, '')));
  }
  return fs.readFile(path.join(process.cwd(), 'public', pathname.replace(/^\//, '')));
}

function contentType(pathname: string) {
  if (pathname.endsWith('.html')) return 'text/html';
  if (pathname.endsWith('.js')) return 'text/javascript';
  if (pathname.endsWith('.css')) return 'text/css';
  if (pathname.endsWith('.webmanifest')) return 'application/manifest+json';
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

test.beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/manifest.webmanifest') {
      response.writeHead(200, { 'content-type': 'application/manifest+json' });
      response.end(JSON.stringify({ name: 'CRED', short_name: 'CRED', start_url: '/offline.html', scope: '/', display: 'standalone', icons: [] }));
      return;
    }
    if (url.pathname === '/api/offline/reachability') {
      response.writeHead(reachability.ok ? 200 : 401, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(reachability));
      return;
    }
    if (url.pathname === '/api/dashboard/sessions/offline' && request.method === 'POST') {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { clientSessionId?: string };
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ sessionId: `server-${body.clientSessionId}`, recovered: true }));
      });
      return;
    }

    const pathname = url.pathname === '/' || url.pathname === '/dashboard' ? '/offline.html' : url.pathname;
    try {
      const body = await readStatic(pathname);
      response.writeHead(200, { 'content-type': contentType(pathname) });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server port');
  baseURL = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(async ({ context }) => {
  reachability = { ok: true, status: 'ready', userId: 'user-mobile', organizationId: 'org-mobile' };
  await context.setOffline(false);
});

async function provision(page: import('@playwright/test').Page, userId = 'user-mobile', organizationId = 'org-mobile') {
  await page.goto(`${baseURL}/offline.html`);
  await page.evaluate(([user, org]) => {
    localStorage.setItem('cred-offline-user-id', user);
    localStorage.setItem('cred-offline-organization-id', org);
    localStorage.setItem('cred-offline-provisioned-at', new Date().toISOString());
  }, [userId, organizationId]);
  await page.reload();
}

async function registerServiceWorker(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('serviceWorker unsupported');
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    return registration.scope;
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

async function createSessionWithCapture(page: import('@playwright/test').Page, name: string, note: string) {
  await expect(page.locator('#dashboard')).toBeVisible();
  await page.getByRole('button', { name: 'Start New Session' }).click();
  await expect(page.locator('#workspace')).toBeVisible();
  const captures = page.locator('.capture');
  await expect(captures).toHaveCount(0);
  await page.locator('#galleryInput').setInputFiles({ name: `${name}.png`, mimeType: 'image/png', buffer: ONE_PIXEL_PNG });
  await expect(captures).toHaveCount(1);
  await captures.last().getByLabel('Technician notes').fill(note);
  await page.getByRole('button', { name: /Offline dashboard/ }).click();
  await expect(page.locator('#dashboard')).toBeVisible();
  await expect(page.locator('#workspace')).toBeHidden();
}

async function queuedCaptureCount(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('cred-offline');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    return new Promise<number>((resolve, reject) => {
      const tx = db.transaction('queuedCaptures', 'readonly');
      const countRequest = tx.objectStore('queuedCaptures').count();
      countRequest.onerror = () => reject(countRequest.error);
      countRequest.onsuccess = () => resolve(countRequest.result);
    });
  });
}

test('mobile browser tab keeps three offline sessions isolated across reload and handoff', async ({ page, context }) => {
  await provision(page);
  await registerServiceWorker(page);

  await createSessionWithCapture(page, 'session-a', 'notes for session A');
  await createSessionWithCapture(page, 'session-b', 'notes for session B');
  await createSessionWithCapture(page, 'session-c', 'notes for session C');

  await expect(page.locator('.session-card')).toHaveCount(3);
  await expect(page.getByText('3 capture(s)')).toHaveCount(0);

  await context.setOffline(true);
  await page.goto(`${baseURL}/dashboard`);
  await expect(page.getByText('Offline Dashboard')).toBeVisible();
  await expect(page.locator('.session-card')).toHaveCount(3);

  await page.locator('.session-card').nth(0).getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('Technician notes')).toHaveValue(/notes for session [ABC]/);
  await page.getByRole('button', { name: /Offline dashboard/ }).click();

  await context.setOffline(false);
  await page.locator('.session-card').nth(0).getByRole('button', { name: /Prepare online handoff/ }).click();
  await expect(page.getByText(/Prepared for online handoff/)).toBeVisible();
  await expect.poll(() => queuedCaptureCount(page)).toBe(3);
});

test('identity mismatch and expired auth stop handoff without deleting local data', async ({ page }) => {
  await provision(page);
  await createSessionWithCapture(page, 'session-a', 'preserved notes');

  reachability = { ok: true, status: 'ready', userId: 'wrong-user', organizationId: 'org-mobile' };
  await page.locator('.session-card').first().getByRole('button', { name: /Prepare online handoff/ }).click();
  await expect(page.getByText(/Wrong account or organization/)).toBeVisible();
  await expect.poll(() => queuedCaptureCount(page)).toBe(1);

  reachability = { ok: false, status: 'unauthenticated', userId: 'user-mobile', organizationId: 'org-mobile' };
  await page.locator('.session-card').first().getByRole('button', { name: /Prepare online handoff|Retry online handoff/ }).click();
  await expect(page.getByText(/Sign-in required/)).toBeVisible();
  await expect.poll(() => queuedCaptureCount(page)).toBe(1);
});

test('offline install page self-registers service worker and survives offline reload', async ({ page, context }) => {
  await page.goto(`${baseURL}/offline.html`);
  await page.evaluate(() => {
    localStorage.setItem('cred-offline-user-id', 'user-mobile');
    localStorage.setItem('cred-offline-organization-id', 'org-mobile');
    localStorage.setItem('cred-offline-provisioned-at', new Date().toISOString());
  });
  await page.goto(`${baseURL}/offline.html`, { waitUntil: 'load' });

  await expect.poll(
    () => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration('/'))?.active)),
    { timeout: 10000 },
  ).toBe(true);
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload({ waitUntil: 'load' });
  }
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 10000 }).toBe(true);
  await expect(page.locator('#offlineReady .status')).toHaveText('Offline Ready', { timeout: 10000 });

  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await expect(page.getByText('Offline Dashboard')).toBeVisible();
  await expect(page.locator('#offlineReady .status')).toHaveText('Offline Ready');
});
