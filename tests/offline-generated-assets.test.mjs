import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('generated static shell and service worker match committed assets', () => {
  const build = spawnSync(process.execPath, ['scripts/build-offline-shell.mjs'], { encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const sw = spawnSync(process.execPath, ['scripts/generate-offline-sw.mjs'], { encoding: 'utf8' });
  assert.equal(sw.status, 0, sw.stderr || sw.stdout);
  const diff = spawnSync('git', ['diff', '--exit-code', '--', 'public/offline', 'public/sw.js'], { encoding: 'utf8' });
  assert.equal(diff.status, 0, diff.stdout || diff.stderr);
});
