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

const hansenLikeOcrCapture = {
  id: "hansen-like-form",
  type: "photo",
  media_kind: "image",
  ai_summary: "Captured inspection form with unit information and a multi-section checklist grid.",
  ocr_text: `Inspection Record
VIN: 2HSCHAPR45C123456
Unit Number: 4108
Section              Pass   Fail   N/A
Powertrain
Engine mounts        ☐ Pass ☐ Fail ☐ N/A
Oil leaks            ☑ Pass ☐ Fail ☐ N/A
Suspension
Springs              ☐ Pass ☑ Fail ☐ N/A
Air Brakes
Low air warning      ☐ Pass ☐ Fail ☐ N/A
Steering
Steering wheel lash  ☐ Pass ☐ Fail ☐ N/A`,
  technician_note: null,
  transcript: null,
  evidence_category: null,
  extracted_data: { extraction: { fields: { vin: "2HSCHAPR45C123456", unit_number: "4108" } } },
};

test("OCR grid recovery keeps header fields and checklist rows in source order", async () => {
  const { extractFormBlueprint, normalizeFormBlueprintSections } = await loadReportStructure();
  const blueprint = extractFormBlueprint([hansenLikeOcrCapture]);
  assert.ok(blueprint);
  const sections = normalizeFormBlueprintSections({ mode: "form_structured", report_structure_source: "uploaded_form", form_blueprint: blueprint }, [hansenLikeOcrCapture]);
  const titles = sections.map((section) => section.title);
  assert.ok(titles.length >= 4);
  assert.ok(sections.flatMap((section) => section.fields).some((field) => field.label === "VIN" && field.value === "2HSCHAPR45C123456"));
  assert.ok(sections.flatMap((section) => section.fields).some((field) => field.label === "VIN"));
});

test("generic status columns preserve explicit marks and leave unchecked rows unresolved", async () => {
  const { extractFormBlueprint, normalizeFormBlueprintSections } = await loadReportStructure();
  const blueprint = extractFormBlueprint([hansenLikeOcrCapture]);
  const sections = normalizeFormBlueprintSections({ mode: "form_structured", report_structure_source: "uploaded_form", form_blueprint: blueprint }, [hansenLikeOcrCapture]);
  const allFields = sections.flatMap((section) => section.fields);
  const oilLeaks = allFields.find((field) => field.label === "Oil leaks");
  const springs = allFields.find((field) => field.label === "Springs");
  const lowAir = allFields.find((field) => field.label === "Low air warning");
  assert.deepEqual(oilLeaks?.status_choices, ["Pass", "Fail", "N/A"]);
  assert.equal(oilLeaks?.value, "Pass");
  assert.equal(springs?.value, "Fail");
  assert.equal(lowAir?.value, "Not captured");
});

const hansenQuarterlyCapture = {
  id: "hansen-quarterly-form",
  type: "photo",
  media_kind: "image",
  ai_summary: "Hansen quarterly inspection checklist form with pass fail na columns.",
  ocr_text: `Hansen's Quarterly Inspection - Tractor
VIN: 2HSCHAPR45C123456
Unit Number: 4108
Inspection Item        Pass   Fail   N/A
Powertrain
Engine/Transmission Leaks
Engine mounts
Suspension
Springs
Air Brakes
Low air warning
Steering
Steering wheel lash
Coupling Device
Fifth wheel jaws
Instruments & Equipment
Horn
Lighting System
Headlamps
Body & Chassis
Frame
Tires & Wheels
Tire tread
Head Rack
Head rack secure`,
  technician_note: null,
  transcript: null,
  evidence_category: null,
  extracted_data: { extraction: { fields: { vin: "2HSCHAPR45C123456", unit_number: "4108" } } },
};

test("label-only checklist rows survive without captured values or checkbox marks", async () => {
  const { extractFormBlueprint, normalizeFormBlueprintSections } = await loadReportStructure();
  const blueprint = extractFormBlueprint([hansenQuarterlyCapture]);
  assert.ok(blueprint);
  assert.ok(blueprint.sections.length >= 10);
  assert.ok(blueprint.fields.length > 2);
  assert.equal(Object.prototype.hasOwnProperty.call(blueprint, "extraction_diagnostics"), false);
  const sections = normalizeFormBlueprintSections({ mode: "form_structured", report_structure_source: "uploaded_form", form_blueprint: blueprint }, [hansenQuarterlyCapture]);
  assert.ok(sections.flatMap((section) => section.fields).length > 2);
});

const genericNestedText = `General Inspection Sheet
VIN: 3ABC1234567890123
Unit Number: BLD-7
Building Exterior     Pass   Fail   N/A
Roof condition
Window seal condition  ☐ Pass ☑ Fail ☐ N/A
Emergency Lighting    Pass   Fail   N/A
Exit sign visibility
Battery backup test    ☑ Pass ☐ Fail ☐ N/A`;

function nestedCapture(overrides = {}) {
  return {
    id: "nested-form",
    type: "photo",
    media_kind: "image",
    ai_summary: "Captured generic inspection sheet with checklist rows and status columns.",
    ocr_text: null,
    technician_note: null,
    transcript: null,
    evidence_category: null,
    extracted_data: { extraction: { extracted_text: genericNestedText, fields: { vin: "3ABC1234567890123", unit_number: "BLD-7" } } },
    ...overrides,
  };
}

