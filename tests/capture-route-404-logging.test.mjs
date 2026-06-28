import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const capturePage = readFileSync('app/dashboard/sessions/[id]/capture/page.tsx', 'utf8');

test('capture route validates IDs and logs structured 404 reasons without exposing tenant identifiers', () => {
  assert.match(capturePage, /UUID_PATTERN/);
  assert.match(capturePage, /reason: "malformed_session_id"/);
  assert.match(capturePage, /capture_route_session_404/);
  assert.match(capturePage, /"session_not_found_or_inaccessible"/);
  assert.match(capturePage, /"session_deleted"/);
  assert.match(capturePage, /"session_outside_current_organization"/);
  assert.match(capturePage, /prefetched/);
  assert.match(capturePage, /next-router-prefetch/);
  assert.match(capturePage, /sec-purpose/);

  const logFunction = capturePage.match(/function logCaptureRoute404[\s\S]*?\n}\n/);
  assert.ok(logFunction, 'structured logging helper should exist');
  assert.doesNotMatch(logFunction[0], /sessionId|organizationId|supabaseMessage/);
});

test('capture route keeps session lookup tenant scoped and uses maybeSingle for expected no-row cases', () => {
  assert.match(capturePage, /\.from\("documentation_sessions"\)[\s\S]*?\.eq\("id", id\)[\s\S]*?\.eq\("organization_id", profile\.organization_id\)[\s\S]*?\.maybeSingle\(\)/);
  assert.match(capturePage, /if \(session\.deleted_at\)/);
  assert.doesNotMatch(capturePage, /\.single\(\)/);
  assert.doesNotMatch(capturePage, /service_role|SERVICE_ROLE|createAdmin|adminClient/);
});
