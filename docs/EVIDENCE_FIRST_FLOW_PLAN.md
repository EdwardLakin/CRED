# CRED Evidence-First Flow Transition Plan

## Phase 1 implemented (June 12, 2026)

- User-facing language has been reframed from templates/checklists/workflows toward Form Profiles, Report Context, Evidence Capture, Report Coverage, and Report Readiness.
- Schema is unchanged. No new tables, columns, migrations, or database renames were added in this phase.
- Form Profiles are still internally stored in the existing `documentation_workflow_templates`, `template_imports`, and related template fields for compatibility.
- Required-evidence functionality remains in place temporarily, but the UI now presents it as advisory Coverage Suggestions / Report Readiness rather than a required technician route.


## 1. Executive Summary

CRED already has a strong foundation for an evidence-first documentation engine: sessions, upload/capture storage, retry-friendly capture UX, AI classification/extraction primitives, editable evidence notes, extracted-value review, printable reports, share/email/archive delivery, signatures, billing gates, and usage accounting are all present. The major product gap is that current language, data names, and multiple screens still treat uploaded forms as **workflow templates** that define required evidence and progress rather than **Form Profiles** that provide report output context.

### What the current build does well

- **Session container and identity fields exist.** New sessions store title, session type, status, organization, creator, and optional `workflow_template_id` in `documentation_sessions`; session detail exposes asset/customer fields, field-service details, signatures, evidence gallery, extracted evidence, and report actions (`app/dashboard/sessions/new/page.tsx`, `src/features/sessions/actions.ts`, `app/dashboard/sessions/[id]/page.tsx`).
- **Capture is already close to natural evidence capture.** The focused capture page has a large capture control, typed/voice notes, draft previews, upload status, retry handling, recent captures, and a sticky Done action (`app/dashboard/sessions/[id]/capture/page.tsx`, `src/features/capture/components/AddCaptureForm.tsx`).
- **AI classification/extraction foundation exists.** Captures can be classified into document/plate/measurement/defect categories and then extracted into structured fields with confidence, summaries, notes, and source file references (`src/lib/openai/capture-classifier.ts`, `src/lib/openai/capture-extractor.ts`, `src/features/capture/actions.ts`).
- **Human review and delivery gates already exist.** Reports must be marked `ready_for_delivery` before final printable report opening, email, sharing, and saving (`app/dashboard/sessions/[id]/report/page.tsx`, `src/features/reports/actions.ts`, `app/api/dashboard/sessions/[id]/report-pdf/route.ts`).
- **Template storage can be reused.** Uploaded files are saved in `documentation-templates`; `template_imports` preserves original uploads and `documentation_workflow_templates` stores sections, fields, layout hints, evidence requirements, signatures, and status (`supabase/migrations/20260611223000_template_import_evidence_signatures_delivery.sql`).

### Where the current build still assumes structured workflow

- **Naming and copy are workflow-first.** Session creation uses “Template” and states that templates define required evidence, signatures, and report structure (`app/dashboard/sessions/new/page.tsx`). Settings says imported forms become reusable digital workflows and AI template drafts (`app/dashboard/settings/templates/page.tsx`).
- **Capture page opens with required evidence progress.** The capture route calculates `requiredEvidence` and displays completed/missing required evidence before the capture control (`app/dashboard/sessions/[id]/capture/page.tsx`).
- **Guided evidence steps are hard-coded.** CVIP/general inspection step arrays list items like registration, VIN, licence plate, odometer, inspection sheet, data plate, and defects as guided workflow steps (`src/features/capture/guided-workflow.ts`).
- **Report readiness is tied to required-evidence completion.** The report review page warns about missing required evidence, asks the user to acknowledge missing evidence, and labels the review checklist “Required evidence reviewed” (`app/dashboard/sessions/[id]/report/page.tsx`, `src/features/reports/actions.ts`).
- **System templates encode mandatory inspection evidence.** CVIP, field service, and other system templates store `requiredEvidence` rules that imply the technician must complete those items (`src/features/templates/types.ts`).

### What needs to change

