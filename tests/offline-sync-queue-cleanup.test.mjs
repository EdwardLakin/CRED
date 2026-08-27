import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const queue = readFileSync('src/features/offline/queue.ts', 'utf8')
const banner = readFileSync('src/components/offline/OfflineBanner.tsx', 'utf8')
const details = readFileSync('src/components/offline/SyncQueueDetails.tsx', 'utf8')

test('pending sync count ignores completed and recoverable server-backed records', () => {
  assert.match(queue, /isActionableQueuedCapture/)
  assert.match(queue, /record\.status === "synced"\) return false/)
  assert.match(queue, /finalized_unverified" \|\| record\.status === "verifying"\).*serverCaptureId/s)
  assert.match(queue, /normalizedRecords\.filter\(isActionableQueuedCapture\)/)
})

test('offline banner exposes sync queue details and cleanup removes completed queue records', () => {
  assert.match(queue, /cleanupCompletedQueuedCaptures/)
  assert.match(queue, /db\.delete\("queuedCaptures", record\.localId\)/)
  assert.match(banner, /<SyncQueueDetails \/>/)
  assert.match(details, /View sync queue/)
})
