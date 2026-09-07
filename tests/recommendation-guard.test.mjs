import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

// Behavioral tests for the shared enforcement backstop described in
// src/lib/openai/recommendation-guard.ts: the inspector is the source of
// truth for recommendations, and the AI may rewrite the inspector's own
// words but must never originate a recommendation.

async function loadRecommendationGuard() {
  const source = readFileSync("src/lib/openai/recommendation-guard.ts", "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dir = mkdtempSync(join(tmpdir(), "cred-recommendation-guard-"));
  const modulePath = join(dir, "recommendation-guard.mjs");
  writeFileSync(modulePath, transpiled);
  return import(modulePath);
}

test("containsRecommendationSignal detects recommendation-shaped language only", async () => {
  const { containsRecommendationSignal } = await loadRecommendationGuard();
  assert.equal(containsRecommendationSignal("Recommend replacing the front brake pads."), true);
  assert.equal(containsRecommendationSignal("The belt should be replaced soon."), true);
  assert.equal(containsRecommendationSignal("Requires service before next use."), true);
  assert.equal(containsRecommendationSignal("Corrective action needed."), true);
  assert.equal(containsRecommendationSignal("Front brake pads measured at 2mm."), false);
  assert.equal(containsRecommendationSignal("Corrosion observed on the battery terminal."), false);
  assert.equal(containsRecommendationSignal(null), false);
  assert.equal(containsRecommendationSignal(undefined), false);
  assert.equal(containsRecommendationSignal(""), false);
});

test("sanitizeRecommendationField keeps a recommendation only when the inspector's own text already states one", async () => {
  const { sanitizeRecommendationField } = await loadRecommendationGuard();

  // Inspector wrote a recommendation themselves: keep it (even if the AI rephrased it).
  assert.equal(
    sanitizeRecommendationField("Recommend replacing the front brake pads.", "Pads at 2mm, recommend replacement soon."),
    "Recommend replacing the front brake pads.",
  );

  // Inspector only described an observation, never asked for a repair: the
  // AI must not be the one to add a recommendation, however well-grounded
  // the observation is.
  assert.equal(
    sanitizeRecommendationField("Recommend replacing the front brake pads.", "Pads measured at 2mm."),
    null,
  );

  // No source text at all.
  assert.equal(sanitizeRecommendationField("Recommend replacement.", ""), null);
  assert.equal(sanitizeRecommendationField("Recommend replacement.", null), null);

  // Nothing to sanitize.
  assert.equal(sanitizeRecommendationField(null, "should be replaced"), null);
  assert.equal(sanitizeRecommendationField("", "should be replaced"), null);
});

test("stripUnsupportedRecommendationSentences removes only the recommendation-shaped sentences", async () => {
  const { stripUnsupportedRecommendationSentences } = await loadRecommendationGuard();

  const text = "The front brake pads measured 2mm. Recommend replacement before the next service.";

  // Inspector never wrote a recommendation: only the recommendation
  // sentence is dropped, the observation sentence survives.
  const stripped = stripUnsupportedRecommendationSentences(text, "Pads measured at 2mm.");
  assert.ok(stripped.includes("2mm"));
  assert.ok(!/recommend/i.test(stripped));

  // Inspector did write a recommendation: nothing is touched.
  const kept = stripUnsupportedRecommendationSentences(text, "Pads at 2mm, should be replaced soon.");
  assert.equal(kept, text);

  // Stripping every sentence leaves null, not an empty string.
  assert.equal(stripUnsupportedRecommendationSentences("Recommend replacement.", ""), null);
  assert.equal(stripUnsupportedRecommendationSentences(null, ""), null);
});

test("looksLikeRecommendationSection matches the same heuristic report-structure.ts uses", async () => {
  const { looksLikeRecommendationSection } = await loadRecommendationGuard();
  assert.equal(looksLikeRecommendationSection("Recommendations", "Replace the belt."), true);
  assert.equal(looksLikeRecommendationSection("Findings", "Corrosion observed on the terminal."), false);
});
