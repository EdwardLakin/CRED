# CRED Usage Limits

CRED uses MVP usage guardrails to protect margin before broader public acquisition. These limits are enforced by plan and are intentionally simple.

## Plan limits

| Plan | Storage | AI actions / month | Capture file size | Video file size | Email sends / month | Active share links |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Individual ($39/month) | 5 GB | 200 | 25 MB | 50 MB | 50 | 25 |
| Team ($99/month) | 25 GB | 1,000 | 50 MB | 100 MB | 250 | 100 |
| Shop ($199/month) | 100 GB | 5,000 | 100 MB | 100 MB | 1,000 | 500 |

Individual video uploads are described as **short clips only** in product copy. Shop video uploads are currently capped at 100 MB because the current app and storage-bucket path already use a 100 MB safe maximum. Do not advertise 250 MB shop video uploads until the bucket and upload flow are safely updated and tested.

## What counts as an AI action

Each AI classification counts as one AI action.

Each AI extraction counts as one AI action.

For batch actions, CRED checks the number of captures queued for the batch before calling AI. If the batch would exceed the monthly plan allowance, the action is blocked before expensive AI work starts.

## What counts as storage

For MVP accounting, storage is approximate and append-only:

- Capture uploads record `storage_bytes_added` using the uploaded file size.
- Template imports record `storage_bytes_added` using the imported file size.
- Signature captures record `storage_bytes_added` using the generated signature image size.

Deletion reconciliation is intentionally deferred. Removing evidence or disabling a link does not subtract prior storage events yet.

## What happens when limits are reached

CRED blocks actions with friendly messages:

- AI classification or extraction over the monthly limit: `AI usage limit reached for this month.`
- Storage over the plan limit: `Storage limit reached for your plan.`
- Oversized upload: `This file is larger than your plan allows.`
- Email send over the monthly limit: `Email send limit reached for this month.`
- Active share link over the plan limit: `Share link limit reached for this plan.`

## Tracked usage events

The usage ledger stores events in `organization_usage_events` for:

- `ai_classification`
- `ai_extraction`
- `capture_uploaded`
- `storage_bytes_added`
- `email_report_sent`
- `share_link_created`
- `printable_report_opened`
- `template_imported`
- `signature_captured`

## Overage billing

Overage billing is intentionally deferred. The MVP behavior is to block actions that would exceed the current plan allowance and prompt the customer to upgrade or reduce usage later.
