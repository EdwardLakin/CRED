import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

// Behavioral test for applyRecommendationGuard, the enforcement point where
// AI Report Draft output (findings[].recommendation, and recommendation-
// flavored section bodies) gets checked against the inspector's own
// technician_note/transcript before it can reach the export. Prompt
// instructions alone are necessary but not sufficient — this is the backstop
// for when the model ignores them (see tests/report-summary-source-truth.test.mjs
// for the prompt-text assertions, and recommendation-guard.test.mjs for the
// underlying primitives).

function transpileTs(path) {
  let source = readFileSync(path, "utf8");
  source = source.replace(/^import type .*\n/gm, "");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return transpiled.replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'");
}

async function loadReportDraftGenerator() {
  const dir = mkdtempSync(join(tmpdir(), "cred-report-draft-generator-"));
  writeFileSync(join(dir, "recommendation-guard.mjs"), transpileTs("src/lib/openai/recommendation-guard.ts"));
  writeFileSync(join(dir, "report-draft-generator.mjs"), transpileTs("src/lib/openai/report-draft-generator.ts"));
  return import(join(dir, "report-draft-generator.mjs"));
}

function baseCapture(id, overrides = {}) {
  return {
    id,
    type: "photo",
    media_kind: "image",
    captured_at: null,
    ai_status: null,
    ai_summary: null,
    ocr_text: null,
    technician_note: null,
    transcript: null,
    extracted_data: null,
    ...overrides,
  };
}

function baseInput(captures) {
  return {
    reportContext: null,
    session: { id: "s1", title: "Session", session_type: "inspection", asset_label: null, vin: null, odometer: null, unit_number: null, customer_name: null, suggested_details: null, field_service_details: null },
    captures,
    signatures: [],
  };
}

test("a finding's recommendation is dropped unless the inspector's own note for that capture already recommends something", async () => {
  const { validateGeneratedReportDraft, applyRecommendationGuard } = await loadReportDraftGenerator();

  const captures = [
    baseCapture("cap-observation-only", { technician_note: "Pads measured at 2mm." }),
    baseCapture("cap-grounded", { technician_note: "Pads at 2mm, recommend replacement soon." }),
  ];

  const draft = validateGeneratedReportDraft(
    {
      title: "Report",
      summary: null,
      header_fields: {},
      measurements: [],
      findings: [
        { title: "Brakes", component: "brake pads", location: "front", condition: "worn", severity: "advisory", recommendation: "Recommend replacing the front brake pads.", source_capture_id: "cap-observation-only", notes: null },
        { title: "Brakes", component: "brake pads", location: "rear", condition: "worn", severity: "advisory", recommendation: "Recommend replacing the rear brake pads.", source_capture_id: "cap-grounded", notes: null },
      ],
      coverage: {},
      unmapped_evidence: [],
      confidence: 0.8,
      sections: [],
    },
    new Set(captures.map((c) => c.id)),
  );

  const guarded = applyRecommendationGuard(draft, baseInput(captures));

  assert.equal(guarded.findings[0].recommendation, null);
  assert.equal(guarded.findings[1].recommendation, "Recommend replacing the rear brake pads.");
});

test("a recommendation-flavored section body has only its unsupported sentences stripped", async () => {
  const { validateGeneratedReportDraft, applyRecommendationGuard } = await loadReportDraftGenerator();

  const captures = [baseCapture("cap-1", { technician_note: "Battery terminal has corrosion." })];

  const draft = validateGeneratedReportDraft(
    {
      title: "Report",
      summary: null,
      header_fields: {},
      measurements: [],
      findings: [],
      coverage: {},
      unmapped_evidence: [],
      confidence: 0.8,
      sections: [
        {
          section_key: "recommendations",
          title: "Recommendations",
          body: "Corrosion was observed on the battery terminal. Recommend cleaning the terminal and monitoring for recurrence.",
          status: "recommended",
          confidence: 0.7,
          source_capture_ids: ["cap-1"],
          sort_order: 0,
          metadata: {},
        },
      ],
    },
    new Set(captures.map((c) => c.id)),
  );

  const guarded = applyRecommendationGuard(draft, baseInput(captures));

  assert.ok(/corrosion/i.test(guarded.sections[0].body));
  assert.ok(!/recommend/i.test(guarded.sections[0].body));
});

test("a whole recommendation section is dropped when none of its captures' inspector text supports it", async () => {
  const { validateGeneratedReportDraft, applyRecommendationGuard } = await loadReportDraftGenerator();

  const captures = [baseCapture("cap-1", { technician_note: "Corrosion observed." })];

  const draft = validateGeneratedReportDraft(
    {
      title: "Report",
      summary: null,
      header_fields: {},
      measurements: [],
      findings: [],
      coverage: {},
      unmapped_evidence: [],
      confidence: 0.8,
      sections: [
        {
          section_key: "recommendations",
          title: "Recommendations",
          body: "Recommend replacement of the affected component.",
          status: "recommended",
          confidence: 0.7,
          source_capture_ids: ["cap-1"],
          sort_order: 0,
          metadata: {},
        },
      ],
    },
    new Set(captures.map((c) => c.id)),
  );

  const guarded = applyRecommendationGuard(draft, baseInput(captures));
  assert.equal(guarded.sections[0].body, null);
});

test("an observation-only section (not recommendation-flavored) is left untouched", async () => {
  const { validateGeneratedReportDraft, applyRecommendationGuard } = await loadReportDraftGenerator();

  const captures = [baseCapture("cap-1", { technician_note: "Tire tread measured at 4/32." })];

  const draft = validateGeneratedReportDraft(
    {
      title: "Report",
      summary: null,
      header_fields: {},
      measurements: [],
      findings: [],
      coverage: {},
      unmapped_evidence: [],
      confidence: 0.8,
      sections: [
        {
          section_key: "findings",
          title: "Findings",
          body: "Tire tread depth measured at 4/32 inch.",
          status: "informational",
          confidence: 0.7,
          source_capture_ids: ["cap-1"],
          sort_order: 0,
          metadata: {},
        },
      ],
    },
    new Set(captures.map((c) => c.id)),
  );

  const guarded = applyRecommendationGuard(draft, baseInput(captures));
  assert.equal(guarded.sections[0].body, "Tire tread depth measured at 4/32 inch.");
});
