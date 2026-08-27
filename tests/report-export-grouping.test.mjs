import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

async function loadExportGrouping() {
  const source = readFileSync(
    "src/features/reports/export-grouping.ts",
    "utf8",
  );
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const dir = mkdtempSync(join(tmpdir(), "cred-export-grouping-"));
  const modulePath = join(dir, "export-grouping.mjs");
  writeFileSync(modulePath, transpiled);
  return import(modulePath);
}

test("orders included captures with the same observation group for export rendering", async () => {
  const { getOrderedObservationGroupCaptures } = await loadExportGrouping();
  const primary = {
    id: "primary-capture",
    observation_group_id: null,
    group_order: 1,
    captured_at: "2026-06-22T10:00:00.000Z",
  };
  const supporting = {
    id: "supporting-capture",
    observation_group_id: "primary-capture",
    group_order: 2,
    captured_at: "2026-06-22T10:01:00.000Z",
  };

  const group = getOrderedObservationGroupCaptures(primary, [
    supporting,
    primary,
  ]);

  assert.deepEqual(
    group.map((capture) => capture.id),
    ["primary-capture", "supporting-capture"],
  );
});

test("groups chained observation captures so every included image renders once", async () => {
  const { getOrderedObservationGroupCaptures } = await loadExportGrouping();
  const primary = {
    id: "primary-capture",
    observation_group_id: null,
    group_order: 1,
    captured_at: "2026-06-22T10:00:00.000Z",
  };
  const supportingOne = {
    id: "supporting-capture-one",
    observation_group_id: "primary-capture",
    group_order: 2,
    captured_at: "2026-06-22T10:01:00.000Z",
  };
  const supportingTwo = {
    id: "supporting-capture-two",
    observation_group_id: "supporting-capture-one",
    group_order: 3,
    captured_at: "2026-06-22T10:02:00.000Z",
  };

  const group = getOrderedObservationGroupCaptures(primary, [
    supportingTwo,
    supportingOne,
    primary,
  ]);

  assert.deepEqual(
    group.map((capture) => capture.id),
    ["primary-capture", "supporting-capture-one", "supporting-capture-two"],
  );
});

test("canonical item identity groups rapid and offline attachments in stable order", async () => {
  const {
    getObservationGroupKey,
    getOrderedObservationGroupCaptures,
  } = await loadExportGrouping();
  const laterPhoto = {
    id: "capture-two",
    documentation_item_id: "item-stable",
    attachment_order: 2,
    observation_group_id: null,
    group_order: null,
    captured_at: "2026-08-27T10:01:00.000Z",
  };
  const firstPhoto = {
    id: "capture-one",
    documentation_item_id: "item-stable",
    attachment_order: 1,
    observation_group_id: null,
    group_order: null,
    captured_at: "2026-08-27T10:00:00.000Z",
  };
  const otherItem = {
    id: "capture-three",
    documentation_item_id: "item-other",
    attachment_order: 1,
    observation_group_id: "capture-one",
    group_order: 3,
    captured_at: "2026-08-27T10:02:00.000Z",
  };

  assert.equal(getObservationGroupKey(firstPhoto), "item-stable");
  assert.deepEqual(
    getOrderedObservationGroupCaptures(firstPhoto, [
      laterPhoto,
      otherItem,
      firstPhoto,
    ]).map((capture) => capture.id),
    ["capture-one", "capture-two"],
  );
});

test("export markup supports one primary and two supporting images without duplicating primary", () => {
  const routeSource = readFileSync(
    "app/api/dashboard/sessions/[id]/report-pdf/route.ts",
    "utf8",
  );

  assert.match(routeSource, /const primaryImageAsset = groupImageAssets\.find/);
  assert.match(
    routeSource,
    /const supportingImageAssets = groupImageAssets\.filter\([\s\S]*groupCapture\.id !== primaryImageCapture\.id/,
  );
  assert.match(routeSource, /Additional supporting photos/);
  assert.match(routeSource, /\$\{supportingImageAssets\.length\} photo/);
  assert.doesNotMatch(
    routeSource,
    /Supporting Images:<\/strong> \$\{groupImageAssets\.length\}/,
  );
});

test("supporting panel and export styles keep grouped report images compact and full width", () => {
  const routeSource = readFileSync(
    "app/api/dashboard/sessions/[id]/report-pdf/route.ts",
    "utf8",
  );

  assert.match(routeSource, /class="supporting-evidence-panel"/);
  assert.match(routeSource, /class="supporting-export-item"/);
  assert.match(routeSource, /class="observation-main"/);
  assert.match(
    routeSource,
    /\.supporting-evidence-panel\{[^}]*break-inside:avoid[^}]*page-break-inside:avoid/,
  );
  assert.match(
    routeSource,
    /class="supporting-export-grid" data-count="/,
  );
  assert.match(
    routeSource,
    /\.supporting-export-grid\[data-count="1"\]\{[^}]*display:flex[^}]*justify-content:flex-start/,
  );
  assert.match(
    routeSource,
    /\.supporting-export-grid\[data-count="1"\] \.supporting-export-item\{[^}]*max-width:100%[^}]*width:240px/,
  );
  assert.match(
    routeSource,
    /\.supporting-export-grid img\{[^}]*height:auto[^}]*max-height:220px[^}]*object-fit:contain[^}]*width:100%/,
  );
});

