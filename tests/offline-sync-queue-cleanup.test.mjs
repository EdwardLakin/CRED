import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const queue = readFileSync('src/features/offline/queue.ts', 'utf8')
const banner = readFileSync('src/components/offline/OfflineBanner.tsx', 'utf8')
const details = readFileSync('src/components/offline/SyncQueueDetails.tsx', 'utf8')
const css = readFileSync('app/globals.css', 'utf8')

test('pending sync count ignores completed and recoverable server-backed records', () => {
  assert.match(queue, /isActionableQueuedCapture/)
  assert.match(queue, /record\.status === "synced"\) return false/)
  assert.match(queue, /finalized_unverified" \|\| record\.status === "verifying"\).*serverCaptureId/s)
  assert.match(queue, /normalizedRecords\.filter\(isActionableQueuedCapture\)/)
})

test('compact sync status exposes queue details without taking page layout space', () => {
  assert.match(queue, /cleanupCompletedQueuedCaptures/)
  assert.match(queue, /db\.delete\("queuedCaptures", record\.localId\)/)
  assert.match(banner, /<SyncQueueDetails \/>/)
  assert.match(banner, /className="offline-status"/)
  assert.match(banner, /<details className="offline-status-control">/)
  assert.match(details, /View sync queue/)
  assert.match(details, /Clear stale uploads/)
  assert.doesNotMatch(details, /<code>\{item\.localId\}<\/code>/)
  assert.match(css, /\.offline-status \{[^}]*position: fixed;/)
  assert.match(css, /\.offline-status-panel \{[^}]*position: absolute;/)
  assert.doesNotMatch(css, /\.offline-status \{[^}]*position: static;/)
})

test('stale queue cleanup only removes current-user captures for missing server sessions', () => {
  assert.match(queue, /getQueuedServerSessionIds/)
  assert.match(queue, /record\.userId === userId && record\.serverSessionId/)
  assert.match(queue, /removeQueuedCapturesForMissingServerSessions/)
  assert.match(queue, /!existingSessionIds\.has\(record\.serverSessionId as string\)/)
  assert.match(queue, /db\.delete\("queuedCaptures", record\.localId\)/)
})
