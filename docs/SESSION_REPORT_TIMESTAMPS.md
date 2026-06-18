# Session and Report Timestamp Authority

CRED displays lifecycle dates from purpose-specific timestamps so historical evidence sessions keep their original chronology after edits, migrations, or metadata updates.

## Authoritative timestamps

| Purpose | Authoritative source | Notes |
| --- | --- | --- |
| Session creation / Capture Session Date | `documentation_sessions.created_at` | The date the evidence session originally started. Session cards, report review metadata, and printable evidence report dates use this value. A future user-selected inspection date can supersede this in report templates when implemented. |
| Session modification / Last Updated | `documentation_sessions.updated_at` | The date session metadata or lifecycle state last changed. This is shown as secondary lifecycle metadata only and must not be the primary session date. |
| Report approval | `documentation_sessions.reviewed_at` for session-level delivery approval; `ai_report_drafts.approved_at` for approved AI draft records | The review gate currently records `reviewed_at` / `reviewed_by` on the session. AI draft approval records `approved_at` / `approved_by` on `ai_report_drafts`. |
| Report export | `exports.created_at` for each export/open event | The `exports` table stores export lifecycle events with `export_type`, `status`, and metadata. There is no single `documentation_sessions.exported_at` column; add one only if the product needs a denormalized latest-export timestamp. |

## Current model coverage

- `documentation_sessions` has `created_at`, `updated_at`, `reviewed_at`, and `reviewed_by`.
- `ai_report_drafts` has `approved_at`, `approved_by`, `created_at`, and `updated_at`.
- `exports` has `created_at` and should be treated as the export timestamp for each generated/opened export record.

## Future lifecycle additions

If reports need first-class lifecycle tracking beyond event rows, add nullable columns to the appropriate report/session table rather than overloading `updated_at`:

- `documentation_sessions.exported_at` or a dedicated report table's `exported_at` for latest successful export.
- `documentation_sessions.inspection_date` for a user-selected inspection date that should appear on reports instead of `created_at`.
- Keep approval/review timestamps separate from export timestamps.
