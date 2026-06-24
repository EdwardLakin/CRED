import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const titles = readFileSync(
  "src/features/reports/report-title.ts",
  "utf8",
);

const generator = readFileSync(
  "src/lib/openai/report-draft-generator.ts",
  "utf8",
);

test("specific session titles outrank generic AI report titles", () => {
  assert.match(titles, /isGenericGeneratedReportTitle/);
  assert.match(
    titles,
    /sessionTitle[\s\S]*?!isGenericGeneratedReportTitle\(sessionTitle\)[\s\S]*?return sessionTitle/,
  );
});

test("generic generated titles receive available identity", () => {
  assert.match(titles, /appendReportIdentity/);
  assert.match(
    titles,
    /identity && isGenericGeneratedReportTitle\(cleanedDraftTitle\)/,
  );
});

test("test captures are marked and excluded from summary note context", () => {
  assert.match(generator, /function isObviousTestCapture/);
  assert.match(generator, /exclude_from_summary: isObviousTestCapture\(capture\)/);
  assert.match(
    generator,
    /notes_and_transcripts:[\s\S]*?!isObviousTestCapture\(capture\)/,
  );
});

test("summary prompt forbids unsupported negative and broadened claims", () => {
  assert.match(generator, /Do not add negative observations/);
  assert.match(generator, /Do not broaden a location/);
  assert.match(generator, /Do not mention that excluded test material exists/);
});

test("summary sanitizer removes test commentary and unsupported visible-damage claims", () => {
  assert.match(generator, /test uploads\?/);
  assert.match(generator, /with no visible damage/);
  assert.match(generator, /with no apparent damage/);
});

test("prompt version is bumped for grounding changes", () => {
  assert.match(
    generator,
    /AI_REPORT_DRAFT_PROMPT_VERSION = 'form-evidence-report-v5'/,
  );
});
