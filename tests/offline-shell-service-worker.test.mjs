import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const generator = fs.readFileSync('scripts/generate-offline-sw.mjs', 'utf8');
const offlineHtml = fs.readFileSync('public/offline.html', 'utf8');

test('offline shell is a standalone static document with local session and capture persistence', () => {
  assert.match(offlineHtml, /CRED offline shell/);
  assert.match(offlineHtml, /indexedDB\.open\(DB,VER\)/);
  assert.match(offlineHtml, /offlineSessions/);
  assert.match(offlineHtml, /queuedCaptures/);
  assert.match(offlineHtml, /URL\.createObjectURL\(r\.blob\)/);
  assert.match(offlineHtml, /reportOrder/);
  assert.match(offlineHtml, /technicianNote/);
});

test('service-worker generation precaches the static offline entry and validates assets', () => {
  assert.match(generator, /"\/offline\.html"/);
  assert.doesNotMatch(generator.match(/const shellAssets = \[([\s\S]*?)\];/)?.[1] ?? '', /"\/offline"/);
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
