import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("pending action button exposes idle/pending labels and disables while pending", () => {
  const source = readFileSync("src/features/reports/review/PendingActionButton.tsx", "utf8");
  assert.match(source, /useFormStatus\(\)/);
  assert.match(source, /disabled=\{disabled \|\| pending\}/);
  assert.match(source, /aria-busy=\{pending \|\| undefined\}/);
  assert.match(source, /pending \? pendingLabel : children/);
  assert.match(source, /button-spinner/);
});
