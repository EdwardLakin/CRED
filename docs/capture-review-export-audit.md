# Capture → Review → Export Audit

## Status fields used

- Session cards now derive their badge and primary action from `documentation_sessions.archived_at`, `documentation_sessions.review_status`, and `documentation_sessions.status`, in that order.
- `archived_at` makes the session archived.
- `review_status = ready_for_delivery` or `status = finalized` makes the session ready for export/open report.
- `status = review` or `review_status = review_required` makes the session review required.
- All other non-archived states are treated as capturing.

## Source of each count

- Dashboard and Recent Sessions evidence counts come from active `capture_items` rows filtered by `organization_id`, `documentation_session_id`, and `deleted_at is null`.
- Capture page Recent Captures count comes from the same active `capture_items` query for the current session.
- Review included evidence counts are based on active captures that remain `include_in_report = true` after technician review edits.
- Export appendix content is based on the reviewed capture set and should include each included active capture once.

## Source of export content

- Technician-entered `capture_items.technician_note` is the source of truth for capture notes in Review and Export.
- `documentation_sessions.final_notes` is the reviewed final-notes source for export; export/PDF should not regenerate AI content.
- Approved report structure, when present, comes from the selected approved/non-superseded `ai_report_drafts` rows and their visible `ai_report_draft_sections` rows.
- Asset/customer sections should render session/customer/asset fields and reference documents only, not duplicate supporting evidence sections.

## Audit findings and fixes applied

- Removed the Capture page AI-guided progress panel and all readiness/completeness/confidence/critical/missing/next-step metrics from the Capture UI.
- Session card badges previously rendered raw `documentation_sessions.status`, so sessions with `review_status = ready_for_delivery` could still display Review Required when `status` stayed `review`.
- Session card actions previously used a mixture of `status` and `review_status` but labels did not match the simplified Capture → Review → Export states.
- Completing capture no longer auto-generates a report draft when organization AI Assist is off; it only moves the session to review.

## Known remaining issues

- Review and Export still support legacy `ai_report_drafts` so historical sessions can be opened; this should be kept quarantined from Capture and never shown as readiness percentages.
- The Review page still includes controls for manually generating final notes; if the product decides AI Assist Off must disable all text generation, that action should be gated next.
- PDF/export rendering should continue to be regression-tested with real sessions containing photos, notes, reference documents, and edited final notes to verify no duplicated sections are reintroduced.