test("export html contains self-contained lightbox hooks and print hiding", () => {
  const routeSource = readFileSync(
    "app/api/dashboard/sessions/[id]/report-pdf/route.ts",
    "utf8",
  );

  assert.match(routeSource, /data-lightbox-group/);
  assert.match(routeSource, /data-lightbox-index/);
  assert.match(routeSource, /data-lightbox-src/);
  assert.match(routeSource, /data-lightbox-alt/);
  assert.match(routeSource, /data-export-lightbox/);
  assert.match(
    routeSource,
    /event\.key ===?==? ?'Escape'|event\.key===\"Escape\"|event\.key==='Escape'/,
  );
  assert.match(routeSource, /data-lightbox-prev/);
  assert.match(routeSource, /data-lightbox-next/);
  assert.match(routeSource, /\.export-lightbox img\{[^}]*object-fit:contain/);
  assert.match(routeSource, /@media print[\s\S]*\.export-lightbox/);
});

test("browser-friendly export includes mobile viewport and responsive report layout", () => {
  const routeSource = readFileSync(
    "app/api/dashboard/sessions/[id]/report-pdf/route.ts",
    "utf8",
  );

  const viewportMatches = routeSource.match(
    /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" \/>/g,
  );

  assert.ok(viewportMatches);
  assert.ok(viewportMatches.length >= 3);
  assert.match(
    routeSource,
    /@media screen and \(max-width:680px\)\{[\s\S]*?\.observation-main\{[^}]*grid-template-columns:1fr/,
  );
  assert.match(
    routeSource,
    /@media screen and \(max-width:680px\)\{[\s\S]*?\.approval-grid\{[^}]*grid-template-columns:1fr/,
  );
  assert.match(
    routeSource,
    /@media screen and \(max-width:680px\)\{[\s\S]*?dl\{[^}]*grid-template-columns:1fr/,
  );
  assert.match(
    routeSource,
    /\^\(not captured\|pending\|unknown\|none\|n\\\/a\|not applicable\)\$/,
  );
  assert.match(routeSource, /Report Overview/);
});

test("mobile observation evidence stays compact while retaining lightbox access", () => {
  const routeSource = readFileSync(
    "app/api/dashboard/sessions/[id]/report-pdf/route.ts",
    "utf8",
  );

  assert.match(routeSource, /Mobile evidence density overrides/);

  assert.match(
    routeSource,
    /@media\s+screen\s+and\s+\(max-width\s*:\s*680px\)[\s\S]*?\.observation-main>\.media\s+img,[\s\S]*?max-height\s*:\s*360px/,
  );

  assert.match(
    routeSource,
    /\.supporting-export-grid\[data-count="1"\]\s+\.supporting-export-item\s*\{[^}]*max-width\s*:\s*220px[^}]*width\s*:\s*min\(\s*220px\s*,\s*100%\s*\)/,
  );

  assert.match(
    routeSource,
    /\.supporting-export-grid\[data-count="1"\]\s+img\s*\{[^}]*max-height\s*:\s*200px[^}]*object-fit\s*:\s*contain/,
  );

  assert.match(
    routeSource,
    /@media\s+screen\s+and\s+\(max-width\s*:\s*420px\)[\s\S]*?max-height\s*:\s*180px/,
  );

  assert.match(routeSource, /data-lightbox-src/);
  assert.match(routeSource, /data-export-lightbox/);
});

test("observations heading stays with the first printed observation and fallback titles remain grammatical", () => {
  const routeSource = readFileSync(
    "app/api/dashboard/sessions/[id]/report-pdf/route.ts",
    "utf8",
  );

  assert.match(
    routeSource,
    /class="documented-observations-lead"[\s\S]*?\$\{firstObservationHtml\}/,
  );

  assert.match(
    routeSource,
    /\.documented-observations-lead\s*\{[^}]*break-inside\s*:\s*avoid[^}]*page-break-inside\s*:\s*avoid/,
  );

  assert.match(
    routeSource,
    /\.documented-observations\s*\{[^}]*break-inside\s*:\s*auto[^}]*page-break-inside\s*:\s*auto/,
  );

  assert.match(
    routeSource,
    /remainingObservationHtml\.join\(""\)/,
  );

  assert.match(
    routeSource,
    /\/report\$\/i\.test\(reportTitle\)/,
  );

  assert.match(
    routeSource,
    /\? reportTitle\s*:\s*`\$\{reportTitle\} report`/,
  );

  assert.doesNotMatch(
    routeSource,
    /`\s*This \$\{params\.reportTitle \? `\$\{params\.reportTitle\} ` : ""\}report documents/,
  );
});

test("printed report uses compact cover, observations, and supporting photos", () => {
  const routeSource = readFileSync(
    "app/api/dashboard/sessions/[id]/report-pdf/route.ts",
    "utf8",
  );

  assert.match(
    routeSource,
    /@media\s+print[\s\S]*?\.report-cover\s+dl,[\s\S]*?grid-template-columns\s*:\s*repeat\(\s*2\s*,\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*\)/,
  );

  assert.match(
    routeSource,
    /@media\s+print[\s\S]*?\.observation-main\s*\{[^}]*grid-template-columns\s*:\s*minmax\(\s*135px\s*,\s*30%\s*\)\s+minmax\(\s*0\s*,\s*1fr\s*\)/,
  );

  assert.match(
    routeSource,
    /@media\s+print[\s\S]*?\.supporting-export-grid\[data-count="1"\]\s+\.supporting-export-item\s*\{[^}]*max-width\s*:\s*160px[^}]*width\s*:\s*160px/,
  );

  assert.match(
    routeSource,
    /@media\s+print[\s\S]*?\.supporting-export-grid\s+img\s*\{[^}]*height\s*:\s*95px[^}]*max-height\s*:\s*95px/,
  );

  assert.match(
    routeSource,
    /getEvidenceKind\(\s*entry\.capture\s*\)\s*===\s*"document"/,
  );
});

test("printable report uses compact cards, safe titles, trusted proof, and print controls", () => {
  const routeSource = readFileSync(
    "app/api/dashboard/sessions/[id]/report-pdf/route.ts",
    "utf8",
  );

  assert.match(routeSource, /function getCustomerFacingEvidenceTitle/);
  assert.match(routeSource, /conciseHeadingFromNote/);
  assert.match(routeSource, /Documented condition \$\{/);
  const titleHelper = routeSource.match(/function getCustomerFacingEvidenceTitle[\s\S]*?^}/m)?.[0] ?? "";
  assert.ok(titleHelper, "missing customer-facing evidence title helper");
  assert.doesNotMatch(titleHelper, /classification|detected_type|image_asset_type/);
  assert.match(routeSource, /function shouldRenderTrustedProofDetail/);
  assert.match(routeSource, /captureHasTrustedStructuredDetails/);
  assert.match(routeSource, /user_provided === true/);
  assert.match(routeSource, /reviewed === true/);
  assert.match(routeSource, /accepted === true/);
  assert.match(
    routeSource,
    /\.observation-main\{[^}]*grid-template-columns:minmax\(190px,38%\) minmax\(0,1fr\)/,
  );
  assert.doesNotMatch(
    routeSource,
    /observation-content[^}]*min-height:\s*[3-9]\d\dpx/,
  );
  assert.match(
    routeSource,
    /\.media img\{[^}]*max-height:300px[^}]*object-fit:contain/,
  );
  assert.match(routeSource, /@media print[\s\S]*\.toolbar,\.print-help/);
  assert.match(
    routeSource,
    /@media\s+print[\s\S]*?\.print-page-footer\s*\{[^}]*display\s*:\s*none\s*!important[^}]*position\s*:\s*static\s*!important/,
  );
  assert.match(
    routeSource,
    /\.observation-card\{break-inside:avoid;page-break-inside:avoid\}/,
  );
  assert.match(
    routeSource,
    /\.approval-section\{break-inside:avoid;page-break-inside:avoid\}/,
  );
});