- Reframe “template workflow” to **Form Profile** and make the uploaded form a source of **Report Context**, not an inspection route.
- Move source documents into a first-class concept so work order, registration, VIN plate, data plate, odometer, licence plate, and unit number can be captured intentionally without becoming a checklist.
- Add an **AI Report Draft** layer between raw evidence and final report. This draft should organize captured evidence into report sections after the fact, preserve source references, identify assumptions/confidence, and require human review.
- Replace “required evidence progress” with **Report Readiness / Coverage** that is advisory and draft-oriented.
- Make final printable/share/email/save operations depend on approval of a human-reviewed draft, not on completion of workflow-required cards.

### What should stay

- Existing session, capture, storage, billing/usage, signature, extracted evidence, report delivery, and secure share primitives should stay and be evolved.
- Existing template tables can be reused initially under a Form Profile UI layer to avoid a disruptive schema rewrite.
- Existing AI classification/extraction should be extended rather than discarded.
- Existing human review gate should become stronger and more explicit around AI draft approval.

## 2. Current Architecture Map

### Dashboard and session routes

- `app/dashboard/page.tsx`: dashboard landing and session overview entry point.
- `app/dashboard/sessions/page.tsx`: session list route.
- `app/dashboard/sessions/new/page.tsx`: creates a new documentation session, loads active `documentation_workflow_templates`, and lets the user choose a template before session creation.
- `src/features/sessions/actions.ts`: server actions for creating/updating/archive/restore sessions and applying extracted evidence into session fields.
- `src/features/sessions/data.ts`: workspace/session access helper used by dashboard routes.
- `src/features/sessions/types.ts`: session statuses and session types.
- `app/dashboard/sessions/[id]/page.tsx`: session detail page showing editable session/asset details, field-service details, evidence checklist summary, signatures, evidence gallery, AI action buttons, extracted evidence panel, report events, and report review entry point.

### Capture routes, components, and actions

- `app/dashboard/sessions/[id]/capture/page.tsx`: focused technician capture workspace. It currently displays required-evidence progress, renders `AddCaptureForm`, and shows recent captures.
- `src/features/capture/components/AddCaptureForm.tsx`: client-side capture/upload UI with camera/file picker, preview cards, typed/voice note, retry failed upload, multi-file batch for auto evidence, and advanced manual upload options.
- `src/features/capture/actions.ts`: validates billing/access/usage, inserts capture records, creates timeline events, classifies pending captures, extracts capture details, and updates/removes capture review metadata.
- `src/features/capture/components/RecentCapturesList.tsx`: compact recent capture confirmation.
- `src/features/capture/components/CaptureList.tsx`: evidence gallery with media preview, note editing, include/exclude in report, report ordering, and removal.
- `src/features/capture/components/EvidenceChecklistSummary.tsx`: compact workflow coverage/checklist on session detail.
- `src/features/capture/components/ExtractedEvidencePanel.tsx`: extracted values panel with source labels, confidence, summary, extracted fields, notes, and “Apply” actions to session fields.
- `src/features/capture/guided-workflow.ts`: hard-coded CVIP/general evidence step definitions and checklist/completion helpers.
- `src/features/capture/types.ts`: capture type/intent metadata and initial extracted-data helpers.

### AI classification/extraction

- `src/lib/openai/capture-classifier.ts`: OpenAI Responses API classifier using `gpt-4.1-mini`; returns one detected type, confidence, label, reason, and CVIP relevance. It includes note-based contextual overrides for brakes, tire tread, and battery evidence.
- `src/lib/openai/capture-extractor.ts`: OpenAI Responses API extractor using `gpt-4.1-mini`; extracts cautious structured fields such as VIN, unit, odometer, work order number, customer, complaint/cause/correction, manufacturer/model/serial, GVWR/GAWR, tire values, measurement/condition/recommendation/severity, and inspection date.

### Template import/library/workflow templates

