import assert from 'node:assert/strict';
import test from 'node:test';

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
