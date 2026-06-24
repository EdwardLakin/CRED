import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const generator = readFileSync(
  "src/lib/openai/report-draft-generator.ts",
  "utf8",
);

test("report summary prompt forbids unsupported recommendations", () => {
  assert.match(
    generator,
    /Do not say recommendations, repairs, replacement, monitoring/,
  );
  assert.match(
    generator,
    /If no technician-authored recommendation exists/,
  );
  assert.match(
    generator,
    /Do not claim that visual evidence independently proves/,
  );
});

test("summary source-truth guard checks only trusted source text", () => {
  assert.match(generator, /function getSourceTruthText/);
  assert.match(generator, /capture\.technician_note/);
  assert.match(generator, /capture\.transcript/);
  assert.match(generator, /capture\.ocr_text/);
  assert.match(generator, /getExtractedDocumentText\(capture\)/);
  assert.doesNotMatch(
    generator.match(
      /function getSourceTruthText[\s\S]*?function sourceSupportsRecommendationClaims/,
    )?.[0] ?? "",
    /ai_summary|image classification|storage_path/,
  );
});

test("unsupported recommendation sentences are removed", () => {
  assert.match(generator, /sanitizeSummaryAgainstSourceTruth/);
  assert.match(
    generator,
    /recommendation\|recommendations\|recommended/,
  );
  assert.match(generator, /safeSentences\.join/);
});

test("summary guard runs on successful and fallback report generation", () => {
  const calls =
    generator.match(/applySourceTruthSummaryGuard\(/g)?.length ?? 0;

  assert.ok(calls >= 4);
  assert.match(
    generator,
    /validateGeneratedReportDraft\(JSON\.parse\(outputText\), allowedCaptureIds\)/,
  );
});

test("report prompt version changes when summary rules change", () => {
  assert.match(
    generator,
    /AI_REPORT_DRAFT_PROMPT_VERSION = 'form-evidence-report-v5'/,
  );
});
