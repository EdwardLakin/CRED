import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

async function loadWorker() {
  let source = readFileSync("src/lib/capture-processing/worker.ts", "utf8");
  source = source.replace(/^import .*\n/gm, "");
  const transpiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const dir = mkdtempSync(join(tmpdir(), "cred-worker-"));
  const modulePath = join(dir, "worker.mjs");
  writeFileSync(modulePath, transpiled);
  return import(modulePath);
}

test("extraction OCR persistence writes non-empty extracted text only when safe", async () => {
  const { getExtractionOcrTextUpdate } = await loadWorker();
  assert.equal(getExtractionOcrTextUpdate("extract_capture", null, { extracted_text: "  Full document text  " }), "Full document text");
  assert.equal(getExtractionOcrTextUpdate("extract_capture", null, { extracted_text: "  Header\nRow 1     Pass   Fail\nRow 2  " }), "Header\nRow 1     Pass   Fail\nRow 2");
  assert.equal(getExtractionOcrTextUpdate("extract_capture", " Existing OCR ", { extracted_text: "Full document text" }), " Existing OCR ");
  assert.equal(getExtractionOcrTextUpdate("classify_capture", null, { extracted_text: "classification text" }), undefined);
  assert.equal(getExtractionOcrTextUpdate("extract_capture", null, { extracted_text: "   " }), undefined);
});
