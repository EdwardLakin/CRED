import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import ts from "typescript";

const routeSource = readFileSync(
  "app/api/dashboard/sessions/[id]/report-pdf/route.ts",
  "utf8",
);
const rendererSource = readFileSync(
  "src/features/reports/export/executive-pdf.ts",
  "utf8",
);
const mediaRouteSource = readFileSync(
  "app/api/dashboard/sessions/[id]/evidence/[captureId]/media/route.ts",
  "utf8",
);
const signatureMediaRouteSource = readFileSync(
  "app/api/dashboard/sessions/[id]/signatures/[signatureId]/media/route.ts",
  "utf8",
);
const sharedReportPageSource = readFileSync(
  "app/reports/share/[token]/page.tsx",
  "utf8",
);
const reportActionsSource = readFileSync(
  "src/features/reports/actions.ts",
  "utf8",
);

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

async function loadReportModules() {
  const cacheRoot = join(process.cwd(), "node_modules", ".cache");
  mkdirSync(cacheRoot, { recursive: true });
  const directory = mkdtempSync(join(cacheRoot, "cred-executive-report-"));
  const customerTextPath = join(directory, "customer-facing-text.mjs");
  const snapshotPath = join(directory, "final-report-snapshot.mjs");
  const rendererPath = join(directory, "executive-pdf.mjs");

  writeFileSync(
    customerTextPath,
    transpile(
      readFileSync("src/features/reports/customer-facing-text.ts", "utf8"),
    ),
  );
  writeFileSync(
    snapshotPath,
    transpile(
      readFileSync("src/features/reports/final-report-snapshot.ts", "utf8")
        .replace(
          '"@/features/reports/customer-facing-text"',
          '"./customer-facing-text.mjs"',
        ),
    ),
  );
  writeFileSync(
    rendererPath,
    transpile(
      readFileSync("src/features/reports/export/executive-pdf.ts", "utf8"),
    ),
  );

  return {
    directory,
    snapshot: await import(snapshotPath),
    renderer: await import(rendererPath),
  };
}

function buildFixture(buildFinalReportSnapshot) {
  return buildFinalReportSnapshot({
    sessionId: "session-123",
    reportId: "CRED-1042",
    organizationName: "Northwind Field Services",
    reportTitle: "Evidence Report",
    reportType: "General Evidence Report",
    reportDate: "August 27, 2026",
    summary:
      "The reviewed session documents the customer-reported condition and technician-authored observations. /api/dashboard/sessions/session-123/internal",
    status: "needs_review",
    media: [
      {
        id: "photo-1",
        kind: "photo",
        label: "image.jpg",
        capturedAt: "2026-08-27T12:00:00.000Z",
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `photo-${index + 2}`,
        kind: "photo",
        label: `supporting-photo-${index + 2}.jpg`,
        capturedAt: `2026-08-27T12:0${index + 1}:30.000Z`,
      })),
      {
        id: "form-1",
        kind: "document",
        label: "Evidence Photo",
        capturedAt: "2026-08-27T12:01:00.000Z",
      },
    ],
    items: [
      {
        id: "item-1",
        title: "image.jpg",
        description: "Technician noted surface wear at the documented location",
        category: "needs_review",
        details: [],
        recommendations: ["Retain for customer review"],
        mediaIds: Array.from({ length: 7 }, (_, index) => `photo-${index + 1}`),
      },
    ],
    documents: [
      {
        id: "document-1",
        title: "Service intake form",
        summary: "Customer-provided intake details",
        details: [{ label: "Form status", value: "needs_review" }],
        mediaId: "form-1",
      },
    ],
  });
}

test("final report snapshot removes internal labels, URLs, and filenames", async () => {
  const modules = await loadReportModules();
  try {
    const snapshot = buildFixture(modules.snapshot.buildFinalReportSnapshot);
    const serialized = JSON.stringify(snapshot);

    assert.equal(snapshot.reportTitle, "Documentation report");
    assert.equal(snapshot.reportType, "General documentation report");
    assert.equal(snapshot.approval.status, "In review");
    assert.equal(snapshot.items[0].title, "Documented item 01");
    assert.equal(snapshot.documents.length, 1);
    assert.equal(snapshot.totals.items, 1);
    assert.equal(snapshot.totals.photos, 7);
    assert.equal(snapshot.totals.documents, 1);
    assert.doesNotMatch(serialized, /needs_review|image\.jpg|\/api\/dashboard\/sessions/i);
    assert.doesNotMatch(serialized, /\bevidence (?:report|photo|video|appendix|id)\b/i);
  } finally {
    rmSync(modules.directory, { recursive: true, force: true });
  }
});

test("executive renderer emits a valid PDF binary with separated forms", async () => {
  const modules = await loadReportModules();
  try {
    const snapshot = buildFixture(modules.snapshot.buildFinalReportSnapshot);
    const renderInput = {
      snapshot,
      branding: {
        tagline: "Document clearly. Decide confidently.",
        colors: {
          primary: "#2457C5",
          accent: "#172033",
          border: "#D9E0EA",
          mutedBackground: "#F4F6F9",
        },
      },
    };
    const pdf = await modules.renderer.renderExecutiveReportPdf(renderInput);
    const repeatedPdf =
      await modules.renderer.renderExecutiveReportPdf(renderInput);

    if (process.env.CRED_PDF_SAMPLE_PATH) {
      mkdirSync(dirname(process.env.CRED_PDF_SAMPLE_PATH), { recursive: true });
      writeFileSync(process.env.CRED_PDF_SAMPLE_PATH, pdf);
    }

    assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.ok(pdf.byteLength > 1_000);
    assert.ok(pdf.byteLength < 1_000_000);
    assert.deepEqual(pdf, repeatedPdf);
  } finally {
    rmSync(modules.directory, { recursive: true, force: true });
  }
});

