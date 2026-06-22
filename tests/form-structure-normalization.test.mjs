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
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dir = mkdtempSync(join(tmpdir(), "cred-form-structure-"));
  const modulePath = join(dir, "report-structure.mjs");
  writeFileSync(modulePath, transpiled);
  return import(modulePath);
}

const capture = {
  id: "form-1",
  type: "document",
  media_kind: "document",
  ai_summary: "Quarterly tractor inspection form",
  ocr_text: "Quarterly Inspection Form VIN Unit Number Brakes Steering Signature",
  technician_note: null,
  transcript: null,
  evidence_category: null,
  extracted_data: {
    source_document: { type: "inspection_form", label: "Quarterly Inspection", sections: [{ title: "Header" }, { title: "Checklist" }] },
    extraction: { fields: { vin: "1HGBH41JXMN109186", unit_number: "TR-12" } },
  },
};

function canonicalStructure(overrides = {}) {
  return {
    mode: "form_structured",
    report_structure_source: "uploaded_form",
    source_capture_id: "form-1",
    form_blueprint: {
      classification: "GENERIC_INSPECTION_FORM",
      classification_confidence: 0.82,
      source_capture_ids: ["form-1"],
      sections: [{ id: "header", title: "Header", field_ids: ["vin"] }],
      fields: [{ id: "vin", section_id: "header", label: "VIN", field_type: "header", value: "1HGBH41JXMN109186", source_capture_id: "form-1" }],
      ...overrides,
    },
  };
}

test("canonical form blueprint activates form rendering", async () => {
  const { normalizeFormBlueprintSections, getFormStructureSummary } = await loadReportStructure();
  const sections = normalizeFormBlueprintSections(canonicalStructure(), [capture]);
  assert.equal(sections.length, 1);
  assert.equal(getFormStructureSummary(canonicalStructure(), sections).isFormStructured, true);
});

test("alternate confidence field activates", async () => {
  const { normalizeFormBlueprintSections } = await loadReportStructure();
  const sections = normalizeFormBlueprintSections(canonicalStructure({ classification_confidence: undefined, confidence: "81" }), [capture]);
  assert.equal(sections[0].fields[0].label, "VIN");
});

test("fields nested inside sections normalize correctly", async () => {
  const { normalizeFormBlueprintSections } = await loadReportStructure();
  const structure = canonicalStructure({ fields: undefined, sections: [{ id: "safety", title: "Safety", fields: [{ id: "brake", label: "Brake check", value: null, source_capture_id: "form-1" }] }] });
  const sections = normalizeFormBlueprintSections(structure, [capture]);
  assert.equal(sections[0].fields[0].label, "Brake check");
  assert.equal(sections[0].fields[0].value, "Not captured");
});

test("recognized incomplete blueprint recovers from extracted form sections", async () => {
  const { normalizeFormBlueprintSections } = await loadReportStructure();
  const sections = normalizeFormBlueprintSections({ mode: "evidence_first", report_structure_source: "uploaded_form", source_capture_id: "form-1", form_blueprint: { classification: "CUSTOM_FORM", confidence: 0.8, sections: [] } }, [capture]);
  assert.ok(sections.length >= 1);
  assert.ok(sections.flatMap((s) => s.fields).some((f) => f.label === "VIN"));
});

test("weak structure falls back to General Evidence", async () => {
  const { normalizeFormBlueprintSections, getFormStructureSummary } = await loadReportStructure();
  const sections = normalizeFormBlueprintSections({ mode: "evidence_first", report_structure_source: "generic_fallback" }, [capture]);
  assert.equal(sections.length, 0);
  assert.equal(getFormStructureSummary({ report_structure_source: "generic_fallback" }, sections).source, "generic_fallback");
});

test("source form capture is not duplicated as a normal observation", async () => {
  const { normalizeFormBlueprintSections, buildNonDuplicatedReviewDocument } = await loadReportStructure();
  const sections = normalizeFormBlueprintSections(canonicalStructure(), [capture]);
  const doc = buildNonDuplicatedReviewDocument({ captures: [capture], sections });
  assert.equal(doc.supportingEvidence.length + doc.findings.length + doc.referenceDocuments.length, 0);
});

test("technician edits override using section and field identity", async () => {
  const { normalizeFormBlueprintSections } = await loadReportStructure();
  const draftSections = [{ section_key: "header", title: "Header", body: null, sort_order: 0, source_capture_ids: ["form-1"], metadata: { fields: [{ key: "vin", label: "VIN", value: "EDITEDVIN123" }] } }];
  const sections = normalizeFormBlueprintSections(canonicalStructure(), [capture], draftSections);
  assert.equal(sections[0].fields[0].value, "EDITEDVIN123");
});

test("duplicate field labels in separate sections do not overwrite each other", async () => {
  const { normalizeFormBlueprintSections } = await loadReportStructure();
  const structure = canonicalStructure({ sections: [{ id: "front", title: "Front", field_ids: ["front_status"] }, { id: "rear", title: "Rear", field_ids: ["rear_status"] }], fields: [{ id: "front_status", section_id: "front", label: "Status", value: "Open", source_capture_id: "form-1" }, { id: "rear_status", section_id: "rear", label: "Status", value: "Closed", source_capture_id: "form-1" }] });
  const draftSections = [{ section_key: "front", title: "Front", body: null, sort_order: 0, metadata: { fields: [{ key: "front_status", label: "Status", value: "Edited front" }] } }];
  const sections = normalizeFormBlueprintSections(structure, [capture], draftSections);
  assert.equal(sections[0].fields[0].value, "Edited front");
  assert.equal(sections[1].fields[0].value, "Closed");
});

test("diagnostic procedure selection remains unchanged", async () => {
  const { normalizeFormBlueprintSections } = await loadReportStructure();
  assert.equal(normalizeFormBlueprintSections({ mode: "diagnostic_procedure", report_structure_source: "generic_fallback" }, [capture]).length, 0);
});

test("field-service selection remains unchanged", async () => {
  const { normalizeFormBlueprintSections } = await loadReportStructure();
  assert.equal(normalizeFormBlueprintSections({ mode: "field_service", report_structure_source: "generic_fallback" }, [capture]).length, 0);
});

test("general evidence flow remains unchanged", async () => {
  const { getFormStructureSummary } = await loadReportStructure();
  assert.equal(getFormStructureSummary({ mode: "evidence_first", report_structure_source: "generic_fallback" }, []).isFormStructured, false);
});

test("form-only session with no additional images exports form-structured report", async () => {
  const { normalizeFormBlueprintSections, getFormStructureSummary } = await loadReportStructure();
  const sections = normalizeFormBlueprintSections(canonicalStructure(), [capture]);
  const summary = getFormStructureSummary(canonicalStructure(), sections);
  assert.notEqual(summary.source, "generic_fallback");
  assert.equal(summary.isFormStructured, true);
});
