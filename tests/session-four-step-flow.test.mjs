import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const capturePage = readFileSync(
  "app/dashboard/sessions/[id]/capture/page.tsx",
  "utf8",
);
const flowNav = readFileSync(
  "src/features/sessions/components/SessionFlowNav.tsx",
  "utf8",
);
const layout = readFileSync(
  "app/dashboard/sessions/[id]/layout.tsx",
  "utf8",
);
const reportActions = readFileSync(
  "src/features/reports/actions.ts",
  "utf8",
);
const reportPage = readFileSync(
  "app/dashboard/sessions/[id]/report/page.tsx",
  "utf8",
);
const reviewComponents = readFileSync(
  "src/features/reports/review/ReviewComponents.tsx",
  "utf8",
);
const sessionPage = readFileSync(
  "app/dashboard/sessions/[id]/page.tsx",
  "utf8",
);
const sessionStatus = readFileSync("src/features/sessions/status.ts", "utf8");
const dashboardPage = readFileSync("app/dashboard/page.tsx", "utf8");
const sessionsPage = readFileSync("app/dashboard/sessions/page.tsx", "utf8");

test("session shell exposes exactly four plain-language workflow steps", () => {
  const configuredSteps = [
    ...flowNav.matchAll(
      /\{ key: "([a-z]+)", label: "([A-Za-z]+)", route: "([a-z]+)" \}/g,
    ),
  ].map((match) => ({ key: match[1], label: match[2], route: match[3] }));

  assert.deepEqual(configuredSteps, [
    { key: "capture", label: "Capture", route: "capture" },
    { key: "review", label: "Review", route: "report" },
    { key: "approve", label: "Approve", route: "approve" },
    { key: "export", label: "Export", route: "export" },
  ]);
  assert.match(layout, /<SessionFlowNav/);
  assert.doesNotMatch(layout, /EvidenceWorkspaceNav/);
  assert.match(dashboardPage, /<span>Capture<\/span><span>Review<\/span><span>Approve<\/span><span>Export<\/span>/);
  assert.match(sessionsPage, /capture, review, approve, export/);
  assert.doesNotMatch(dashboardPage, /<span>Capture<\/span><span>Review<\/span><span>Export<\/span>/);
});

test("session root resumes the next incomplete step without a feature hub", () => {
  assert.match(sessionPage, /review_status === "ready_for_delivery"/);
  assert.match(sessionPage, /redirect\(`\/dashboard\/sessions\/\$\{session\.id\}\/report`\)/);
  assert.match(sessionPage, /status === "review"/);
  assert.match(sessionPage, /redirect\(`\/dashboard\/sessions\/\$\{session\.id\}\/report`\)/);
  assert.match(sessionPage, /redirect\(`\/dashboard\/sessions\/\$\{session\.id\}\/capture`\)/);
  assert.doesNotMatch(sessionPage, /What do you want to do|EvidenceWorkspaceNav|getVisibleWorkspaceFeatures/);
  assert.match(dashboardPage, /title: 'View Report'/);
  assert.match(dashboardPage, /href: `\/dashboard\/sessions\/\$\{session\.id\}\/report`/);
  assert.match(sessionStatus, /label: 'View report'/);
  assert.doesNotMatch(sessionStatus, /workflowState === 'ready'[\s\S]*?label: 'Export report'/);
});

test("capture completion runs the canonical prepare action and continues to Review", () => {
  assert.match(capturePage, /completeCaptureAndPrepareReport\.bind/);
  assert.match(capturePage, /<form action=\{completeCaptureAction\}/);
  assert.match(capturePage, />\s*Review items\s*</);
  assert.match(capturePage, /captureDonePath\s*=\s*`\/dashboard\/sessions\/\$\{session\.id\}\/report`/);
  assert.doesNotMatch(capturePage, /stickyDoneHref=/);
  assert.match(reportActions, /from\('documentation_items'\)/);
  assert.match(reportActions, /eq\('item_kind', 'observation'\)/);
  assert.match(reportActions, /count: 'exact', head: true/);
  assert.match(reportActions, /capture\?error=no_items/);
  assert.doesNotMatch(reportActions, /activeReport \|\| !true/);
});

test("review, approval, and export have distinct routes and one forward action", () => {
  const approvePage = readFileSync(
    "app/dashboard/sessions/[id]/approve/page.tsx",
    "utf8",
  );
  const exportPage = readFileSync(
    "app/dashboard/sessions/[id]/export/page.tsx",
    "utf8",
  );

  assert.match(approvePage, /flow_step: "approve"/);
  assert.match(exportPage, /flow_step: "export"/);
  assert.match(reportPage, /Continue to approval/);
  assert.match(reportPage, /Continue to export/);
  assert.match(reportPage, /flowStep === "approve"[\s\S]*<InlineReviewPanel/);
  assert.match(reportPage, /flowStep !== "export"/);
  assert.match(reportPage, /<ExportPanel/);
  assert.match(reportPage, /href=\{`\/dashboard\/sessions\/\$\{session\.id\}\/report\?edit=1`\}/);
  assert.match(reportPage, /href=\{`\/dashboard\/sessions\/\$\{session\.id\}\/export`\}/);
  assert.match(reportPage, /This report is approved\. Saving a change will return it to approval/);
  assert.match(reportPage, /isReadyForExport && flowStep === "review" && !isEditingReport/);
  assert.doesNotMatch(reportPage, /status\.edit && !isReadyForExport/);
  assert.doesNotMatch(reportPage, /Open Report Studio/);
  assert.match(reportActions, /getSessionStepRedirectPath\(session\.id, 'export', \{ reviewed: 1 \}\)/);
  assert.match(reportActions, /session\.status === 'finalized'/);
  assert.doesNotMatch(reportPage, /EvidenceWorkspaceBacklinks/);
  assert.match(reviewComponents, /defaultValue=\{getSectionDisplayTitle\(section\)\}/);
});

test("saving an approved report invalidates approval before delivery", () => {
  assert.match(reportActions, /async function invalidateReportApproval/);
  assert.match(reportActions, /review_status: 'draft'/);
  assert.match(reportActions, /reviewed_at: null/);
  assert.match(reportActions, /reviewed_by: null/);
  assert.match(reportActions, /status: 'needs_review'/);
  assert.match(reportActions, /approved_at: null/);
  assert.match(reportActions, /approved_by: null/);
  assert.doesNotMatch(reportActions, /Approved reports are read-only\./);
});
