# Evidence Workspace Security and Regression Audit

## Summary

This audit covered Evidence Library, Timeline, Entities, Factual Observations, Relationships, Deliverables, and Suggestions with emphasis on tenancy safety, provenance integrity, deleted-record handling, route/server-action access checks, and regression protection for the existing capture/review/generate/approve/export workflow.

## Findings and fixes applied

- **Suggestion review bypass hardening:** Suggestion review now loads the target suggestion as an AI suggestion in the authenticated session and organization, requires `review_status = 'suggested'`, and applies the same suggested-state filter to the update. This prevents direct review actions from re-reviewing accepted/rejected records or reviewing user/system records through the suggestions endpoint.
- **Relationship suggestion endpoint validation:** Relationship suggestions must now prove their source and target endpoint records exist, are not deleted, and belong to the same session and organization before accept/edit/reject review can proceed.
- **Deliverable determinism hardening:** Deliverable source identifiers are now deduplicated and sorted. Chronology ties fall back to ID ordering, and evidence index generation applies a stable captured-date/ID sort before rendering and source-id collection.
- **Regression coverage:** Added audit tests covering tenancy/deleted-record patterns, relationship integrity, suggestion safety, deliverable determinism/provenance, and existing capture/report workflow entry points.

## Verified controls

- **Organization scoping:** Evidence loaders and mutation paths filter by the authenticated profile organization.
- **Session scoping:** Evidence loaders and mutation paths filter by the requested documentation session.
- **Deleted records:** Evidence workspace source queries and relationship endpoint checks filter `deleted_at is null`.
- **Relationship integrity:** User-created relationship paths load both endpoints from the same session and organization before insert; suggestion relationships now receive the same endpoint validation during review.
- **Suggestion safety:** AI-created suggestions default to `suggested`; no generated AI suggestion is accepted automatically.
- **Deliverable integrity:** Deliverable generation uses session/organization-scoped source data and filters deleted records from all source tables.
- **Provenance:** Suggestion, relationship, and deliverable provenance fields remain preserved and source evidence/source IDs remain represented.

## Risks remaining

- Static audit tests verify code-level guardrails but do not exercise a live Supabase RLS policy matrix. A follow-up integration suite against a seeded Supabase test database would provide stronger assurance.
- Duplicate relationship behavior depends on database constraints and insert error handling in some paths. The current application avoids cross-workspace links, but a dedicated duplicate-relationship UX/constraint review is recommended.
- Manual browser walkthrough of camera/PDF/note capture and PDF export was not performed in this non-interactive environment; automated entry-point regression coverage was added instead.

## Recommendations

- Add seeded integration tests that attempt cross-organization and cross-session reads/writes with real Supabase RLS enabled.
- Add database-level uniqueness constraints for active relationships if not already present, scoped to non-deleted rows.
- Add end-to-end browser coverage for photo capture, PDF upload, note capture, report generation/edit/review/export, and inspection workflow navigation.
