import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

async function loadCaptureExtractor() {
  let source = readFileSync("src/lib/openai/capture-extractor.ts", "utf8");
  source = source.replace(/^import type .*\n/gm, "");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dir = mkdtempSync(join(tmpdir(), "cred-capture-extractor-"));
  const modulePath = join(dir, "capture-extractor.mjs");
  writeFileSync(modulePath, transpiled);
  return import(modulePath);
}

const baseExtraction = {
  summary: "  One\nline\t summary   ",
  confidence: 0.91,
  fields: {},
  notes: ["  first\n note  "],
  extracted_text: "  Header\r\n\r\n\r\nSection A     Pass   Fail\n  Brake row      ☑ Pass   ☐ Fail  \n\n\n\nSignature  ",
  extracted_values: [],
  generated_note: "  generated\n note  ",
  generated_observation: null,
  generated_recommendation: null,
  reading_status: "clear",
  technician_verification_required: false,
};

test("extracted_text preserves document line structure while summaries are one-line sanitized", async () => {
  const { validateCaptureExtraction, buildExtractedCaptureData } = await loadCaptureExtractor();
  const result = validateCaptureExtraction(baseExtraction);

  assert.equal(result.summary, "One line summary");
  assert.equal(result.notes[0], "first note");
  assert.equal(result.generated_note, "generated note");
  assert.equal(
    result.extracted_text,
    "Header\n\nSection A     Pass   Fail\nBrake row      ☑ Pass   ☐ Fail\n\nSignature",
  );
  assert.match(result.extracted_text, /Section A {5}Pass {3}Fail/);

  const persisted = buildExtractedCaptureData(null, result, "extracted");
  assert.equal(persisted.extraction.extracted_text, result.extracted_text);
  assert.equal(persisted.capture_ai_analysis.extracted_text, result.extracted_text);
});

test("extracted_text sanitizer enforces max length without flattening newlines", async () => {
  const { validateCaptureExtraction } = await loadCaptureExtractor();
  const result = validateCaptureExtraction({
    ...baseExtraction,
    extracted_text: `${"A".repeat(3998)}\nB\nC`,
  });

  assert.equal(result.extracted_text.length, 4000);
  assert.ok(result.extracted_text.includes("\n"));
});