- `app/dashboard/settings/templates/page.tsx`: import/edit/manage templates. It supports system templates, organization templates, duplicate/archive/delete, and editable sections/fields/required evidence/recommended evidence/signature requirements.
- `app/dashboard/templates/page.tsx`: template entry route/library shortcut.
- `src/features/templates/actions.ts`: imports files, stores them, creates `template_imports`, inserts `documentation_workflow_templates`, saves/duplicates/archives/deletes templates, and records usage.
- `src/features/templates/analyzer.ts`: filename/mime-type heuristic “AI Template Draft” generator; does not yet parse actual form content.
- `src/features/templates/types.ts`: system template drafts, including CVIP and Field Service Report required evidence definitions.

### Field service details

- `src/features/field-service/components/FieldServiceDetailsCard.tsx`: editable field-service-specific session fields.
- `src/features/field-service/components/TravelWorkflowControls.tsx`: travel/time workflow controls.
- `src/features/field-service/types.ts`: field-service field names, sections, labels, normalization helpers, and session-type recognition.
- `supabase/migrations/20260611210000_field_service_report_details.sql`: adds `field_service_details` JSONB to `documentation_sessions`.

### Report review, printable report, signatures, and delivery

- `app/dashboard/sessions/[id]/report/page.tsx`: review/delivery page with missing required evidence warning, human review gate, email form, share link form, save report form, event list, and iframe preview.
- `src/features/reports/actions.ts`: marks reports reviewed, creates/uses share tokens, emails secure links, saves report events, disables share links, and enforces ready-for-delivery status.
- `app/api/dashboard/sessions/[id]/report-pdf/route.ts`: printable HTML report route. It gates direct opening behind review status except preview/share access, renders field-service reports or generic evidence reports, signs capture/signature URLs, and records printable-open events.
- `app/reports/share/[token]/page.tsx`: public secure share page validating token, expiration, disabled state, view count, and iframe preview.
- `src/features/signatures/actions.ts` and `src/features/signatures/components/SignatureCaptureForm.tsx`: signature capture, storage, and display.

### Billing, usage, and gates

- `src/features/billing/access.ts`, `src/features/billing/limits.ts`, and `src/features/billing/components/*`: active billing access and plan-specific limits.
- `src/features/usage/limits.ts`, `src/features/usage/components/UsageSummaryCard.tsx`, and `src/features/usage/index.ts`: usage allowance and usage event tracking for storage, captures, AI classification/extraction, template import, share links, and printable opens.
- Capture, template import, report delivery, and session actions consistently call billing/usage guards.

### Supabase schema areas

- `supabase/migrations/20260609190000_session_capture_intake.sql`: `documentation-captures` bucket, `capture_items`, and `timeline_events`.
- `supabase/migrations/20260610153000_reviewed_evidence_cards_video_exports.sql`: capture notes/transcripts/media kind/report ordering/include flag/deleted flag/video support and `exports`.
- `supabase/migrations/20260611223000_template_import_evidence_signatures_delivery.sql`: `documentation-templates` and `documentation-signatures` buckets, `template_imports`, `documentation_workflow_templates`, `template_required_evidence`, `signature_captures`, `report_share_tokens`, and `documentation_sessions.workflow_template_id`.
- `supabase/migrations/20260610120000_add_session_suggested_details.sql`: `documentation_sessions.suggested_details` for extracted/applyable values.
- `supabase/migrations/20260611233000_report_review_gate.sql`: `documentation_sessions.review_status`, `reviewed_at`, and `reviewed_by`.

## 3. Concepts to Keep

- **Capture system:** Keep `capture_items`, the storage bucket, media kind, notes/transcripts, include/exclude, report order, soft delete, signed URLs, and evidence gallery.
- **Upload retry and mobile-first capture UX:** Keep client-side upload queue, failed upload retry, draft previews, voice/typed note, file-size checks, and sticky Done flow.
- **AI classification/extraction foundation:** Keep the classifier/extractor split and stored `extracted_data` structure, but make future AI stages form-profile-aware and draft-oriented.
- **Extracted evidence review:** Keep `ExtractedEvidencePanel` as a source-document/session-field review primitive, but rename/reposition it around “Source Fields” or “Extracted Session Details.”
- **Printable report:** Keep the printable HTML route and field-service-specific renderer, but drive sections from approved AI draft snapshots instead of raw capture order.
- **Share/email/report delivery:** Keep report share tokens, email sending, secure links, disabled/expiration/view tracking, and exports table events.
- **Billing gates and usage limits:** Keep active billing checks and usage events for uploads, storage, AI, share links, emails, and printable opens. Add AI draft usage events later.
- **Signatures:** Keep signature capture and rendering, but allow Form Profiles to identify signature areas as report layout hints rather than workflow steps.
- **Template storage infrastructure:** Keep `template_imports`, `documentation-templates`, source file paths, extracted structure JSON, sections/fields/pdf layout/signature requirements as the backbone for Form Profiles.
- **Human review gate:** Keep the delivery gate, but make it “AI Draft approved” rather than “missing required evidence acknowledged.”

