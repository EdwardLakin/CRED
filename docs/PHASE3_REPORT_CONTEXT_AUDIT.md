# Phase 3 Report Context Audit

## Goal

Technician-facing capture should not require a report/session/workflow/documentation type choice. CRED may retain internal classification fields for compatibility, routing, billing, and specialized report generation, but forms and evidence should determine the report context automatically.

## Required internal usages retained

- `documentation_sessions.session_type` remains in database reads/writes as a compatibility and routing field.
- `documentation_sessions.workflow_template_id` and `documentation_workflow_templates` remain as internal Form Profile/template storage names.
- Diagnostic procedure and field-service routes still use internal metadata to preserve specialized report capabilities.
- PDF/report generation still accepts normalized session context internally, but the generated cover no longer exposes a report type row.

## Optional / advanced usages

- Advanced report editing remains available for headings, report text, fields, evidence inclusion, and report title.
- Internal classification appears in code and structured metadata only; it should not be presented as a technician decision in the normal dashboard → new session → capture → review → export path.

## Legacy usages identified

- Session creation previously normalized an empty `session_type` into `General Evidence Report`; this is retained internally for existing records and evidence-only fallback.
- Review edit forms previously exposed `Report Type` selects; these have been removed from the technician report review flow.
- Export copy previously emphasized “Export Report” and “Download PDF Report”; it now focuses on exporting documentation and downloading/sharing/emailing the approved output.
- PDF output previously exposed a “Report type” metadata row and form blueprint/system wording; this now uses professional report language around form details and supporting evidence.

## Remaining visible complexity

- Settings/admin Form Profile screens still use legacy table-backed concepts in implementation and may mention templates where appropriate for management.
- Diagnostic procedure workspaces intentionally keep procedure-specific terminology because those are specialized, technician-owned documentation tools.
- Source code and schema names still contain `workflow_template`, `session_type`, and `documentation_workflow_templates` for backward compatibility.
