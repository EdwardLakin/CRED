# AI Report Drafts

AI Report Drafts are the Phase 3 evidence-first report layer. They organize captured evidence into an editable, human-reviewable report draft after the technician is done capturing.

AI Drafts do **not** replace the printable report renderer yet, and they are **not** final immutable report snapshots.

## Data model

Phase 3 adds two additive tables:

- `ai_report_drafts`: one generated draft for a documentation session, including title, summary, header fields, measurements, findings, coverage, unmapped evidence, confidence, model metadata, generation timestamps, and approval metadata.
- `ai_report_draft_sections`: ordered draft sections belonging to a draft, including section key, title, body, status, confidence, source capture IDs, sort order, and metadata.

Allowed draft statuses are:

- `draft`
- `needs_review`
- `approved`
- `superseded`

Allowed section statuses are:

- `pass`
- `fail`
- `recommended`
- `na`
- `needs_review`
- `informational`
- `null`

Row Level Security is enabled. Authenticated organization members can select their organization drafts and sections. Organization members can insert, update, and delete drafts or sections only for documentation sessions in their organization. Anonymous users have no access.

## How drafts are generated

The report page exposes **Generate AI Draft**. The server action requires authenticated session/workspace access, active billing or trial access, and an available AI usage allowance.

Generation loads:

- documentation session fields
- selected Form Profile / workflow template when present
- non-deleted captures
- source document metadata and identity/header fields from `extracted_data.source_document` / extraction fields
- capture classifications and extraction fields from `extracted_data`
- technician notes and transcripts
- signatures when available

The OpenAI helper at `src/lib/openai/report-draft-generator.ts` sends this context to the Responses API and requests strict JSON. The prompt requires the model to avoid unsupported facts, avoid claims of official compliance completion, use `needs_review` when uncertain, and organize around Form Profile sections where reasonable.

Older non-approved drafts for the same session are marked `superseded` when a new draft is created.

## Source capture references

Sections include `source_capture_ids` so technicians can trace a draft statement back to the captured Evidence that supports it. The generator validates source IDs against the captures supplied to the model and drops unknown IDs.

A section without source capture references is displayed as requiring review before relying on it.

## Approval behavior

The report page shows **Review Draft** and **Approve Draft** controls.

Approving an AI Draft:

1. sets the draft `status` to `approved`
2. records `approved_at` and `approved_by`
3. sets `documentation_sessions.review_status` to `ready_for_delivery`
4. records `reviewed_at` and `reviewed_by`
5. supersedes other non-approved drafts for the same session

Existing delivery actions remain gated by `documentation_sessions.review_status`. Therefore, approval of an AI Draft unlocks existing printable, email, share, and save actions without changing delivery infrastructure.

## Limitations

- AI Drafts are prepared from captured evidence and notes. Human Review Required before delivery.
- The printable report renderer is not replaced in Phase 3.
- Final immutable report snapshots are intentionally deferred.
- Inline editing, section moves, merge controls, and source-reference editing are not implemented yet.
- The draft must not be treated as automatic compliance, official inspection completion, or a replacement for required jurisdictional forms.

## Future edit/move controls

Planned review controls include:

- inline section title/body editing
- drag/drop or explicit sort-order movement
- merge/split sections
- status overrides with reviewer attribution
- source capture add/remove controls
- finding-to-section reassignment
- immutable delivery snapshots after approval

## Evidence priority and source document policy

AI Draft generation prioritizes inputs in this order:

1. technician notes on evidence captures
2. evidence photos/videos
3. extracted measurements/findings from evidence captures
4. source document identity fields
5. selected Form Profile/report context

Source documents provide identity/header fields for the draft, such as customer/work order fields and vehicle or unit information. Work order line descriptions, complaints, corrections, parts/labour lines, prior notes, and prior recommendations are not Findings, Recommendations, or Repairs Performed by default.

If a technician note on the source document explicitly says to use the document content as a finding (for example, “use this as finding” or “include line 3”), the draft generator may consider that source document content as draft context and must still keep source capture references for human review.

The session page is intentionally a lightweight job folder. The report / AI Draft page is the review workspace for grouped findings, source field summary, unmapped evidence, draft approval, and delivery actions after approval.