## 4. Concepts to Reframe

- **“Templates” -> “Form Profiles.”** A Form Profile is a reusable report context extracted from an uploaded form. It stores title, sections, fields, measurements, signature areas, layout hints, terminology, and source form file.
- **“Workflow template” -> “Report context profile.”** The selected profile informs how the final report should be organized, not what order the technician must inspect.
- **“Required Evidence” -> “Evidence Suggestions,” “Report Coverage,” or “Expected Source Fields.”** Requirements should be advisory and should support draft readiness, not block natural evidence collection.
- **“Checklist progress” -> “Report readiness.”** Readiness should consider identity/source documents, captured evidence quality, AI confidence, unmapped evidence, missing important header fields, unreviewed findings, and approval status.
- **“Template sections” -> “Report output context.”** Sections should guide final report organization and review grouping after capture.
- **“AI Template Draft” -> “Form Profile Draft.”** Imported forms should produce an editable profile draft, not a digital workflow draft.
- **“Generate Anyway” -> “Approve with unresolved items.”** This is clearer and safer than implying CRED can generate a complete regulated inspection without missing evidence.
- **“Evidence Checklist” -> “Coverage Suggestions.”** It can remain as a collapsible advisory panel but should not look like a technician route.

## 5. Concepts to Remove or Hide From Tech Flow

- Forced inspection checklist language from capture and session detail.
- Step-by-step CVIP/general workflow labels in the technician capture path.
- Required-evidence cards displayed above the main capture action.
- “Missing required evidence” as a primary technician blocker during capture.
- Any UI that implies CRED instructs technicians how to inspect or in what order to inspect.
- CVIP-specific “required” labels that imply official CVIP completion or compliance automation.
- Default report generation directly from raw capture order as the main reviewed output.
- Template import copy claiming OCR/AI extraction is already robust when current analyzer is filename/mime-type heuristic only.

## 6. Proposed Data Model Changes

Do not implement immediately. Prefer additive migrations and a compatibility layer first.

### Option A: Add explicit Form Profile and AI Draft tables

#### `form_profiles`

Purpose: organization-level reusable report context.

Suggested columns:

- `id uuid primary key`
- `organization_id uuid not null`
- `name text not null`
- `description text`
- `status text not null default 'active'`
- `current_version_id uuid null`
- `created_by uuid null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

#### `form_profile_versions`

Purpose: immutable-ish analyzed uploaded form version.

Suggested columns:

- `id uuid primary key`
- `form_profile_id uuid not null`
- `organization_id uuid not null`
- `source_import_id uuid null`
- `source_file_path text not null`
- `original_filename text not null`
- `extracted_title text`
- `form_sections jsonb not null default '[]'`
- `field_names jsonb not null default '[]'`
- `measurement_labels jsonb not null default '[]'`
- `signature_areas jsonb not null default '[]'`
- `report_layout_hints jsonb not null default '{}'`
- `terminology_context jsonb not null default '{}'`
- `ai_status text not null default 'pending'`
- `ai_summary text`
- `created_by uuid null`
- `created_at timestamptz not null default now()`

#### `session_source_documents`

Purpose: first-class source document captures. Could reference `capture_items` or own file path.

Suggested columns:

- `id uuid primary key`
- `documentation_session_id uuid not null`
- `organization_id uuid not null`
- `capture_item_id uuid null`
- `document_type text not null` (`work_order`, `registration`, `vin_plate`, `data_plate`, `odometer`, `licence_plate`, `unit_number`, `other`)
- `extracted_fields jsonb not null default '{}'`
- `confidence numeric null`
- `ai_status text not null default 'pending'`
- `review_status text not null default 'unreviewed'`
- `created_by uuid null`
- `created_at timestamptz not null default now()`

#### `ai_report_drafts`

Purpose: AI-generated editable review package for a session.

Suggested columns:

- `id uuid primary key`
- `documentation_session_id uuid not null`
- `organization_id uuid not null`
- `form_profile_version_id uuid null`
- `status text not null default 'draft'` (`draft`, `needs_review`, `approved`, `superseded`)
- `header_fields jsonb not null default '{}'`
- `measurements jsonb not null default '[]'`
- `findings jsonb not null default '[]'`
- `coverage jsonb not null default '{}'`
- `unmapped_evidence jsonb not null default '[]'`
- `confidence numeric null`
- `model text`
- `prompt_version text`
- `generated_at timestamptz`
- `approved_at timestamptz`
- `approved_by uuid null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

