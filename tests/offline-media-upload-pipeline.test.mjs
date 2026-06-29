import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const syncEngine = readFileSync('src/features/offline/sync-engine.ts', 'utf8')
const queue = readFileSync('src/features/offline/queue.ts', 'utf8')
const store = readFileSync('src/features/offline/static-shell/store.ts', 'utf8')
const shell = readFileSync('src/features/offline/static-shell/offline-shell.ts', 'utf8')
const workspace = readFileSync('src/features/offline/components/OfflineCaptureWorkspace.tsx', 'utf8')
const verifyRoute = readFileSync('app/api/offline/captures/verify/route.ts', 'utf8')
const captureActions = readFileSync('src/features/capture/actions.ts', 'utf8')

test('iPad/Safari-style File is stored and restored as the Blob with byte metadata and object URL previews', () => {
  assert.match(store, /addCapture\(session: OfflineLocalSession, file: File, order: number\)/)
  assert.match(store, /blob: new Blob\(\[file\]/)
  assert.match(store, /normalizeCaptureForIndexedDb/)
  assert.match(store, /IndexedDB queued capture write failed while preparing Blob data/)
  assert.match(store, /filename: file\.name \|\|/)
  assert.match(store, /mimeType: file\.type \|\| 'application\/octet-stream'/)
  assert.match(store, /size: file\.size/)
  assert.match(store, /localSessionId: session\.localSessionId/)
  assert.match(shell, /URL\.createObjectURL\(capture\.blob\)/)
  assert.match(workspace, /URL\.createObjectURL\(record\.blob\)/)
})

test('sync refuses zero-byte or missing local Blobs before storage upload', () => {
  assert.match(syncEngine, /!current\.blob \|\| localBlobSize === null \|\| localBlobSize <= 0/)
  assert.match(syncEngine, /buildDiagnostics\(current, storagePath, "local_blob_empty"\)/)
  assert.match(syncEngine, /Local blob missing\/empty/)
  assert.match(syncEngine, /throw new Error\(message\)/)
})

test('sync uploads the non-zero Blob or File with content type and verifies the expected size', () => {
  assert.match(syncEngine, /current\.blob instanceof File/)
  assert.match(syncEngine, /new File\(\s*\[current\.blob\]/)
  assert.match(syncEngine, /contentType: current\.metadata\.mimeType/)
  assert.match(syncEngine, /expectedSize: record\.metadata\.size/)
  assert.match(verifyRoute, /serverObjectSize !== null && serverObjectSize !== expectedSize/)
  assert.match(verifyRoute, /serverObjectSize/)
})

test('failed zero-byte storage verification retains local Blob and marks storage_upload_empty', () => {
  assert.match(syncEngine, /message\.toLowerCase\(\)\.includes\("empty in storage"\) \? "storage_upload_empty"/)
  assert.match(syncEngine, /uploadedAt: result\.storageUploaded === false \? null/)
  assert.match(syncEngine, /await removeCapture\(current\.localId\)/)
  assert.ok(syncEngine.indexOf('await removeCapture(current.localId)') > syncEngine.indexOf('status: "synced"'))
})

test('retry reuses retained local Blob and can overwrite the bad zero-byte storage object safely', () => {
  assert.match(syncEngine, /storageObjectAlreadyExists\(uploadError\.message\)/)
  assert.match(syncEngine, /upsert: true/)
  assert.match(syncEngine, /uploadedAt: failureStage === "storage_upload_empty" \? null/)
  assert.match(syncEngine, /const file =\s*current\.blob instanceof File/)
})

test('retargeting localSessionId to serverSessionId does not strip Blob data', () => {
  assert.match(queue, /saveQueuedCapture\(\{\s*\.\.\.record,\s*sessionId: toSessionId,\s*serverSessionId: toSessionId/s)
  assert.doesNotMatch(queue, /blob:\s*(undefined|null|new Blob\(\))/)
  assert.match(store, /putQueuedCapture\(\{ \.\.\.capture, sessionId: serverSessionId, serverSessionId/)
})

test('multiple captures keep independent byte sizes and deterministic storage paths', () => {
  assert.match(store, /const localId = createId\(\)/)
  assert.match(store, /clientMutationId: localId/)
  assert.match(syncEngine, /record\.clientMutationId/)
  assert.match(syncEngine, /sanitizeFilename\(\s*record\.metadata\.filename/)
  assert.match(store, /reportOrder: order/)
})

test('notes and order survive failed media upload diagnostics', () => {
  assert.match(syncEngine, /technicianNote: record\.metadata\.technicianNote/)
  assert.match(syncEngine, /const reportOrder = positiveReportOrder\(record\.metadata\.reportOrder\)/)
  assert.match(syncEngine, /technicianNote:\s*current\.metadata\.technicianNote/)
  assert.match(syncEngine, /reportOrder,/)
})

test('retry Save cannot create duplicate capture records for the same upload', () => {
  assert.match(captureActions, /\.eq\('storage_path', storagePath\)/)
  assert.match(captureActions, /if \(existingCapture\) \{\s*return \{ ok: true/s)
  assert.match(captureActions, /captureErrorResult\?\.code === '23505'/)
})

test('failed upload cards expose requested diagnostics', () => {
  for (const expected of ['Local Blob size', 'Expected size', 'MIME type', 'Filename', 'Storage path', 'Upload attempts', 'Server object size', 'Failure stage']) {
    assert.match(shell + workspace, new RegExp(expected))
  }
})

test('offline reportOrder is one-based for first and multiple captures', () => {
  assert.match(shell, /let order = existing\.length \+ 1/)
  assert.match(store, /reportOrder: order/)
  assert.match(workspace, /const startingOrder = items\.length \+ 1/)
  assert.match(workspace, /reportOrder: startingOrder \+ fileIndex/)
})

test('reordering writes one-based reportOrder values', () => {
  assert.match(shell, /reportOrder: index \+ 1/)
  assert.match(workspace, /reportOrder: index \+ 1/)
})

test('legacy local reportOrder values normalize per session before sync', () => {
  assert.match(store, /export async function normalizeSessionReportOrders/)
  assert.match(queue, /export async function normalizeSessionReportOrders/)
  assert.match(queue, /record\.localSessionId === localSessionId &&\s*record\.userId === identity\.userId &&\s*record\.organizationId === identity\.organizationId/s)
  assert.match(queue, /reportOrder: index \+ 1/)
  assert.match(syncEngine, /normalizeSessionReportOrders\(localSessionId, identity\)/)
  assert.match(shell, /await normalizeSessionReportOrders\(localSessionId, state\.identity\)/)
})

test('sync never sends reportOrder zero to finalize or verification', () => {
  assert.match(queue, /export function positiveReportOrder/)
  assert.match(syncEngine, /const reportOrder = positiveReportOrder\(current\.metadata\.reportOrder\)/)
  assert.match(syncEngine, /reportOrder,/)
  assert.match(syncEngine, /const reportOrder = positiveReportOrder\(record\.metadata\.reportOrder\)/)
  assert.match(syncEngine, /\.\.\.\(reportOrder \? \{ reportOrder \} : \{\}\)/)
  assert.doesNotMatch(syncEngine, /reportOrder:\s*current\.metadata\.reportOrder/)
  assert.doesNotMatch(syncEngine, /reportOrder:\s*record\.metadata\.reportOrder/)
})

test('retry can verify recovered server row after legacy order normalization', () => {
  assert.match(captureActions, /if \(existingCapture\) \{\s*return \{ ok: true/s)
  assert.match(syncEngine, /const pendingBeforeNormalization = await getPendingCaptures\(userId\)/)
  assert.match(syncEngine, /const pending = await getPendingCaptures\(userId\)/)
  assert.match(syncEngine, /await recordVerifiedOfflineCapture\(current\.localSessionId, positiveReportOrder\(current\.metadata\.reportOrder\) \?\? 1\)/)
})

test('verification response includes expected and actual report_order details', () => {
  assert.match(verifyRoute, /mismatchDetails/)
  assert.match(verifyRoute, /\{ mismatch: "report_order", expected: reportOrder, actual: capture\.report_order \}/)
})
