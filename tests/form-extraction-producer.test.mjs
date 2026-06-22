import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

async function loadReportStructure() {
  let source = readFileSync("src/features/reports/report-structure.ts", "utf8");
  source = source.replace(/import \{ normalizeEvidenceCategory \} from '[^']+'\n/, "const normalizeEvidenceCategory = (value) => value ?? null;\n");
  source = source.replace(/import type \{ Json \} from '[^']+'\n/, "");
  const transpiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const dir = mkdtempSync(join(tmpdir(), "cred-form-producer-"));
  const modulePath = join(dir, "report-structure.mjs");
  writeFileSync(modulePath, transpiled);
  return import(modulePath);
}

const formCapture = {
  id: "photo-form-1",
  type: "photo",
  media_kind: "image",
  ai_summary: "Clear photographed quarterly inspection checklist form with title, VIN, unit, make, repeated checklist rows, and status columns.",
  ocr_text: `Hansen's Quarterly Inspection - Tractor
VIN: 1HGBH41JXMN109186
Unit Number: TR-12
Make: ExampleMake
Inspection Frequency: Quarterly
Engine Inspection   OK   Needs Repair   N/A
Oil level           ☑ OK   ☐ Needs Repair   ☐ N/A
Coolant level       ☐ OK   ☐ Needs Repair   ☐ N/A
Safety Inspection
Horn                ☐ OK   ☐ Needs Repair   ☐ N/A
Notes:
Signature:`,
  technician_note: null,
  transcript: null,
  evidence_category: null,
  extracted_data: { extraction: { fields: { vin: "1HGBH41JXMN109186", unit_number: "TR-12", make: "ExampleMake", inspection_frequency: "Quarterly" } } },
};

test("structured OCR form with no AI blueprint recovers canonical blueprint", async () => {
  const { extractFormBlueprint } = await loadReportStructure();
  const blueprint = extractFormBlueprint([formCapture]);
  assert.ok(blueprint);
  assert.equal(blueprint.classification, "GENERIC_INSPECTION_FORM");
  assert.ok(blueprint.sections.length >= 2);
  assert.ok(blueprint.fields.some((field) => field.label === "Oil level"));
});

test("form-only session activates form_structured source metadata", async () => {
  const { deriveFormSectionsFromCaptures, getReportStructureSourceMetadata } = await loadReportStructure();
  const sections = deriveFormSectionsFromCaptures([formCapture]);
  const metadata = getReportStructureSourceMetadata([formCapture]);
  assert.ok(sections.length >= 2);
  assert.equal(metadata.report_structure_source, "uploaded_form");
});

test("ordered sections and checklist rows survive normalization with explicit marks", async () => {
  const { extractFormBlueprint, normalizeFormBlueprintSections } = await loadReportStructure();
  const blueprint = extractFormBlueprint([formCapture]);
  const sections = normalizeFormBlueprintSections({ mode: "form_structured", report_structure_source: "uploaded_form", form_blueprint: blueprint }, [formCapture]);
  assert.ok(blueprint.sections.length >= 2);
  const oil = sections.flatMap((section) => section.fields).find((field) => field.label === "Oil level");
  assert.ok(oil?.value?.includes("OK"));
});

test("unclear or unchecked rows remain unresolved instead of passed", async () => {
  const { extractFormBlueprint } = await loadReportStructure();
  const blueprint = extractFormBlueprint([formCapture]);
  const coolant = blueprint.fields.find((field) => field.label === "Coolant level");
  assert.equal(coolant.value, null);
});

test("unstructured photo remains general evidence", async () => {
  const { extractFormBlueprint, getReportStructureSourceMetadata } = await loadReportStructure();
  const photo = { ...formCapture, id: "photo-2", ai_summary: "Photo of rust on a panel", ocr_text: "", extracted_data: null };
  assert.equal(extractFormBlueprint([photo]), null);
  assert.equal(getReportStructureSourceMetadata([photo]).report_structure_source, "generic_fallback");
});