#### `ai_report_draft_sections`

Purpose: editable section-level report draft.

Suggested columns:

- `id uuid primary key`
- `ai_report_draft_id uuid not null`
- `organization_id uuid not null`
- `section_key text not null`
- `title text not null`
- `body text`
- `status text null` (`pass`, `fail`, `recommended`, `na`, `needs_review`, `informational`)
- `confidence numeric null`
- `source_capture_ids uuid[] not null default '{}'`
- `source_document_ids uuid[] not null default '{}'`
- `sort_order integer not null default 0`
- `metadata jsonb not null default '{}'`

#### `final_report_snapshots`

Purpose: immutable approved output used for printable/share/email/archive.

Suggested columns:

- `id uuid primary key`
- `documentation_session_id uuid not null`
- `organization_id uuid not null`
- `ai_report_draft_id uuid null`
- `snapshot jsonb not null`
- `html_storage_path text null`
- `pdf_storage_path text null`
- `approved_by uuid null`
- `approved_at timestamptz not null default now()`
- `created_at timestamptz not null default now()`

### Option B: Reuse current tables first

Lower-risk migration path:

- Treat `documentation_workflow_templates` as Form Profiles in UI. Continue using:
  - `source_import_id` as original uploaded form reference.
  - `sections` as report output sections.
  - `fields` as form/header fields.
  - `pdf_layout` as layout hints.
  - `signature_requirements` as signature areas.
  - `recommended_evidence` as suggestions/coverage.
- Stop exposing `required_evidence` as mandatory in technician flow. It can remain for compatibility but be relabeled or ignored in capture UX.
- Use `capture_items.extracted_data` to temporarily flag source document captures, e.g. `{ source_document: { type, status } }`.
- Use `documentation_sessions.suggested_details` and `field_service_details` for extracted source fields until `session_source_documents` exists.
- Use `exports` for report events until `final_report_snapshots` exists.
- Add only `ai_report_drafts` and `ai_report_draft_sections` first if draft review is the most important product gap.

### Recommended approach

Use Option B for Phase 1 copy and UX changes, then add `session_source_documents`, `ai_report_drafts`, and `final_report_snapshots` as additive tables. Add `form_profiles` only when the compatibility layer becomes confusing or when versioning requirements justify it.

## 7. Proposed UI Changes

### Session creation

Current: title, session type, template select.

Target:

- Primary action: **Select Form Profile**.
- Secondary action: **Upload New Form**.
- Copy: “The form profile helps CRED organize the final report. It does not control the order of your inspection.”
- Do not require a profile; allow “No form profile / evidence package.”
- If uploading a new form during session start, save it to organization profiles by default and attach it to the session.
- Keep session type only if it affects billing/report defaults; otherwise de-emphasize behind “Report type.”

### Capture page

Current: required evidence progress above capture, workflow label, capture form, recent captures.

Target:

