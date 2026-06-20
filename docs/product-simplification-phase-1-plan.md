# CRED Product Simplification Phase 1 — Capture First Plan

Date: 2026-06-20

## Product thesis

CRED should optimize the technician path around: **Capture anything. Generate everything.** The primary workflow should be:

1. Dashboard
2. New Session
3. Capture Evidence
4. Done
5. Review Report
6. Approve
7. Export

This plan documents the affected implementation before broad refactors. The intent is to reduce visible decisions and management language in the technician experience while preserving existing enterprise/admin capabilities.

## Priority 1 — Remove report type selection before capture

### Current alignment

- The dashboard already has a fast path where **New Session** posts directly to `createQuickCaptureSession`, which creates a default session and redirects to capture.
- The dedicated `/dashboard/sessions/new` route still presents **Set up session**, requires **Report Type**, and says the selection is the report source of truth before capture.
- Session creation already supports an empty form and falls back to the default report type, so the data layer can support immediate capture without a user-facing choice.

### Affected routes and components

- `app/dashboard/page.tsx` — primary New Session fast path.
- `app/dashboard/sessions/new/page.tsx` — report type and metadata setup screen to remove or repurpose.
- `src/features/sessions/actions.ts` — `createDocumentationSession` and `createQuickCaptureSession` default creation behavior.
- `src/features/sessions/report-types.ts` — default report type, legacy mapping, and optional metadata fields.
- `app/dashboard/sessions/[id]/capture/page.tsx` — first destination after session creation.
- `app/dashboard/sessions/[id]/report/page.tsx` — later optional report context adjustment.

### Migration path

1. Keep `documentation_sessions.session_type` required/compatible at the database and domain level by continuing to save `General Evidence Report` when no context has been inferred.
2. Convert `/dashboard/sessions/new` into a redirect or one-button fallback that calls quick capture; do not present report/session type fields to technicians.
3. Preserve report type editing only inside review, preferably under **Edit Report**.
4. Continue normalizing legacy values through `normalizeReportType` so historical sessions remain valid.
5. Add future inferred context fields in draft/report structure metadata rather than forcing a pre-capture classification step.

## Priority 2 — Review should be report-first

### Current alignment

- The report page header already says CRED prepared a report from evidence and exposes approve/export actions.
- However, the default review still mixes professional report reading with management concepts: report metadata, capture summary metrics, evidence diagnostics, raw section editing, source fields, reference document details, and export mechanics.
- The review body contains useful customer-facing report material, but it is not yet clearly separated from administrative/editing controls.

### Proposed simplified structure

Default review should show:

1. **Report Preview** — title, facility/inspector identity, report summary.
2. **Findings** — generated or form-derived findings.
3. **Recommendations** — only supported recommendations.
4. **Photos** — report-included evidence with captions.
5. **Notes** — technician notes and voice-note text.
6. **Form Fields** — extracted or captured form values.
7. **Signatures** — inspector/customer signatures and approval identity.
8. **Approve** — primary action.
9. **Export** — visible after approval, or present but clearly disabled until approval.

Move behind **Edit Report**:

- Report type selection.
- Session/report metadata fields.
- Raw section title/body editing.
- Include/exclude section controls.
- Source field entries.
- Source/reference document internals.
- Evidence diagnostics and capture coverage counts.
- Processing/generation metadata.
- Advanced diagnostic procedure controls.

### Affected files

- `app/dashboard/sessions/[id]/report/page.tsx` — primary review layout, generated report review, approval panel, export panel.
- `src/features/reports/components/FinalNotesEditor.tsx` — should be framed as report notes, not generated notes.
- `src/features/reports/components/PdfDownloadButton.tsx` — export CTA language.
- `src/features/reports/report-document.ts` — trust statement and evidence model used by review/PDF.
- `src/features/reports/report-structure.ts` — section normalization and source/field grouping.
- `src/features/reports/actions.ts` — report generation, editing, approval, final notes, export gating.

## Priority 3 — Hide AI implementation language

### Visible terminology inventory and recommended replacements

| Current visible/internal-facing term | Recommended technician-facing term |
| --- | --- |
| AI Draft | Report |
| Draft evidence preview | Evidence preview |
| Queued for AI | Saved |
| Analyzing / Processing evidence | Preparing |
| AI complete | Report details ready |
| AI unavailable — manual review available | Needs attention |
| AI retry needed | Needs attention |
| Extraction complete / extracted | Details ready |
| Classification | Type/details |
| Confidence / confidence warning | Needs attention |
| OCR status | Text capture status / Details |
| Coverage analysis / evidence diagnostics | Report checklist / Suggestions |
| Source references / source capture IDs | Supporting evidence |
| Model metadata / prompt version | Hide from technician UI |
| Processing metadata | Hide from technician UI |
| Generate AI Draft | Prepare Report |
| Generate Final Notes | Prepare Notes |

