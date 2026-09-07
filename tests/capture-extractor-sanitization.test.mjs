import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

function transpileTs(path) {
  let source = readFileSync(path, "utf8");
  source = source.replace(/^import type .*\n/gm, "");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // Node ESM requires explicit extensions on relative specifiers; ts.transpileModule doesn't add them.
  return transpiled.replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'");
}

async function loadCaptureExtractor() {
  const dir = mkdtempSync(join(tmpdir(), "cred-capture-extractor-"));
  // capture-extractor.ts imports ./recommendation-guard as a real (non-type)
  // module, so that file must be transpiled into the same temp directory
  // for the relative import to resolve.
  writeFileSync(join(dir, "recommendation-guard.mjs"), transpileTs("src/lib/openai/recommendation-guard.ts"));
  writeFileSync(join(dir, "capture-extractor.mjs"), transpileTs("src/lib/openai/capture-extractor.ts"));
  return import(join(dir, "capture-extractor.mjs"));
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

test("generated_recommendation is dropped unless the inspector's own note/transcript already recommends something", async () => {
  const { buildExtractedCaptureData, buildCaptureAiAnalysis } = await loadCaptureExtractor();
  const extraction = {
    ...baseExtraction,
    generated_recommendation: "Recommend replacing the front brake pads.",
  };

  // No inspector source text at all: dropped.
  const noSource = buildExtractedCaptureData(null, extraction, "extracted");
  assert.equal(noSource.extraction.generated_recommendation, null);
  assert.equal(buildCaptureAiAnalysis(null, extraction, "extracted").generated_recommendation, null);

  // Inspector described the condition but never asked for a repair: still
  // dropped — the AI is not allowed to be the one to decide a repair is
  // warranted, however grounded the observation is.
  const observationOnly = buildExtractedCaptureData(null, extraction, "extracted", "Pads measured at 2mm.");
  assert.equal(observationOnly.extraction.generated_recommendation, null);

  // Inspector's own note already states a recommendation: the AI-authored
  // (rephrased) recommendation is kept.
  const grounded = buildExtractedCaptureData(null, extraction, "extracted", "Pads at 2mm, recommend replacement.");
  assert.equal(grounded.extraction.generated_recommendation, "Recommend replacing the front brake pads.");
  assert.equal(
    buildCaptureAiAnalysis(null, extraction, "extracted", "Pads at 2mm, recommend replacement.").generated_recommendation,
    "Recommend replacing the front brake pads.",
  );

  // Still dropped when the extraction itself needs technician verification,
  // even if the inspector's note would otherwise ground it.
  const needsVerification = buildExtractedCaptureData(
    null,
    { ...extraction, technician_verification_required: true },
    "needs_review",
    "Pads at 2mm, recommend replacement.",
  );
  assert.equal(needsVerification.extraction.generated_recommendation, null);
});