- Top of page should only show job/session title, Form Profile name, and a simple Done/Review Draft action.
- Main card: **Capture Evidence**.
- Source document shortcuts as optional buttons/chips:
  - Work Order
  - Registration
  - VIN Plate
  - Data Plate
  - Odometer
  - Licence Plate
  - Unit Number
- Natural capture remains unchanged:
  - photo/video/file picker
  - typed/voice note
  - draft preview
  - save
  - retry failed uploads
  - recent captures
- Move coverage suggestions below recent captures or into collapsed “Report coverage suggestions.”
- Do not show “required evidence” counts as primary progress.

### Session detail

Current: session fields, field service details, evidence checklist, signatures, evidence gallery, extracted evidence, reports.

Target:

- Header shows **Report readiness**, not checklist progress.
- Add a source-fields panel:
  - extracted from work order/registration/VIN/data plate/odometer/licence/unit captures
  - confidence and source reference
  - apply/ignore/edit controls
- Evidence feed remains for all photos/videos/notes.
- AI processing status:
  - source document extraction
  - evidence classification/extraction
  - draft generation
- Replace Evidence Checklist with “Coverage Suggestions” or “Unresolved Draft Inputs.”
- Keep signatures but connect them to Form Profile signature areas if available.

### Report page

Current: missing evidence warning, human review gate, delivery actions, iframe preview.

Target:

- Primary page is **AI Draft Review**.
- Sections:
  - Header/source fields
  - Form-profile mapped sections
  - Measurements
  - Findings / failed / recommended / needs-review items
  - Unmapped evidence
  - Signatures
  - Confidence and source references
- Technician can:
  - edit section text
  - move evidence between sections
  - mark pass/fail/recommended/NA when relevant
  - remove irrelevant evidence
  - edit assumptions/defaults
  - approve final report
- Delivery actions stay disabled until draft approval.
- “Open Printable Report” should render approved snapshot, not raw current captures.

### Templates/Form Profiles page

Current: Settings > Templates with import, system templates, organization templates, required evidence, recommended evidence.

Target:

- Rename navigation and headings to **Form Profiles**.
- Import copy: “Upload a form/report CRED can use as report context.”
- Show original uploaded file and extracted profile fields.
- Sections/fields/measurements/signatures/layout hints remain editable.
- Required Evidence becomes “Evidence Suggestions / Coverage Hints.”
- Duplicate button copy: “Create editable copy.”
- System profiles are examples, not inspection workflows.

## 8. AI Pipeline Changes

### Current pipeline

1. Capture uploaded to storage and `capture_items`.
2. User triggers classification manually from session detail.
3. Classifier labels eligible photo captures.
4. User triggers extraction manually.
5. Extractor populates generic structured fields.
6. Extracted evidence panel lets user apply values to session details.
7. Report route renders included captures in report order.

### Target pipeline

1. **Analyze Form Profile once.**
   - Parse uploaded form/PDF/image/DOCX into sections, field names, measurement labels, signature areas, layout hints, terminology, and examples.
   - Store profile version and AI status.
   - Avoid generating technician steps.

2. **Extract session identity/source document fields.**
   - Treat source document captures as a distinct queue.
   - Extract top-section/session fields: work order, customer, VIN, unit, odometer/hour meter, plate, registration owner, manufacturer/model/serial/GVWR/GAWR, date.
   - Write suggestions with source references and confidence.

3. **Classify evidence.**
   - Continue classifying media, but make labels more general and form-profile-aware.
   - Avoid CVIP-specific relevance unless the selected Form Profile is CVIP-like.

4. **Extract measurements/findings.**
   - Extract component, location, measurement, condition, severity, recommendation, and note/transcript context.
   - Preserve original wording and source capture IDs.

5. **Correlate evidence to form context.**
   - Given the Form Profile sections/fields and all captured evidence, map evidence into likely report sections.
   - Identify unmapped evidence, duplicates, low-confidence items, and possible missing source fields.

6. **Generate AI Report Draft.**
   - Produce header fields, section summaries, grouped evidence, measurements, failed/recommended/needs-review items, assumptions/defaults, confidence, and source references.
   - Draft should never claim official compliance; it should propose an editable report package.

