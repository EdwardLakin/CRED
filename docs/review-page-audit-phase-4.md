# Review Page Audit — Product Simplification Phase 4

## Scope

Audited the Review route and related in-page report components in `app/dashboard/sessions/[id]/report/page.tsx`.

## Current visible inventory before simplification

| Item | Classification | Phase 4 disposition |
| --- | --- | --- |
| Review page title and readiness pill | Report Management | Kept, renamed around the finished report and made secondary to the report title. |
| Edit Report link | Report Editing | Kept as the single entry point for edit mode. |
| Status toasts | Report Management | Kept for feedback only. |
| Report cover card | Report Content | Kept and prioritized near the top of the page. |
| Capture summary metrics | Internal/Technical | Removed from default view because counts make Review feel like capture management. |
| Empty report preparation card | Report Management | Reworded to customer-friendly report preparation language. |
| Report information metadata | Report Editing / Management | Kept collapsed and editable only through Edit Report. |
| Findings, recommendations, notes, supporting evidence | Report Content | Kept open and renamed to customer-ready language. |
| Evidence appendix | Report Content | Kept as support for the report, with implementation-style evidence IDs hidden. |
| Advanced section/field editing | Report Editing | Kept only in Edit Report mode. |
| Evidence inclusion and deletion controls | Report Editing | Kept only in Edit Report mode. |
| Final notes editor | Report Editing | Moved behind Edit Report mode. |
| Inspector / organization and signature panel | Report Content / Editing | Reframed as Report Signature; signature editing controls only appear in Edit Report mode. |
| Approval panel | Report Management | Simplified to one Approve Report action and customer-readiness language. |
| Export panel | Report Management | Reframed as delivery; Download PDF is primary, Email/Share Link/Preview/Save are under More Delivery Options. |
| Share token list | Report Management | Kept under delivery because existing links still need control. |

## Mobile review audit and recommendations

- The default Review page now stacks around report content first: title, cover, findings/recommendations, evidence, signature, approval, delivery.
- Editing density remains intentionally high only after the user taps **Edit Report**.
- Remaining mobile noise risk: the evidence appendix can still become long for sessions with many captures. A future pass should add a compact photo strip or section jump list without hiding report content.
- Remaining mobile noise risk: existing share links can add long URLs in the delivery area. A future pass should display recipient/date labels by default and reveal raw URLs on tap.

## Remaining complexity inventory

- Diagnostic procedure reports still expose procedure completeness and capture coverage language because that specialized path has sign-off requirements. It should receive a separate report-first pass.
- Report Information remains available as a collapsed section for exported metadata accuracy.
- Save in CRED and Preview remain in delivery options for existing workflows, but are no longer primary actions.
- Evidence inclusion, deletion, raw field editing, and final note generation remain available only in Edit Report mode.