test("nested extracted text only recovers full form structure", async () => {
  const { extractFormBlueprint, getReportStructureSourceMetadata, normalizeFormBlueprintSections } = await loadReportStructure();
  const capture = nestedCapture();
  const blueprint = extractFormBlueprint([capture]);
  assert.ok(blueprint);
  assert.equal(getReportStructureSourceMetadata([capture]).report_structure_source, "uploaded_form");
  assert.ok(blueprint.sections.some((section) => section.title === "Building Exterior"));
  assert.ok(blueprint.sections.some((section) => section.title === "Emergency Lighting"));
  assert.ok(blueprint.fields.some((field) => field.label === "Roof condition" && field.value === null));
  assert.ok(blueprint.fields.some((field) => field.label === "VIN" && field.value === "3ABC1234567890123"));
  assert.ok(blueprint.fields.length > 2);
  const sections = normalizeFormBlueprintSections({ mode: "form_structured", report_structure_source: "uploaded_form", form_blueprint: blueprint }, [capture]);
  assert.equal(sections.flatMap((section) => section.fields).find((field) => field.label === "Roof condition")?.value, "Not captured");
});

test("capture_ai_analysis extracted text fallback recovers full form structure", async () => {
  const { extractFormBlueprint } = await loadReportStructure();
  const capture = nestedCapture({ extracted_data: { extraction: { fields: { vin: "3ABC1234567890123", unit_number: "BLD-7" } } }, capture_ai_analysis: { extracted_text: genericNestedText } });
  const blueprint = extractFormBlueprint([capture]);
  assert.ok(blueprint);
  assert.ok(blueprint.sections.some((section) => section.title === "Building Exterior"));
  assert.ok(blueprint.fields.some((field) => field.label === "Exit sign visibility" && field.value === null));
  assert.ok(blueprint.fields.some((field) => field.label === "Unit number" && field.value === "BLD-7"));
});

test("canonical accessor preserves OCR precedence and avoids duplicate fallback rows", async () => {
  const { extractFormBlueprint, getCaptureDocumentTextSource } = await loadReportStructure();
  const ocrText = `Primary Form
VIN: OCRVIN1234567890
Safety Area   Pass   Fail
Primary row   ☑ Pass ☐ Fail`;
  const capture = nestedCapture({ ocr_text: ocrText, extracted_data: { extraction: { extracted_text: genericNestedText, fields: {} } } });
  const source = getCaptureDocumentTextSource(capture);
  assert.equal(source.source, "ocr_text");
  assert.equal(source.text, ocrText);
  const blueprint = extractFormBlueprint([capture]);
  assert.ok(blueprint.fields.some((field) => field.label === "Primary row"));
  assert.equal(blueprint.fields.filter((field) => field.label === "Primary row").length, 1);
  assert.equal(blueprint.fields.some((field) => field.label === "Roof condition"), false);
});

test("non-automotive form recovers generic sections and rows", async () => {
  const { extractFormBlueprint } = await loadReportStructure();
  const blueprint = extractFormBlueprint([nestedCapture({ id: "building-form" })]);
  assert.ok(blueprint.sections.some((section) => section.title === "Building Exterior"));
  assert.ok(blueprint.fields.some((field) => field.label === "Roof condition"));
  assert.ok(blueprint.fields.some((field) => field.label === "Battery backup test" && field.value === "Pass"));
});


test("alternate status vocabulary rows preserve explicit marks", async () => {
  const { extractFormBlueprint, normalizeFormBlueprintSections } = await loadReportStructure();
  const capture = nestedCapture({
    id: "facility-status-form",
    type: "document",
    media_kind: "document",
    ai_summary: "Facility audit with generic status vocabulary columns.",
    ocr_text: `Facility Compliance Inspection Audit
Area Acceptable Needs Review Not Assessed Monitor Corrective Action
Fire door latch ☑ Acceptable ☐ Needs Review ☐ Not Assessed ☐ Monitor ☐ Corrective Action
Exit route signage ☐ Acceptable ☑ Needs Review ☐ Not Assessed ☐ Monitor ☐ Corrective Action
Water fountain ☐ Acceptable ☐ Needs Review ☑ Not Assessed ☐ Monitor ☐ Corrective Action
Policy Review Compliant Non-compliant Not Reviewed
Visitor log ☐ Compliant ☑ Non-compliant ☐ Not Reviewed`,
    extracted_data: { extraction: { fields: {} } },
  });
  const blueprint = extractFormBlueprint([capture]);
  assert.ok(blueprint);
  const sections = normalizeFormBlueprintSections({ mode: "form_structured", report_structure_source: "uploaded_form", form_blueprint: blueprint }, [capture]);
  const fields = sections.flatMap((section) => section.fields);
  assert.equal(fields.find((field) => field.label === "Fire door latch")?.value, "Acceptable");
  assert.equal(fields.find((field) => field.label === "Exit route signage")?.value, "Needs Review");
  assert.equal(fields.find((field) => field.label === "Water fountain")?.value, "Not Assessed");
  assert.equal(fields.find((field) => field.label === "Visitor log")?.value, "Non-compliant");
  assert.deepEqual(fields.find((field) => field.label === "Visitor log")?.status_choices, ["Compliant", "Non-compliant", "Not Reviewed"]);
});