7. **Human approval before final report.**
   - Delivery actions unlock only after technician approval.
   - Approval should snapshot the draft so later capture edits do not silently change delivered reports.

### Prompt and safety requirements

- The AI must cite source capture IDs/document IDs for every extracted value and generated finding.
- The AI must use “needs review” when evidence is ambiguous.
- The AI must not invent pass/fail values without source evidence or explicit product default rules.
- If defaults are allowed (for example, unmentioned CVIP items default pass), the draft must label them as assumptions requiring review.
- Source document extraction and report draft generation should be separate model calls for auditability.

## 9. CVIP Example Flow

1. **Upload/save CVIP Form Profile once.**
   - Admin uploads Alberta Commercial Vehicle Record of Inspection Truck/Truck-Tractor form.
   - CRED stores original form and extracts title, information-section fields, inspection item sections, measurement labels, signature areas, and layout hints.
   - The profile is saved as “Alberta CVIP Truck / Truck-Tractor ROI.”

2. **Start session with CVIP profile.**
   - Technician selects the saved CVIP Form Profile.
   - CRED states that the profile helps organize the report package and does not replace the official Alberta CVIP form.

3. **Capture source documents naturally.**
   - Technician captures work order, registration, VIN plate, data plate, odometer/hour meter, licence plate, and unit number in any order.
   - AI extracts top-section identity fields in the background and shows suggested values for review.

4. **Capture brake/tire/failed item evidence naturally.**
   - Technician captures photos/videos/notes for brake measurements, tire tread, defects, repairs, and recommendations as needed.
   - Technician does not have to step through every CVIP item in software.

5. **AI builds review draft around CVIP sections.**
   - Draft maps evidence to CVIP-like sections such as vehicle information, brake evidence, tire evidence, defects, recommendations, and signatures.
   - It references source documents and capture IDs.
   - It highlights failed/recommended/needs-review items.

6. **Technician reviews assumptions.**
   - Tech reviews extracted identity fields, failed/recommended items, NA markings, and any product decision about unmentioned items.
   - If product defaults unmentioned CVIP items to pass, those defaults must be visibly marked for review.
   - If product leaves unmentioned items blank/needs review, the draft should show unresolved coverage.

7. **Approve.**
   - Technician approves the AI Draft after edits.

8. **Generate printable report package.**
   - CRED generates a printable evidence/report package, share link, email delivery, and archive event.
   - Copy must clarify: CRED documents and prepares inspection evidence/report package; it does not replace the official Alberta CVIP form or regulated inspection process.

## 10. Migration Plan

### Phase 1: Rename/reframe UI copy without breaking schema

- Rename visible “Templates” to “Form Profiles” where appropriate.
- Keep database names (`documentation_workflow_templates`, `workflow_template_id`) temporarily.
- Change session creation copy to clarify form/profile is report context.
- Change settings copy from “digital workflow” to “report context.”
- Rename “Required Evidence” labels to “Coverage Suggestions” or “Evidence Suggestions” in UI while keeping existing columns.
- Move required-evidence progress lower/collapsed on capture page.

### Phase 2: Add source document concept

- Add `session_source_documents` or a compatibility marker in `capture_items.extracted_data`.
- Add source document shortcuts on capture page.
- Extract and apply identity/header fields from source documents.
- Add source field review panel to session detail.
- Keep source capture optional and available before/during evidence capture.

### Phase 3: Add AI report draft generation

- Add `ai_report_drafts` and `ai_report_draft_sections`.
- Create server action/job to generate draft from Form Profile + source documents + captures + notes + extracted fields + signatures.
- Add draft status and usage tracking.
- Store source references, confidence, assumptions, and unmapped evidence.

### Phase 4: Refactor report page around draft approval

- Replace current missing-required-evidence gate with AI Draft Review.
- Add edit/move/mark/approve controls.
- Lock delivery actions until draft approval.
- Add `final_report_snapshots` or equivalent snapshot storage.
- Printable route reads approved snapshot first; falls back to current renderer only for legacy sessions/preview.

### Phase 5: De-emphasize required evidence/checklist UI

