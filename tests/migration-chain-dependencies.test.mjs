import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
const migrations = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()

const createdByMigration = new Map()
for (const file of migrations) {
  const sql = readFileSync(join(migrationsDir, file), 'utf8')
  for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi)) {
    if (!createdByMigration.has(match[1])) createdByMigration.set(match[1], file)
  }
  for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_][a-z0-9_]*)\s*\(/gi)) {
    if (!createdByMigration.has(`${match[1]}()`)) createdByMigration.set(`${match[1]}()`, file)
  }
}

const expectedOrder = [
  ['documentation_sessions', '20260609180000_core_schema_foundation.sql', '20260609190000_session_capture_intake.sql'],
  ['is_org_member()', '20260609180000_core_schema_foundation.sql', '20260622150000_evidence_deliverables_foundation.sql'],
  ['touch_updated_at()', '20260612090000_ai_report_drafts.sql', '20260622120000_evidence_engine_schema_foundation.sql'],
]

test('migrations are sorted deterministically by timestamped filename', () => {
  assert.deepEqual(migrations, [...migrations].sort())
  assert.ok(migrations.indexOf('20260609032000_auth_onboarding_foundation.sql') < migrations.indexOf('20260609180000_core_schema_foundation.sql'))
})


test('migration versions are unique and filenames sort deterministically', () => {
  const sortedByFilename = [...migrations].sort((a, b) => a.localeCompare(b, 'en-US'))
  assert.deepEqual(migrations, sortedByFilename)

  const seenVersions = new Map()
  for (const file of migrations) {
    const match = /^(\d{14})_[a-z0-9_]+\.sql$/.exec(file)
    assert.ok(match, `${file} must start with a 14-digit migration version and use a deterministic lowercase SQL filename`)

    const previous = seenVersions.get(match[1])
    assert.equal(previous, undefined, `${file} reuses migration version ${match[1]} from ${previous}`)
    seenVersions.set(match[1], file)
  }
})

test('final notes migration follows capture queue retry status migration', () => {
  assert.ok(
    migrations.indexOf('20260616120000_capture_queue_retry_status.sql') <
      migrations.indexOf('20260616121000_final_notes.sql'),
    'final notes must run after capture queue retry status',
  )
})

test('known foundational objects are created before dependent migrations', () => {
  for (const [objectName, creator, dependent] of expectedOrder) {
    assert.equal(createdByMigration.get(objectName), creator, `${objectName} should be created by ${creator}`)
    assert.ok(migrations.indexOf(creator) < migrations.indexOf(dependent), `${objectName} must be created before ${dependent}`)
  }
})

test('documentation_sessions exists before session_capture_intake references it', () => {
  const sessionCaptureSql = readFileSync(join(migrationsDir, '20260609190000_session_capture_intake.sql'), 'utf8')
  assert.match(sessionCaptureSql, /references\s+public\.documentation_sessions\(id\)/i)
  assert.ok(migrations.indexOf('20260609180000_core_schema_foundation.sql') < migrations.indexOf('20260609190000_session_capture_intake.sql'))
})
