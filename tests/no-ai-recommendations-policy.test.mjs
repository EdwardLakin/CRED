import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Policy: the inspector is the source of truth for recommendations. The AI
// may rewrite the inspector's own words, but must never originate a
// recommendation. See src/lib/openai/recommendation-guard.ts for the shared
// enforcement primitives; recommendation-guard.test.mjs and
// report-draft-recommendation-guard.test.mjs exercise those primitives and
// the report-draft-generator.ts wiring behaviorally. This file locks down
// the remaining wiring across the codebase that a behavioral test can't
// easily reach (a live network call, or a removed UI action).

const finalNotesGenerator = readFileSync("src/lib/openai/final-notes-generator.ts", "utf8");
const observationAssistant = readFileSync("src/lib/openai/observation-writing-assistant.ts", "utf8");
const reportActions = readFileSync("src/features/reports/actions.ts", "utf8");
const observationEditor = readFileSync("src/features/reports/review/ObservationAssistantEditor.tsx", "utf8");
const evidenceAssistant = readFileSync("src/features/reports/review/EvidenceObservationAssistant.tsx", "utf8");

test("final notes generation strips recommendation-shaped sentences the inspector didn't write", () => {
  assert.match(finalNotesGenerator, /import \{ stripUnsupportedRecommendationSentences \} from '\.\/recommendation-guard'/);
  assert.match(finalNotesGenerator, /stripUnsupportedRecommendationSentences\(/);
  assert.match(finalNotesGenerator, /function getInspectorSourceText/);
  // Grounding text is technician_note/transcript only — never ocr_text or
  // other AI-derived fields.
  const helper = finalNotesGenerator.match(/function getInspectorSourceText[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(helper, /capture\.technician_note/);
  assert.match(helper, /capture\.transcript/);
  assert.doesNotMatch(helper, /ocr_text|ai_summary|extracted_data/);
});

test("final notes prompt version is bumped for the recommendation guard change", () => {
  assert.match(finalNotesGenerator, /FINAL_NOTES_PROMPT_VERSION = 'report-final-notes-v2'/);
});

// Matches an actual array/type-union member ('generate_recommendation'
// immediately followed by a comma, closing bracket, or union pipe) — not an
// English-sentence comment that merely mentions the removed action by name
// to document its absence.
const ACTION_MEMBER_PATTERN = /['"]generate_recommendation['"]\s*[,\]|]/;

for (const [name, source] of [
  ["observation-writing-assistant.ts", observationAssistant],
  ["ObservationAssistantEditor.tsx", observationEditor],
  ["EvidenceObservationAssistant.tsx", evidenceAssistant],
]) {
  test(`${name} does not expose a generate_recommendation AI action`, () => {
    assert.doesNotMatch(source, ACTION_MEMBER_PATTERN);
  });
}

test("the server-side observation writing action allow-list also excludes generate_recommendation", () => {
  const allowList = reportActions.match(/function getObservationWritingAction[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(allowList, "expected to find getObservationWritingAction");
  assert.doesNotMatch(allowList, ACTION_MEMBER_PATTERN);
});

test("the observation writing assistant enforces recommendation grounding after generation, not just via the prompt", () => {
  assert.match(observationAssistant, /import \{ containsRecommendationSignal, stripUnsupportedRecommendationSentences \} from '\.\/recommendation-guard'/);
  assert.match(observationAssistant, /containsRecommendationSignal\(input\.technicianNote\)/);
  assert.match(observationAssistant, /stripUnsupportedRecommendationSentences\(generated, input\.technicianNote\)/);
});

test("observation writing prompt version is bumped and the recommended-action classification only allows rewording", () => {
  assert.match(observationAssistant, /OBSERVATION_WRITING_PROMPT_VERSION = 'observation-writing-v2'/);
  assert.match(observationAssistant, /you may only reword or reorganize it for clarity and tone/);
});
