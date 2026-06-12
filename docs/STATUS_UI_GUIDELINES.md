# Status UI Guidelines

CRED status UI should feel calm, professional, and operational. Draft or incomplete workflow states are normal product states, not failures.

## Status color rules

- **Danger / red**: reserve for actual errors or blocked actions, such as failed uploads, failed AI processing, failed email delivery, permission denied, expired billing or trial access, and actions the system refuses to complete.
- **Attention / soft amber**: use only when a user should review something, such as unresolved optional coverage suggestions, delayed processing, or evidence that needs review or retry.
- **Neutral / gray or blue**: use for normal workflow states, such as draft, not started, awaiting review, report not delivered yet, processing, ready, and disabled delivery actions before draft approval.
- **Success / green**: use for completed or approved states, such as extracted evidence ready for review, approved AI Drafts, sent email, generated share link, or saved printable reports.

## Copy examples

Use calm workflow copy:

- `Report status: Draft`
- `Report status: Awaiting review`
- `AI Draft: Not started`
- `Awaiting review`
- `Approve the AI Draft to unlock delivery.`
- `Available after draft approval.`

Avoid failure-oriented copy for normal draft states:

- Avoid `Report delivery: Needs report review` for ordinary drafts.
- Avoid `AI draft Not generated`; use `AI Draft: Not started`.
- Avoid repeating `Review and approve this report draft before delivery.` in every delivery card.

## Coverage suggestions

Coverage suggestions are optional reminders unless a hard product rule says otherwise. Present them as advisory, not as a blocking failure.

Preferred copy:

- `Coverage suggestions available`
- `These suggestions are optional reminders. You can capture more evidence or approve the draft as-is.`

The `Approve with unresolved items` action may remain available, but it should use normal primary or neutral button styling rather than warning styling.

## Printable report naming guidance

CRED currently opens printable HTML reports and records report events. Do not call these events PDFs unless a real PDF file is generated and stored or returned.

Preferred event labels:

- `Printable report opened`
- `Printable report saved`
- `Printable report emailed`

Only use `PDF generated` when a true PDF file exists.
