# Critical Inspection Integrity Audit

## Session-count audit query

Use this query for session `New Session Jun 16, 2026, 2:24 PM UTC` to report exact counts at each evidence stage:

```sql
with target_session as (
  select id, organization_id, title, created_at
  from public.documentation_sessions
  where title = 'New Session Jun 16, 2026, 2:24 PM UTC'
), all_captures as (
  select ci.*
  from public.capture_items ci
  join target_session s on s.id = ci.documentation_session_id and s.organization_id = ci.organization_id
), latest_draft as (
  select d.*
  from public.ai_report_drafts d
  join target_session s on s.id = d.documentation_session_id and s.organization_id = d.organization_id
  where d.status <> 'superseded'
  order by d.generated_at desc nulls last, d.created_at desc
  limit 1
), draft_source_ids as (
  select distinct jsonb_array_elements_text(coalesce(section.source_capture_ids, '[]'::jsonb)) as capture_item_id
  from public.ai_report_draft_sections section
  join latest_draft d on d.id = section.ai_report_draft_id
  union
  select distinct jsonb_array_elements_text(coalesce(d.unmapped_evidence, '[]'::jsonb) -> 'source_capture_ids')
  from latest_draft d
)
select 'capture_items_total' as stage, count(*) from all_captures
union all select 'capture_page_visible_active', count(*) from all_captures where deleted_at is null
union all select 'review_page_loaded_active', count(*) from all_captures where deleted_at is null
union all select 'draft_generation_input_active', count(*) from all_captures where deleted_at is null
union all select 'draft_referenced_by_sections', count(*) from all_captures where id::text in (select capture_item_id from draft_source_ids)
union all select 'pdf_generation_input_included', count(*) from all_captures where deleted_at is null and include_in_report = true
union all select 'excluded_from_pdf_by_flag', count(*) from all_captures where deleted_at is null and include_in_report = false
union all select 'deleted_captures', count(*) from all_captures where deleted_at is not null;
```

The code paths use `documentation_session_id` plus `organization_id` for session assignment. Capture and Review load active captures (`deleted_at is null`). Draft generation loads active captures. Printable report/PDF generation intentionally loads active captures where `include_in_report = true`.

## Evidence path map

1. Capture upload creates a storage object, then creates exactly one `capture_items` row scoped to `organizations/{organizationId}/sessions/{sessionId}/captures/...`.
2. Duplicate-upload recovery reuses the existing active `capture_items` row for the same storage path.
3. Image AI Assist queues classification/extraction/note jobs only when the organization flag is enabled and the capture media kind is image.
4. Capture page reads active captures for the session.
5. Review page reads active captures for the session.
6. Draft generation reads active captures for the session and sanitizes image-derived AI fields when Image AI Assist is disabled.
7. Printable report generation reads active captures marked `include_in_report = true` and sanitizes image-derived AI fields when Image AI Assist is disabled.

## Report data-flow sources

- Findings: technician notes/transcripts, verified draft findings, draft section metadata, extraction fields, OCR/document text, and AI summaries when Image AI Assist is enabled.
- Recommendations: verified draft recommendations, recommendation text in draft findings/sections, technician notes/transcripts, extraction fields, and AI summaries when Image AI Assist is enabled.
- Final notes: current-session captures, technician notes/transcripts, verified findings, verified recommendations, and sanitized extraction context.
- Evidence summaries: technician notes/transcripts first, then capture metadata/extraction fields, OCR/document text, and AI summaries only when Image AI Assist is enabled.

## Image AI Assist disabled guarantees

When `organization.image_ai_assist_enabled = false`:

- upload-time image extraction jobs are not queued;
- manual classification/extraction actions return without provider calls;
- background workers skip image classification/extraction/generate-note jobs and do not write generated descriptions/classifications;
- report draft generation, final notes generation, review rendering, and printable report rendering strip image-derived `ai_summary`, `ocr_text`, and extraction/classification fields from image captures before report assembly.

## Technician Truth precedence

Report generation prompts now make technician notes, manual captions, voice transcripts, and verified findings the primary source of truth. AI may organize and summarize technician-provided content but must not replace, reinterpret, embellish, overwrite, or contradict it.
