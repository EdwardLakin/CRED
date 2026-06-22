import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const dashboardPage = readFileSync("app/dashboard/page.tsx", "utf8");
const sessionCard = readFileSync("src/features/sessions/components/SessionCard.tsx", "utf8");

function getDashboardSessionCardUsage() {
  const cardUsage = dashboardPage.match(/<SessionCard[\s\S]*?timeZone=\{profile\.timezone\}[\s\S]*?\/>/);
  assert.ok(cardUsage, "dashboard page renders SessionCard with timezone");
  return cardUsage[0];
}

test("dashboard SessionCard receives showOperationalAction", () => {
  assert.match(getDashboardSessionCardUsage(), /showOperationalAction/);
});

test("dashboard SessionCard receives showArchiveAction", () => {
  assert.match(getDashboardSessionCardUsage(), /showArchiveAction/);
});

test("dashboard SessionCard receives showManagementActions", () => {
  assert.match(getDashboardSessionCardUsage(), /showManagementActions/);
});

test("main card link remains separate from management forms", () => {
  const linkCloseIndex = sessionCard.indexOf("</Link>");
  const managementIndex = sessionCard.indexOf("{showManagementActions ? (");
  const archiveFormIndex = sessionCard.indexOf("<form action={isArchived ? restoreAction : archiveAction}");
  const deleteFormIndex = sessionCard.indexOf("<form action={deleteAction}");

  assert.ok(linkCloseIndex > -1, "card link closes");
  assert.ok(managementIndex > linkCloseIndex, "management disclosure renders after the link closes");
  assert.ok(archiveFormIndex > linkCloseIndex, "archive/restore form renders outside the link");
  assert.ok(deleteFormIndex > linkCloseIndex, "delete form renders outside the link");
});

test("dashboard still excludes archived and deleted sessions", () => {
  assert.match(dashboardPage, /\.is\('deleted_at', null\)/);
  assert.match(dashboardPage, /\.is\('archived_at', null\)/);
});

test("dashboard recent-session limit remains 6", () => {
  assert.match(dashboardPage, /\.limit\(6\)/);
});

test("operational action remains visible alongside management controls", () => {
  const source = getDashboardSessionCardUsage();
  assert.match(source, /showOperationalAction[\s\S]*showArchiveAction[\s\S]*showManagementActions/);
  assert.match(sessionCard, /const action = showOperationalAction \? getSessionOperationalAction\(session\) : null/);
  assert.match(sessionCard, /\{showOperationalAction \? \([\s\S]*session-card-action[\s\S]*\) : null\}/);
  assert.match(sessionCard, /\{showManagementActions \? \([\s\S]*<details className="session-card-manage">/);
});
