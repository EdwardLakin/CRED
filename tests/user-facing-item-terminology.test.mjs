import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

const dashboardCopy = [
  read('app/dashboard/page.tsx'),
  read('app/dashboard/sessions/page.tsx'),
  read('src/features/sessions/components/SessionCard.tsx'),
  read('src/features/sessions/display.ts'),
].join('\n')

const advancedCopy = [
  read('src/features/evidence/constants.ts'),
  read('src/features/evidence/components/EvidenceWorkspaceNav.tsx'),
  read('src/features/evidence/components/EvidenceLibraryList.tsx'),
  read('src/features/evidence/components/EvidenceDetail.tsx'),
  read('src/features/evidence/components/AssertionsWorkspace.tsx'),
  read('src/features/evidence/components/EntitiesWorkspace.tsx'),
  read('src/features/evidence/components/TimelineWorkspace.tsx'),
  read('src/features/evidence/relationships/components/RelationshipExplorer.tsx'),
  read('src/features/evidence/relationships/components/RelationshipSummaryCards.tsx'),
  read('src/features/evidence/review/components/ReviewQueueWorkspace.tsx'),
  read('src/features/evidence/suggestions/components/SuggestionsWorkspace.tsx'),
].join('\n')

test('dashboard cards and empty states use Items as the visible capture unit', () => {
  assert.match(dashboardCopy, /<dt>Items<\/dt>/)
  assert.match(dashboardCopy, /start adding items/i)
  assert.match(dashboardCopy, /\$\{evidenceCount\} item/)
  assert.doesNotMatch(dashboardCopy, /<dt>Evidence<\/dt>|capturing evidence|evidence item/i)
})

test('session-card item counts exclude attachments, forms, notes, and deleted items', () => {
  const countSources = [
    read('app/dashboard/page.tsx'),
    read('app/dashboard/sessions/page.tsx'),
    read('app/dashboard/settings/archived-sessions/page.tsx'),
  ]

  for (const source of countSources) {
    assert.match(source, /from\('documentation_items'\)[\s\S]*\.eq\('organization_id', profile\.organization_id\)[\s\S]*\.in\('documentation_session_id', sessionIds\)[\s\S]*\.eq\('item_kind', 'observation'\)[\s\S]*\.is\('deleted_at', null\)/)
    assert.doesNotMatch(source, /from\('capture_items'\)/)
    assert.match(source, /evidenceCount=\{itemCountBySession\.get\(session\.id\) \?\? 0\}/)
  }
})

test('advanced tools use plain user-facing labels', () => {
  for (const label of ['Advanced Review', 'Items', 'Connections', 'Additional Outputs', 'Source Index']) {
    assert.match(advancedCopy, new RegExp(label, 'i'))
  }
  for (const retired of ['Evidence Workspace', 'Evidence Library', 'Relationship Explorer', 'Evidence graph', 'Evidence Relationships', 'Select evidence', 'Link evidence']) {
    assert.doesNotMatch(advancedCopy, new RegExp(retired, 'i'))
  }
})

test('terminology cleanup preserves compatibility keys, routes, and persisted default type', () => {
  const nav = read('src/features/evidence/components/EvidenceWorkspaceNav.tsx')
  const reportTypes = read('src/features/sessions/report-types.ts')
  assert.match(nav, /feature: 'evidence_library'/)
  assert.match(nav, /href: 'evidence'/)
  assert.match(nav, /href: 'evidence\/review'/)
  assert.match(reportTypes, /DEFAULT_REPORT_TYPE = 'General Evidence Report'/)
  assert.match(reportTypes, /value: 'General Evidence Report', label: 'General Documentation Report'/)
})

test('report, diagnostic, branding, and offline surfaces translate legacy evidence labels', () => {
  const customerHtml = read('src/features/report-studio/rendering/html.ts')
  const diagnosticProgress = read('src/features/diagnostic-procedures/progress.ts')
  const branding = read('src/features/branding/types.ts')
  const offlineSessions = read('src/features/offline/offline-sessions.ts')
  const offlineStore = read('src/features/offline/static-shell/store.ts')
  const offlineShell = read('src/features/offline/static-shell/offline-shell.ts')

  assert.match(customerHtml, /CAPTURE_ID_PATTERN, "Item reference"/)
  assert.match(customerHtml, /gi, "Item reference"/)
  assert.match(customerHtml, /UUID_PATTERN, "item"/)
  assert.doesNotMatch(customerHtml, /"Evidence "|"evidence item"/)
  assert.match(diagnosticProgress, /'Needs documentation'/)
  assert.doesNotMatch(diagnosticProgress, /'Needs evidence'/)
  assert.match(branding, /evidenceAccent:'Item accent'/)
  assert.match(branding, /Legal Source Package/)
  assert.match(branding, /Formal source package/)
  assert.doesNotMatch(branding, /Legal Evidence Package|Evidence accent|Formal evidence packet/)
  assert.match(offlineSessions, /`Offline Documentation /)
  assert.match(offlineStore, /sessionType: input\.sessionType \|\| 'General Evidence Report'/)
  assert.match(offlineShell, /getDisplaySessionType/)
  assert.match(offlineShell, /'General Evidence Report' \? 'General Documentation Report'/)
  assert.equal((offlineShell.match(/getDisplaySessionType\(session\.sessionType\)/g) ?? []).length, 2)
})

test('generated customer copy is instructed to use item and source terminology', () => {
  const draftGenerator = read('src/lib/openai/report-draft-generator.ts')
  const finalNotes = read('src/lib/openai/final-notes-generator.ts')
  const observationAssistant = read('src/lib/openai/observation-writing-assistant.ts')
  const reportStructure = read('src/features/reports/report-structure.ts')

  assert.match(draftGenerator, /generic CRED documentation report structure: Report Summary, Items Captured/)
  assert.match(draftGenerator, /Never use the word "evidence" in customer-facing report copy/)
  assert.match(finalNotes, /\$\{evidenceCount\} item\$\{evidenceCount === 1/)
  assert.match(finalNotes, /Never use the word "evidence" in the returned notes/)
  assert.match(observationAssistant, /Classification: Supporting Item/)
  assert.match(observationAssistant, /Never use the word "evidence" in the returned customer-facing text/)
  for (const copy of ['item group prepared for review', 'General Supporting Items', 'grouped together', 'Unmapped item', 'Matched item text']) {
    assert.match(reportStructure, new RegExp(copy))
  }
  for (const retired of ['evidence package prepared for review', 'General Supporting Evidence', 'grouped as related evidence', 'Unmapped evidence', 'Matched evidence text']) {
    assert.doesNotMatch(reportStructure, new RegExp(retired, 'i'))
  }
})

test('advanced item errors and fallback filenames avoid retired customer terminology', () => {
  const importActions = read('src/features/evidence/import/actions.ts')
  const importValidation = read('src/features/evidence/import/validation.ts')
  const workspaceValidation = read('src/features/evidence/validation.ts')

  assert.doesNotMatch(importActions, /Unable to (?:load|update) batch evidence|Selected evidence|Select at least one evidence item/i)
  assert.doesNotMatch(importValidation, /fallback = 'evidence-file'/)
  assert.doesNotMatch(workspaceValidation, /Evidence relationships must stay/i)
  assert.match(importActions, /Unable to load batch items/)
  assert.match(importValidation, /fallback = 'source-file'/)
  assert.match(workspaceValidation, /Item connections must stay within the same session and organization/)
})
