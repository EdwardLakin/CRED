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
  assert.match(
    routeSource,
    /Supporting Images:<\/strong> \$\{supportingImageAssets\.length\}/,
  );
  assert.match(
    routeSource,
    /\$\{supportingImageAssets\.length\} additional image/,
  );
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
    /\.supporting-export-grid\{[^}]*display:grid[^}]*grid-template-columns:repeat\(auto-fit,minmax\(120px,1fr\)\)/,
  );
  assert.match(
    routeSource,
    /\.supporting-export-grid img\{[^}]*height:140px[^}]*object-fit:contain[^}]*width:100%/,
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
