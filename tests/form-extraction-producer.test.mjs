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
  assert.ok(titles.indexOf("Unit / equipment information") < titles.indexOf("Powertrain"));
  assert.ok(titles.indexOf("Powertrain") < titles.indexOf("Suspension"));
  assert.ok(titles.indexOf("Suspension") < titles.indexOf("Air Brakes"));
  assert.ok(sections.flatMap((section) => section.fields).some((field) => field.label === "VIN" && field.value === "2HSCHAPR45C123456"));
  assert.ok(sections.find((section) => section.title === "Powertrain")?.fields.some((field) => field.label === "Engine mounts"));
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
  ai_summary: "Quarterly inspection checklist form with status columns.",
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

test("sample checklist labels survive without captured values or checkbox marks", async () => {
  const { extractFormBlueprint, normalizeFormBlueprintSections } = await loadReportStructure();
  const blueprint = extractFormBlueprint([hansenQuarterlyCapture]);
  assert.ok(blueprint);
  const sectionTitles = blueprint.sections.map((section) => section.title);
  for (const title of ["Powertrain", "Suspension", "Air Brakes", "Steering", "Coupling Device", "Instruments & Equipment", "Lighting System", "Body & Chassis", "Tires & Wheels", "Head Rack"]) {
    assert.ok(sectionTitles.includes(title), `${title} section should be preserved`);
  }
  const leak = blueprint.fields.find((field) => field.label === "Engine/Transmission Leaks");
  assert.ok(leak);
  assert.equal(leak.value, null);
  assert.equal(blueprint.extraction_diagnostics, undefined);
  assert.ok(blueprint.fields.some((field) => field.label === "Engine/Transmission Leaks"));
  const sections = normalizeFormBlueprintSections({ mode: "form_structured", report_structure_source: "uploaded_form", form_blueprint: blueprint }, [hansenQuarterlyCapture]);
  assert.equal(sections.find((section) => section.title === "Powertrain")?.fields.find((field) => field.label === "Engine/Transmission Leaks")?.value, "Not captured");
});

const buildingInspectionCapture = {
  id: "building-form",
  type: "photo",
  media_kind: "image",
  ai_summary: "Structured building inspection checklist with neutral section headings and status columns.",
  ocr_text: `Building Review
Site: North Annex
Category            Acceptable   Needs review   Not assessed
Building Exterior
Roof condition      ☑ Acceptable ☐ Needs review ☐ Not assessed
Window seal condition
Emergency Lighting
Exit sign visibility ☐ Acceptable ☑ Needs review ☐ Not assessed
Battery backup condition`,
  technician_note: null,
  transcript: null,
  evidence_category: null,
  extracted_data: { extraction: { fields: { site: "North Annex" } } },
};

test("non-automotive section headings and label-only checklist rows use the same generic structure recovery", async () => {
  const { extractFormBlueprint, normalizeFormBlueprintSections } = await loadReportStructure();
  const blueprint = extractFormBlueprint([buildingInspectionCapture]);
  assert.ok(blueprint);
  const sections = normalizeFormBlueprintSections({ mode: "form_structured", report_structure_source: "uploaded_form", form_blueprint: blueprint }, [buildingInspectionCapture]);
  assert.ok(sections.find((section) => section.title === "Building Exterior")?.fields.some((field) => field.label === "Window seal condition" && field.value === "Not captured"));
  assert.ok(sections.find((section) => section.title === "Emergency Lighting")?.fields.some((field) => field.label === "Exit sign visibility" && field.value === "Needs review"));
  assert.ok(sections.find((section) => section.title === "Emergency Lighting")?.fields.some((field) => field.label === "Battery backup condition" && field.value === "Not captured"));
});

const complianceCapture = {
  id: "compliance-form",
  type: "photo",
  media_kind: "image",
  ai_summary: "Policy review matrix with custom compliance status vocabulary.",
  ocr_text: `Procedure Review
Requirement          Compliant   Non-compliant   Not reviewed
Document Control
Document authorization  ☐ Compliant ☐ Non-compliant ☑ Not reviewed
Medication Safety
Medication reconciliation
Storage temperature log  ☑ Compliant ☐ Non-compliant ☐ Not reviewed`,
  technician_note: null,
  transcript: null,
  evidence_category: null,
  extracted_data: null,
};

test("different status vocabulary is detected without pass fail assumptions", async () => {
  const { extractFormBlueprint, normalizeFormBlueprintSections } = await loadReportStructure();
  const blueprint = extractFormBlueprint([complianceCapture]);
  assert.ok(blueprint);
  const sections = normalizeFormBlueprintSections({ mode: "form_structured", report_structure_source: "uploaded_form", form_blueprint: blueprint }, [complianceCapture]);
  const fields = sections.flatMap((section) => section.fields);
  assert.deepEqual(fields.find((field) => field.label === "Document authorization")?.status_choices, ["Compliant", "Non-compliant", "Not reviewed"]);
  assert.equal(fields.find((field) => field.label === "Document authorization")?.value, "Not reviewed");
  assert.equal(fields.find((field) => field.label === "Medication reconciliation")?.value, "Not captured");
  assert.equal(fields.find((field) => field.label === "Storage temperature log")?.value, "Compliant");
});

test("production form extraction has no sample-specific section matching rules", () => {
  const production = readFileSync("src/features/reports/report-structure.ts", "utf8") + readFileSync("src/features/reports/actions.ts", "utf8");
  assert.doesNotMatch(production, /HANSEN|Hansen|Powertrain|Suspension|Air Brakes|Coupling Device|Instruments & Equipment|Lighting System|Body & Chassis|Tires & Wheels|Head Rack/);
  assert.doesNotMatch(production, /HANSEN_CHECKLIST_SECTION_TITLES|isKnownInspectionSectionTitle/);
});
