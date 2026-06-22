import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { getOrderedObservationGroupCaptures } from '../src/features/reports/export-grouping';

test('orders included captures with the same observation group for export rendering', () => {
  const primary = {
    id: 'primary-capture',
    observation_group_id: null,
    group_order: 1,
    captured_at: '2026-06-22T10:00:00.000Z',
  };
  const supporting = {
    id: 'supporting-capture',
    observation_group_id: 'primary-capture',
    group_order: 2,
    captured_at: '2026-06-22T10:01:00.000Z',
  };

  const group = getOrderedObservationGroupCaptures(primary, [supporting, primary]);

  assert.deepEqual(
    group.map((capture) => capture.id),
    ['primary-capture', 'supporting-capture'],
  );
});


test('supporting image export styles keep grouped report images compact', () => {
  const routeSource = readFileSync(
    'app/api/dashboard/sessions/[id]/report-pdf/route.ts',
    'utf8',
  );

  assert.match(routeSource, /\.supporting-image-strip\{[^}]*break-inside:avoid[^}]*page-break-inside:avoid/);
  assert.match(routeSource, /\.supporting-export-grid\{[^}]*display:grid[^}]*grid-template-columns:repeat\(auto-fit,minmax\(120px,1fr\)\)/);
  assert.match(routeSource, /\.supporting-export-grid img\{[^}]*height:140px[^}]*object-fit:contain[^}]*width:100%/);
  assert.match(routeSource, /Supporting Images:<\/strong> \$\{supportingImageAssets.length\}/);
  assert.doesNotMatch(routeSource, /Supporting Images:<\/strong> \$\{groupImageAssets.length\}/);
});