test("report route reserves HTML for preview and sends production PDF headers", () => {
  assert.match(routeSource, /const previewOnly = requestUrl\.searchParams\.get\("preview"\) === "1"/);
  assert.match(routeSource, /new Response\(new Uint8Array\(pdf\)/);
  assert.match(routeSource, /"Content-Type": "application\/pdf"/);
  assert.match(routeSource, /"Content-Disposition": `\$\{params\.disposition\}; filename="\$\{filename\}"`/);
  assert.match(routeSource, /"Content-Length": String\(pdf\.byteLength\)/);
  assert.match(routeSource, /"X-Content-Type-Options": "nosniff"/);
});

test("workspace-default resolves the tenant default template", () => {
  const defaultLookupStart = routeSource.indexOf("if (\n    !exportBranding");
  const defaultLookupEnd = routeSource.indexOf(
    "const branding = normalizeBrandProfile",
    defaultLookupStart,
  );
  const defaultLookup = routeSource.slice(defaultLookupStart, defaultLookupEnd);

  assert.ok(defaultLookupStart >= 0 && defaultLookupEnd > defaultLookupStart);
  assert.match(defaultLookup, /requestedTemplateId !== "system"/);
  assert.doesNotMatch(defaultLookup, /requestedTemplateId !== "workspace-default"/);
  assert.match(defaultLookup, /\.eq\("is_default", true\)/);
});

test("photographed forms are classified before image containers", () => {
  const kindStart = routeSource.indexOf("function getEvidenceKind");
  const kindEnd = routeSource.indexOf("function isImageEvidence", kindStart);
  const classifier = routeSource.slice(kindStart, kindEnd);

  assert.ok(kindStart >= 0 && kindEnd > kindStart);
  assert.ok(
    classifier.indexOf("isTrueReferenceDocument(capture)") <
      classifier.indexOf('capture.media_kind === "image"'),
  );
  assert.match(classifier, /if \(isTrueReferenceDocument\(capture\)\) return "document"/);
});

test("executive PDF renders every photo attached to an item", () => {
  assert.doesNotMatch(rendererSource, /mediaIds\.slice\(0,\s*[45]\)/);
  assert.match(rendererSource, /for \(let index = 0; index < mediaIds\.length; index \+= 2\)/);
  assert.match(rendererSource, /const remaining = mediaIds\.slice\(1\)/);
  assert.match(rendererSource, /for \(let index = 0; index < remaining\.length; index \+= 2\)/);
});

test("report bearer tokens cannot cross into deliverables or excluded captures", () => {
  for (const source of [
    routeSource,
    mediaRouteSource,
    signatureMediaRouteSource,
    sharedReportPageSource,
  ]) {
    assert.match(source, /\.eq\(["']link_kind["'], ["']report["']\)/);
    assert.match(source, /\.is\(["']deliverable_id["'], null\)/);
  }
  assert.match(mediaRouteSource, /shareToken && !capture\.include_in_report/);
});

test("shared report access rejects soft-deleted sessions", () => {
  assert.match(routeSource, /sharedSession\.deleted_at/);
  assert.match(mediaRouteSource, /sharedSession\.deleted_at/);
  assert.match(signatureMediaRouteSource, /sharedSession\.deleted_at/);
  assert.match(sharedReportPageSource, /session\.deleted_at/);
  assert.ok(
    sharedReportPageSource.indexOf("session.deleted_at") <
      sharedReportPageSource.indexOf(".update({ view_count:"),
  );
});

test("shared report access requires an approved delivery state", () => {
  assert.match(
    routeSource,
    /sharedSession\.organization_id !== shareToken\.organization_id \|\|[\s\S]*!reportIsReadyForDelivery\(sharedSession as ReportSession\)/,
  );
  assert.match(
    routeSource,
    /session\.review_status === "ready_for_delivery" \|\|[\s\S]*session\.status === "finalized"/,
  );
  assert.match(
    sharedReportPageSource,
    /session\.review_status !== 'ready_for_delivery' && session\.status !== 'finalized'/,
  );
  assert.ok(
    sharedReportPageSource.indexOf("session.review_status !== 'ready_for_delivery'") <
      sharedReportPageSource.indexOf(".update({ view_count:"),
  );
});

test("email delivery only reuses report-wide share tokens", () => {
  const lookupStart = reportActionsSource.indexOf(
    "async function getOrCreateActiveShareToken",
  );
  const lookupEnd = reportActionsSource.indexOf(
    "const activeToken =",
    lookupStart,
  );
  const lookup = reportActionsSource.slice(lookupStart, lookupEnd);

  assert.ok(lookupStart >= 0 && lookupEnd > lookupStart);
  assert.match(lookup, /\.eq\('link_kind', 'report'\)/);
  assert.match(lookup, /\.is\('deliverable_id', null\)/);
});