- Remove hard-coded guided workflow steps from primary technician UX.
- Convert checklist summary to optional “Coverage Suggestions.”
- Ensure CVIP source fields and section context do not appear as a mandated route.
- Audit all copy for “required,” “workflow,” and “checklist” phrasing.

### Phase 6: Improve form-profile import intelligence

- Replace filename/mime heuristic analyzer with real document parsing/OCR/model analysis.
- Extract form title, sections, field labels, measurement labels, signature areas, layout hints, terminology.
- Add versioning and profile review UI.
- Add confidence and review state for imported profile drafts.

## 11. Risks

- **AI hallucinating pass/fail:** The AI may infer inspection outcomes not supported by evidence. Mitigation: source references required, confidence visible, “needs review” default, no final delivery without approval.
- **Regulatory/compliance overpromising:** CVIP and similar workflows are regulated. Copy must say CRED prepares documentation/evidence packages, not official compliance or replacement forms.
- **User trusting unreviewed AI:** Drafts must be visibly unapproved and delivery must remain gated until human approval.
- **Forms vary wildly:** Uploaded forms may contain tables, scans, handwriting, legal language, multi-page layouts, and customer-specific terminology. Mitigation: profile draft review, versioning, and editable extracted structure.
- **Report context mismatch:** Evidence may map to the wrong form section. Mitigation: move/reassign controls and unmapped evidence review.
- **Storage/AI cost:** Source document extraction, media extraction, form analysis, and draft generation can be expensive. Mitigation: usage limits, batching, background jobs, reuse analyzed Form Profiles, and only regenerate drafts when needed.
- **Old template/checklist code creating confusion:** Database/API names and hidden helper functions may continue to leak workflow-first assumptions. Mitigation: compatibility layer, phased copy audit, and eventual schema cleanup.
- **Delivery snapshot drift:** Reports generated from mutable captures can change after delivery. Mitigation: final report snapshots.
- **Video evidence limitations:** Current video handling stores a reference and does not extract frames/transcripts. Draft quality may be lower for video until frame/audio extraction exists.
- **Manual trigger bottleneck:** Current classification/extraction actions are user-triggered. Background AI processing will need queueing, retry, idempotency, and visible job status.

## 12. Copy Guardrails

### Use

- Form Profile
- Report Context
- Evidence Capture
- Source Documents
- AI Draft
- Human Review
- Report Readiness
- Coverage Suggestions
- Printable Report
- Report Package
- Secure Share Link
- Approved Report Snapshot

### Avoid

- CRED completes official CVIP
- automated compliance
- replaces regulated inspection form
- fully automatic inspection
- required inspection workflow
- mandatory checklist completion
- CRED tells you how to inspect
- pass/fail guaranteed by AI
- official regulatory approval

### Example safe copy

- “This Form Profile helps CRED organize your final report. It does not control the order of inspection.”
- “AI Drafts must be reviewed and approved before delivery.”
- “CRED helps document evidence and prepare a report package. It does not replace regulated inspection forms or procedures.”
- “Coverage suggestions are reminders only. Capture evidence in the order that matches your work.”

## 13. Recommended Next Codex Tasks

1. **Copy-only Form Profile reframe:** Rename user-facing Templates/Workflow copy to Form Profiles/Report Context while leaving schema untouched.
2. **Capture page simplification:** Move required evidence progress into a collapsed advisory panel below Recent Captures and update copy to “Coverage Suggestions.”
3. **Source document capture shortcuts:** Add optional source document buttons/chips that tag captures without forcing a sequence.
4. **Source field review panel:** Reframe `ExtractedEvidencePanel` into extracted source/session fields with apply/ignore/edit affordances.
5. **AI Draft schema migration:** Add `ai_report_drafts` and `ai_report_draft_sections` with RLS and TypeScript database type updates.
6. **Draft generation server action:** Implement a first draft generator that groups existing captures into form-profile sections with confidence and source references.
7. **Report page draft approval:** Replace missing-required-evidence review with AI Draft Review and approval status.
8. **Printable snapshot support:** Add approved final report snapshots and update printable/share/email routes to read snapshots first.
