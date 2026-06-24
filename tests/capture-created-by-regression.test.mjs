import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const correctiveMigrationPath = 'supabase/migrations/20260624124000_fix_capture_created_by_trigger_regression.sql'
const correctiveMigration = readFileSync(correctiveMigrationPath, 'utf8')
const intakeMigration = readFileSync('supabase/migrations/20260609190000_session_capture_intake.sql', 'utf8')
const queueMigration = readFileSync('supabase/migrations/20260615190000_capture_processing_queue.sql', 'utf8')
const captureActions = readFileSync('src/features/capture/actions.ts', 'utf8')
const reportActions = readFileSync('src/features/reports/actions.ts', 'utf8')
const inclusion = readFileSync('src/features/reports/capture-inclusion.ts', 'utf8')
const printableReportRoute = readFileSync('app/api/dashboard/sessions/[id]/report-pdf/route.ts', 'utf8')

const functionBody = correctiveMigration.match(/create or replace function public\.prevent_capture_item_scope_retarget\(\)[\s\S]*?\$\$;/i)?.[0] ?? ''

test('capture_items schema has no created_by column and corrective trigger function does not reference it', () => {
  const createCaptureItems = intakeMigration.match(/create table if not exists public\.capture_items \([\s\S]*?\n\);/i)?.[0] ?? ''
  const captureItemsAlterColumns = [...intakeMigration.matchAll(/alter table public\.capture_items[\s\S]*?;/gi)].map((m) => m[0]).join('\n')

  assert.doesNotMatch(createCaptureItems, /\bcreated_by\b/i)
  assert.doesNotMatch(captureItemsAlterColumns, /\bcreated_by\b/i)
  assert.doesNotMatch(functionBody, /\bnew\.created_by\b|\bold\.created_by\b/i)
  assert.match(functionBody, /new\.organization_id is distinct from old\.organization_id/)
  assert.match(functionBody, /new\.documentation_session_id is distinct from old\.documentation_session_id/)
})

test('capture upload metadata creation and direct storage path support remain present', () => {
  assert.match(captureActions, /export async function createCaptureRecordFromUploadedFile/)
  assert.match(captureActions, /\.from\('capture_items'\)[\s\S]*\.insert\(\{[\s\S]*documentation_session_id: session\.id[\s\S]*organization_id: profile\.organization_id[\s\S]*storage_path: storagePath/s)
  assert.match(captureActions, /include_in_report: input\.includeInReport \?\? true/)
})

test('capture classification and processing state update paths remain present', () => {
  assert.match(captureActions, /async function updateCaptureClassification/)
  assert.match(captureActions, /step: 'capture_classification_update'/)
  assert.match(captureActions, /\.from\('capture_items'\)[\s\S]*ai_status: status[\s\S]*capture_ai_analysis:/s)
  assert.match(captureActions, /async function updateCaptureProcessingState/)
  assert.match(captureActions, /step: 'capture_processing_state_update'/)
  assert.match(captureActions, /extracted_data: mergeProcessingState\(capture\.extracted_data, processing\)/)
})

test('background capture processing and queue tables remain present', () => {
  assert.match(queueMigration, /create table if not exists public\.capture_processing_jobs/)
  assert.match(queueMigration, /capture_item_id uuid references public\.capture_items\(id\) on delete cascade/)
  assert.match(captureActions, /export async function processPendingCapturesForSession/)
  assert.match(captureActions, /step: 'background_capture_processing'/)
})

test('capture review/status mutation persists include and review fields', () => {
  assert.match(captureActions, /export async function updateCaptureReview/)
  assert.match(captureActions, /include_in_report: includeInReport/)
  assert.match(captureActions, /capture_ai_analysis: updatedAnalysis/)
  assert.match(captureActions, /\.from\('capture_items'\)[\s\S]*\.update\(\{[\s\S]*technician_note: note/s)
})

test('technician captures are included by default and report export renders included capture images', () => {
  assert.match(inclusion, /if \(capture\.include_in_report === false\) return false/)
  assert.match(inclusion, /return true/)
  assert.match(reportActions, /\.from\('capture_items'\)[\s\S]*include_in_report/s)
  assert.match(printableReportRoute, /includedCaptures|captureItems|include_in_report/s)
  assert.match(printableReportRoute, /<img[\s\S]*capture/s)
})

test('capture RLS remains scoped and no anonymous capture write grant is introduced', () => {
  assert.match(intakeMigration, /alter table public\.capture_items enable row level security/)
  assert.match(correctiveMigration, /Tenant isolation stays[\s\S]*UPDATE RLS policy/i)
  assert.doesNotMatch(correctiveMigration, /grant\s+(insert|update|delete)[\s\S]*to\s+anon/i)
  assert.doesNotMatch(correctiveMigration, /using \(true\)/i)
})

test('corrective migration includes post-apply validation SQL for broken references, columns, policies, and anon grants', () => {
  assert.match(correctiveMigration, /information_schema\.triggers/)
  assert.match(correctiveMigration, /information_schema\.columns/)
  assert.match(correctiveMigration, /pg_policies/)
  assert.match(correctiveMigration, /role_table_grants/)
})
