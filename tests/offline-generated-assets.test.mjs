import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('generated static shell and service worker match committed assets when build output exists', () => {
  const icon = spawnSync(process.execPath, ['scripts/generate-apple-touch-icon.mjs'], { encoding: 'utf8' });
  assert.equal(icon.status, 0, icon.stderr || icon.stdout);

  const build = spawnSync(process.execPath, ['scripts/build-offline-shell.mjs'], { encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr || build.stdout);

  if (fs.existsSync('.next/static')) {
    const sw = spawnSync(process.execPath, ['scripts/generate-offline-sw.mjs'], { encoding: 'utf8' });
    assert.equal(sw.status, 0, sw.stderr || sw.stdout);
  }

  const diffTargets = fs.existsSync('.next/static') ? ['public/offline', 'public/sw.js'] : ['public/offline'];
  const diff = spawnSync('git', ['diff', '--exit-code', '--', ...diffTargets], { encoding: 'utf8' });
  assert.equal(diff.status, 0, diff.stdout || diff.stderr);

  const worker = fs.readFileSync('public/sw.js', 'utf8');
  assert.match(worker, /const CACHE_VERSION = "cred-offline-/);
  assert.match(worker, /const PRECACHE_ASSETS = \[/);
  assert.match(worker, /"\/apple-touch-icon\.png"/);

  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.match(packageJson.scripts.prebuild, /generate-apple-touch-icon\.mjs .*write-offline-document\.mjs .*build-offline-shell\.mjs/);
  assert.match(packageJson.scripts.postbuild, /generate-offline-sw\.mjs .*verify-offline-build-output\.mjs/);
});
