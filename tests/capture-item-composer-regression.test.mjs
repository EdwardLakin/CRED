import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const composer = readFileSync(
  "src/features/capture/components/AddCaptureForm.tsx",
  "utf8",
);
const recentItems = readFileSync(
  "src/features/capture/components/RecentCapturesList.tsx",
  "utf8",
);
const deleteButton = readFileSync(
  "src/features/capture/components/DeleteEvidenceButton.tsx",
  "utf8",
);
const captureActions = readFileSync("src/features/capture/actions.ts", "utf8");
const capturePage = readFileSync(
  "app/dashboard/sessions/[id]/capture/page.tsx",
  "utf8",
);

test("capture presents one plain-language item composer with an explicit form lane", () => {
  for (const label of [
    "Add an item",
    "Take photo",
    "Choose photos",
    "Scan or upload form",
    "What did you document?",
    "Save item",
  ]) {
    assert.match(composer, new RegExp(label.replace(/[?]/g, "\\?")));
  }
  assert.doesNotMatch(composer, />Save Observation</);
  assert.doesNotMatch(composer, />New Observation</);
  assert.doesNotMatch(composer, /📷|🖼️/);
});

test("camera is single-file while gallery can select several photos", () => {
  assert.match(
    composer,
    /const supportsMultipleFiles =\s*!preferCameraCapture &&\s*\(captureIntent === "auto_evidence" \|\| captureIntent === "auto_image"\)/,
  );
  assert.match(composer, /capture=\{fileConfig\.capture\}/);
  assert.match(composer, /multiple=\{supportsMultipleFiles\}/);
});

test("every queued attachment retains stable item identity, order and source intent", () => {
  for (const field of [
    "clientItemId",
    "documentationItemId",
    "attachmentOrder",
    "sourceKind",
    "attachmentKind",
    "sourceDocumentType",
    "sourceDocumentLabel",
  ]) {
    assert.match(composer, new RegExp(`${field}: record\\.${field}`));
  }
  assert.match(composer, /sourceDocumentType: isDocument \? \("other" as const\)/);
  assert.match(composer, /sourceDocumentLabel: isDocument \? "Form or document"/);
  assert.match(composer, /clientItemId: selectedFile\.clientItemId/);
});

test("recent content groups by canonical item and separates items, forms and notes", () => {
  assert.match(recentItems, /capture\.documentation_item_id \|\|/);
  assert.match(recentItems, />Items</);
  assert.match(recentItems, />Forms & documents</);
  assert.match(recentItems, />Notes</);
  assert.match(recentItems, /Add photo/);
  assert.match(capturePage, /\.from\("documentation_items"\)/);
  assert.match(capturePage, /\.eq\("item_kind", "observation"\)/);
  assert.doesNotMatch(capturePage, /\{captureItems\.length\} saved/);
});

test("item deletion targets the canonical parent and all attachments", () => {
  assert.match(deleteButton, /removeDocumentationItem\(formData\)/);
  assert.match(deleteButton, /Every photo and attachment in this item will be deleted/);
  assert.match(captureActions, /export async function removeDocumentationItem/);
  assert.match(captureActions, /'soft_delete_documentation_item'/);
  assert.match(recentItems, /documentationItemId=\{item\.documentationItemId\}/);
});
