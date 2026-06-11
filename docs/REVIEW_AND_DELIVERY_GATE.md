# Review and Delivery Gate

CRED requires a final human review before report delivery because capture, AI classification, extraction, and report generation can still need technician judgment. The gate keeps draft work editable while preventing a customer-facing report from being emailed, shared, saved as a final export, or opened as the final printable output before a person confirms the report is ready.

## Actions that require review

A documentation session must have `review_status = 'ready_for_delivery'` before these delivery actions are available:

- Email Printable Report
- Create Share Link
- Save Report
- Open Printable Report when used as the final printable/exported report

If the report is still in `draft`, the report page shows: “Review and mark this report ready before delivery.” Server actions also enforce this check so bypassing the UI cannot deliver a draft report.

## What remains editable before review

Before marking a report reviewed, users can continue normal internal work:

- Capture more evidence
- Edit capture notes
- Apply AI suggestions and extracted details
- Update field service report details
- Capture or update signatures
- Return to the session page for internal edits
- Preview the report in the embedded preview area without recording a final delivery/export

## Review checklist

The report page asks the reviewer to confirm:

- Required evidence reviewed
- AI extracted details reviewed
- Included captures reviewed
- Signatures reviewed if required

When the reviewer selects **Mark Report Reviewed**, CRED records:

- `review_status = 'ready_for_delivery'`
- `reviewed_at`
- `reviewed_by`

## Missing evidence acknowledgement

Required evidence warnings stay visible. If required evidence is missing, CRED does not silently mark the report ready. The reviewer must explicitly acknowledge that the report is missing required evidence and that they want to generate anyway before the report can be marked reviewed.

That acknowledgement is collected in the review form and the reviewed timestamp/profile are recorded on the session. Delivery remains blocked until the acknowledgement is made and the report is marked reviewed.
