import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const sessionsPage = readFileSync("app/dashboard/sessions/page.tsx", "utf8");
const sessionCard = readFileSync("src/features/sessions/components/SessionCard.tsx", "utf8");
const deleteSessionButton = readFileSync("src/features/sessions/components/DeleteSessionButton.tsx", "utf8");
const sessionActions = readFileSync("src/features/sessions/actions.ts", "utf8");

test("sessions page restores management actions on cards without replacing operational actions", () => {
  const cardUsage = sessionsPage.match(/<SessionCard[\s\S]*?timeZone=\{profile\.timezone\}[\s\S]*?\/>/);
  assert.ok(cardUsage, "sessions page renders SessionCard with timezone");
  const source = cardUsage[0];

  assert.match(source, /showOperationalAction/);
  assert.match(source, /showArchiveAction/);
  assert.match(source, /showManagementActions/);
});

test("active and completed cards can render archive and delete management actions", () => {
  assert.match(sessionCard, /function canArchiveFromCard\(session: DocumentationSession\) \{\s*return !session\.archived_at\s*\}/);
  assert.match(sessionCard, /const renderArchiveAction = showArchiveAction && \(isArchived \|\| canArchiveFromCard\(session\)\)/);
  assert.match(sessionCard, /isArchived \? 'Restore' : 'Archive'/);
  assert.match(sessionCard, /Delete/);
});

test("archived cards can render restore and delete management actions", () => {
  assert.match(sessionCard, /const isArchived = Boolean\(session\.archived_at\)/);
  assert.match(sessionCard, /form action=\{isArchived \? restoreAction : archiveAction\}/);
  assert.match(sessionCard, /isArchived \? 'Restore' : 'Archive'/);
  assert.match(sessionCard, /<DeleteSessionButton sessionId=\{session\.id\}/);
});

test("delete action uses an accessible confirmation dialog with pending and error states", () => {
  assert.match(sessionCard, /<DeleteSessionButton sessionId=\{session\.id\} sessionTitle=\{primaryTitle\} \/>/);
  assert.match(deleteSessionButton, /role="dialog"/);
  assert.match(deleteSessionButton, /aria-modal="true"/);
  assert.match(deleteSessionButton, /createPortal\(/);
  assert.match(deleteSessionButton, /Deleting…/);
  assert.match(deleteSessionButton, /role="alert"/);
  assert.match(deleteSessionButton, /deleteDocumentationSession\(sessionId\)/);
  assert.match(deleteSessionButton, /closest\('\.session-card'\)/);
  assert.match(deleteSessionButton, /sessionCard\.style\.display = 'none'/);
  assert.match(deleteSessionButton, /sessionCard\.style\.display = ''/);
  assert.match(deleteSessionButton, /Check your connection and try again/);
});

test("delete action authorizes with the user before performing the scoped mutation", () => {
  const deleteAction = sessionActions.match(/export async function deleteDocumentationSession[\s\S]*?export async function restoreDocumentationSession/);
  assert.ok(deleteAction, "delete action is present");
  const source = deleteAction[0];

  assert.match(source, /authorizedSession/);
  assert.match(source, /createAdminClient\(\)/);
  assert.match(source, /\.eq\('organization_id', profile\.organization_id\)/);
  assert.match(source, /\.is\('deleted_at', null\)/);
  assert.match(source, /\.select\('id'\)/);
  assert.match(source, /\.maybeSingle\(\)/);
  assert.match(source, /if \(!deletedSession\)/);
  assert.match(source, /return \{ ok: true \}/);
});

test("archived filter tab is present and filter links preserve search terms", () => {
  assert.match(sessionsPage, /\['active', 'Active'\]/);
  assert.match(sessionsPage, /\['completed', 'Completed'\]/);
  assert.match(sessionsPage, /\['archived', 'Archived'\]/);
  assert.match(sessionsPage, /filter=\$\{value\}\$\{searchTerm \? `&q=\$\{encodeURIComponent\(searchTerm\)\}` : ''\}/);
});

test("management forms remain outside the main card link", () => {
  const linkCloseIndex = sessionCard.indexOf("</Link>");
  const managementIndex = sessionCard.indexOf("{showManagementActions ? (");
  const firstManagementFormIndex = sessionCard.indexOf("<form action={isArchived ? restoreAction : archiveAction}");
  const deleteControlIndex = sessionCard.indexOf("<DeleteSessionButton");

  assert.ok(linkCloseIndex > -1, "card link closes");
  assert.ok(managementIndex > linkCloseIndex, "management disclosure renders after the link closes");
  assert.ok(firstManagementFormIndex > linkCloseIndex, "management forms render outside the link");
  assert.ok(deleteControlIndex > linkCloseIndex, "delete control renders outside the link");
});
