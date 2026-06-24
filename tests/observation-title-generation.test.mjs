import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const generator = readFileSync(
  "src/lib/openai/observation-title-generator.ts",
  "utf8",
);
const actions = readFileSync("src/features/reports/actions.ts", "utf8");
const exportRoute = readFileSync(
  "app/api/dashboard/sessions/[id]/report-pdf/route.ts",
  "utf8",
);
const reportPage = readFileSync(
  "app/dashboard/sessions/[id]/report/page.tsx",
  "utf8",
);
const titleHelpers = readFileSync(
  "src/features/reports/observation-titles.ts",
  "utf8",
);

test("observation title AI uses technician text only", () => {
  assert.match(generator, /Use only the supplied technician note/);
  assert.match(generator, /Do not analyze or infer anything from an image/);
  assert.match(generator, /Do not add defects, facts, causes, severity/);
  assert.doesNotMatch(generator, /image_url|input_image|storage_path/);
});

test("title suggestions are validated and mapped to known capture IDs", () => {
  assert.match(generator, /inputById\.get\(captureId\)/);
  assert.match(generator, /seen\.has\(captureId\)/);
  assert.match(generator, /validateTitle\(note, entry\.title\)/);
  assert.match(generator, /unsupportedGuardedTerms/);
});

test("report generation persists title metadata without changing technician notes", () => {
  assert.match(actions, /mergeSuggestedObservationTitle/);
  assert.match(actions, /sourceNoteHash/);
  assert.match(actions, /capture\.extracted_data = nextExtractedData/);
  assert.match(actions, /Suggestions unavailable; using deterministic titles/);
  const titlePersistenceBlock =
    actions.match(
      /const nextExtractedData = mergeSuggestedObservationTitle[\s\S]*?observationTitleSuggestionCount \+= 1/,
    )?.[0] ?? "";

  assert.ok(
    titlePersistenceBlock,
    "missing observation-title persistence block",
  );
  assert.match(
    titlePersistenceBlock,
    /\.update\(\{[\s\S]*?extracted_data:\s*nextExtractedData[\s\S]*?updated_at:\s*generatedAt/,
  );
  assert.doesNotMatch(
    titlePersistenceBlock,
    /technician_note\s*:/,
  );
});

test("approved title outranks suggested and note-derived titles", () => {
  assert.match(
    titleHelpers,
    /return state\.approved \|\| state\.suggested/,
  );
  assert.match(
    exportRoute,
    /if \(storedTitle\.approved\)[\s\S]*explicitTitle[\s\S]*if \(storedTitle\.suggested\)/,
  );
  assert.match(reportPage, /getObservationReportTitleState\(item\.extracted_data\)/);
});

test("AI title failure does not block report generation", () => {
  assert.match(actions, /catch \(error\) \{/);
  assert.match(
    actions,
    /Suggestions unavailable; using deterministic titles/,
  );
  assert.match(actions, /draftOutput = await generateReportDraft/);
});
