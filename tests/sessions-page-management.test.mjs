import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const sessionsPage = readFileSync("app/dashboard/sessions/page.tsx", "utf8");
const sessionCard = readFileSync("src/features/sessions/components/SessionCard.tsx", "utf8");

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
  assert.match(sessionCard, /form action=\{deleteAction\}/);
});

test("delete action uses confirmation control with soft-delete copy", () => {
  assert.match(sessionCard, /<ConfirmSubmitButton[\s\S]*Delete \$\{primaryTitle\}\?[\s\S]*without deleting capture files/);
  assert.match(sessionCard, /deleteDocumentationSession/);
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

  assert.ok(linkCloseIndex > -1, "card link closes");
  assert.ok(managementIndex > linkCloseIndex, "management disclosure renders after the link closes");
  assert.ok(firstManagementFormIndex > linkCloseIndex, "management forms render outside the link");
});