### Affected files

- `src/features/capture/types.ts` — capture processing labels currently expose AI states.
- `src/features/capture/components/AddCaptureForm.tsx` — upload status, draft preview wording, retry messaging.
- `src/features/capture/components/RecentCapturesList.tsx` — status badge rendering.
- `src/features/capture/components/ProcessPendingEvidenceButton.tsx` and `ClassifyPendingCapturesButton.tsx` — process/retry language.
- `src/features/capture/components/ExtractedEvidencePanel.tsx` and `CaptureList.tsx` — source/confidence/classification panels.
- `app/dashboard/sessions/[id]/report/page.tsx` — review diagnostics, source fields, advanced editing labels.
- `src/features/reports/components/FinalNotesEditor.tsx` — generated notes language.
- `docs/STATUS_UI_GUIDELINES.md` — should be updated after UI copy changes.

## Priority 4 — Separate technician experience from admin experience

### Current alignment

- Primary navigation has **Dashboard** and **Recent**, which matches the technician workflow.
- The same navigation also exposes **Settings** and **Billing** under Management to all dashboard users.
- Templates are mostly under settings, but `app/dashboard/templates/page.tsx`, billing, archived sessions, internal/admin-only template tooling, diagnostics, and diagnostic procedure workspace can still surface near technician flows.

### Proposed separation

Technician navigation:

- Dashboard
- Recent Sessions
- Account only if necessary for identity/sign-out/theme

Admin/workspace navigation:

- Templates
- Billing
- Organization Settings
- Workspace Configuration
- Audit Logs
- Diagnostics
- Advanced Report Controls
- Team Management
- Archived Sessions

Implementation approach:

1. Keep admin routes intact.
2. Gate admin navigation by role/capability.
3. Move non-technician links out of the persistent technician nav into an admin/settings area.
4. Keep technician session detail actions limited to capture/review/export; move diagnostic procedure workspace and archive behind advanced/admin affordances unless the session is already diagnostic-procedure-mode.

### Affected files

- `app/dashboard/DashboardNavigation.tsx`
- `app/dashboard/layout.tsx`
- `app/dashboard/settings/page.tsx`
- `app/dashboard/settings/templates/page.tsx`
- `app/dashboard/settings/archived-sessions/page.tsx`
- `app/dashboard/templates/page.tsx`
- `app/dashboard/billing/page.tsx`
- `app/dashboard/sessions/[id]/page.tsx`
- `src/features/sessions/data.ts` for role/capability helpers.
- `src/features/team.ts` for team/admin capabilities.

## Priority 5 — Forms determine context

### Current alignment

- The report generator already gives uploaded forms/source documents priority and explicitly does not require a form type selection.
- The UI still asks for report type before capture in the new-session route and later exposes report type selectors in review/editing.
- Capture supports source document metadata, but the general capture flow does not ask technicians to classify work before capture.

### Manual classification points to reduce

- `/dashboard/sessions/new` report type selector.
- Review page report type selectors.
- Diagnostic procedure workspace entry point when presented as a normal session action.
- Source document type options if they become mandatory in any path.
- Evidence role selection for diagnostic attachments, which should remain contextual/advanced rather than part of general capture.

### Recommendations

1. Let the first captured form/document establish report context during report preparation.
2. Prefer inferred labels like “Inspection sheet” or “Damage report” from captured document content over pre-capture type selection.
3. Store inferred context as review-adjustable metadata, not as a required session setup field.
4. Keep explicit report type adjustment available under **Edit Report** for edge cases and admin correction.
5. Do not implement risky new inference in Phase 1 beyond hiding the manual choice and preserving fallback defaults.

## Priority 6 — Done should prepare report

### Current alignment

- Capture **Done** links to the report page.
- The report page may still require a manual **Prepare Report** action when no current report exists.
- Capture saves trigger background processing, and Done blocks while local uploads are still pending.

### Recommended simplest path

1. Capture Evidence.
2. Done.
3. If possible, start report preparation automatically.
4. Show Review Report when ready; otherwise show calm **Preparing report** state.
5. Keep **Prepare Report** only as a fallback/retry inside **Edit Report** or a recovery card.

### Affected files

