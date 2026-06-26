import { expect, test } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

let server: http.Server;
let baseURL = '';

test.beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const pathname = url.pathname === '/' ? '/offline.html' : url.pathname;
    const filePath = path.join(process.cwd(), 'public', pathname.replace(/^\//, ''));
    try {
      const body = await fs.readFile(filePath);
      const type = pathname.endsWith('.html') ? 'text/html' : pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream';
      response.writeHead(200, { 'content-type': type });
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

test('mobile browser tab keeps multiple offline sessions isolated across reload', async ({ page, context }) => {
  await page.goto(`${baseURL}/offline.html`);
  await page.evaluate(() => {
    localStorage.setItem('cred-offline-user-id', 'user-mobile');
    localStorage.setItem('cred-offline-organization-id', 'org-mobile');
    localStorage.setItem('cred-offline-provisioned-at', new Date().toISOString());
  });
  await page.reload();

  await page.getByRole('button', { name: 'Start New Session' }).click();
  await expect(page.getByRole('heading', { name: /Offline Evidence/ })).toBeVisible();
  await page.locator('#galleryInput').setInputFiles({ name: 'session-a.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('session-a') });
  await page.getByLabel('Technician notes').fill('notes for session A');
  await page.getByRole('button', { name: /Offline dashboard/ }).click();

  await page.getByRole('button', { name: 'Start New Session' }).click();
  await page.locator('#galleryInput').setInputFiles({ name: 'session-b.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('session-b') });
  await page.getByLabel('Technician notes').fill('notes for session B');
  await page.getByRole('button', { name: /Offline dashboard/ }).click();

  await page.reload();
  await expect(page.locator('.session-card')).toHaveCount(2);
  await expect(page.getByText('2 capture(s)')).toHaveCount(0);
  const cards = page.locator('.session-card');
  await cards.nth(0).getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('Technician notes')).toHaveValue(/notes for session [AB]/);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Offline Dashboard')).toBeVisible();
  await expect(page.locator('.session-card')).toHaveCount(2);
  await context.setOffline(false);
});