- `src/features/capture/components/AddCaptureForm.tsx` — Done handling and status copy.
- `app/dashboard/sessions/[id]/capture/page.tsx` — Done destination.
- `app/dashboard/sessions/[id]/report/page.tsx` — auto-prepare state and fallback action.
- `src/features/reports/actions.ts` — existing `prepareReportForSession` and `generateAiReportDraft` server behavior.
- `app/api/internal/capture-processing/tick/route.ts` and capture processing worker files — background readiness constraints.

### Risk note

Server actions invoked from a page render can be risky if they mutate during GET. Prefer a small explicit POST/route handler, transition page, or client effect with idempotency to start preparation after Done.

## Priority 7 — Continue PDF professionalization

### Constraint

Do not change Puppeteer, Chromium, Vercel tracing, or PDF runtime infrastructure in this phase.

### Customer-impact recommendations

High impact:

1. Make the PDF read as a authored report first: cover/title, customer/asset/date, summary, findings, recommendations, photos, notes, signatures.
2. Remove duplicate evidence and repeated metadata between summary sections and appendices.
3. Improve evidence presentation with consistent photo sizing, captions, and page-break behavior.
4. Present approval clearly with reviewer, date, and signatures.
5. Keep source/reference documents in an appendix unless they are the form that defines the report.

Medium impact:

1. Tighten typography hierarchy: fewer card-like UI artifacts, more document-style headings.
2. Normalize spacing between sections and evidence groups.
3. Standardize empty/not-provided field treatment to avoid visual noise.
4. Ensure inspector/facility information appears once in a predictable location.

Lower impact:

1. Add subtle running header/footer if not already present.
2. Add page numbers and export timestamp if customer-facing and not duplicative.
3. Refine wording in trust/safety statements to be professional but not defensive.

### Affected files

- `src/features/reports/export/pdf-generator.ts` — only report HTML/CSS quality areas, not runtime infrastructure.
- `src/features/reports/report-document.ts` — document model and trust statement.
- `src/features/reports/export/filenames.ts` — exported report naming.
- `app/api/dashboard/sessions/[id]/report-pdf/route.ts`
- `app/api/dashboard/sessions/[id]/report-pdf/download/route.ts`

## Recommended implementation order

1. **Copy and navigation quick wins**: replace AI/process labels with outcome language; hide management nav from technician flow where role permits.
2. **New Session simplification**: remove pre-capture report type UI and route all New Session entry points through quick capture.
3. **Done-to-review flow**: make Done begin or request report preparation automatically with an idempotent fallback.
4. **Report-first review layout**: separate report reading from **Edit Report** advanced controls.
5. **Admin separation**: consolidate templates/billing/settings/team/audit/diagnostics into admin navigation.
6. **PDF report quality pass**: improve document hierarchy and evidence presentation after the review model is simplified.
7. **Context inference enhancements**: later phase; avoid risky inference changes until the simplified workflow is stable.

## Risks and migration considerations

- Historical sessions may have specific `session_type` values; keep normalization and legacy mapping.
- Existing reports may rely on `session_metadata`; do not remove fields, only move them behind edit/review affordances.
- Auto-preparing reports can increase AI usage and cost if not idempotent and gated by billing/usage limits.
- Background processing may not be complete when the user taps Done; review needs a graceful preparing state.
- Admin users still need templates, billing, diagnostics, and advanced controls; hiding from technicians must not remove routes or permissions.
- Diagnostic procedure workflows have compliance/safety constraints; simplify their visibility but preserve sign-off and audit requirements.
- PDF quality changes should avoid the known fragile PDF runtime infrastructure.

## Quick wins vs larger architectural work

### Quick wins

- Change visible labels from AI/process terminology to outcome terminology.
- Redirect or simplify `/dashboard/sessions/new`.
- Move report type selectors into collapsed **Edit Report** sections.
- Collapse evidence diagnostics/source details by default.
- Rename **Generate Final Notes** to **Prepare Notes**.
- Remove **Diagnostic Procedure Workspace** from the default session detail action row unless applicable.

### Larger work

- Idempotent Done-triggered report preparation.
- Full report-first review restructuring.
- Role-aware admin navigation and admin shell.
- Context inference from forms/documents with confidence-safe review adjustments.
- PDF document-design pass after the report model stabilizes.

## Proposed Phase 1 execution plan

1. Ship low-risk language changes and hide AI implementation terms.
2. Make quick capture the only technician New Session path.
3. Convert report review to default read mode, with **Edit Report** revealing advanced controls.
4. Add an idempotent report preparation trigger for the Done path.
5. Separate technician/admin navigation without deleting admin routes.
6. Run regression checks on capture, review, approval, export, and PDF download.
7. Defer new automatic inference and deep PDF redesign to a follow-up phase after Phase 1 UX simplification is validated.
