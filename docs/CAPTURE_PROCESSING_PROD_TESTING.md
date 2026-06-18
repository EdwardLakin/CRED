# Capture AI Processing: Production-Style Test Flow

Required environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; used by the worker to bypass RLS safely)
- `INTERNAL_CAPTURE_WORKER_SECRET` (shared secret for `/api/internal/capture-processing/tick`)
- Backward-compatible alias: `CAPTURE_PROCESSING_INTERNAL_SECRET`
- Optional Vercel Cron compatibility: set `CRON_SECRET` to the same value if the deployment relies on Vercel's `Authorization: Bearer $CRON_SECRET` cron header.

## Upload does not queue automatically

1. Sign in to the deployed app and open a documentation session.
2. Upload several photo captures from `/dashboard/sessions/<session-id>/capture`.
3. In Supabase, inspect `capture_items` for that session and confirm normal uploads remain `processing_status = saved`.
4. Inspect `capture_processing_jobs` and confirm upload alone did not create jobs for the new captures.

## Explicit queue processing

When a capture is explicitly queued for processing, inspect `capture_processing_jobs` and confirm each queued image capture has one queued job for each of:
   - `classify_capture`
   - `extract_capture`
   - `generate_capture_note`

## Manually trigger the worker

Vercel Cron calls the GET endpoint configured in `vercel.json`. Manual testing can use either GET or POST with a Bearer token or `x-internal-secret` header:

```bash
export APP_URL="https://<deployment-host>"
export INTERNAL_CAPTURE_WORKER_SECRET="<shared-secret>"

curl -sS \
  -H "Authorization: Bearer $INTERNAL_CAPTURE_WORKER_SECRET" \
  "$APP_URL/api/internal/capture-processing/tick?batch_size=10" | jq
```

```bash
curl -sS -X POST \
  -H "x-internal-secret: $INTERNAL_CAPTURE_WORKER_SECRET" \
  "$APP_URL/api/internal/capture-processing/tick?batch_size=10" | jq
```

A safe diagnostic response includes `jobs_found`, `jobs_processed`, `jobs_succeeded`, `jobs_failed`, `jobs_retried`, `jobs_remaining`, `batch_size`, and `no_op`. The endpoint returns `ok: true` with `no_op: true` when no eligible jobs exist, so repeated ticks are safe.

## Check queued jobs

```bash
export SUPABASE_DB_URL="postgresql://<user>:<password>@<host>:5432/postgres"
export SESSION_ID="<documentation-session-id>"

psql "$SUPABASE_DB_URL" -c "
select id, capture_item_id, job_type, status, attempts, scheduled_for, locked_at, left(coalesce(last_error, ''), 160) as last_error
from public.capture_processing_jobs
where documentation_session_id = '$SESSION_ID'
  and status in ('queued', 'retrying', 'running')
order by priority, created_at;
"
```

## Check failed jobs

```bash
psql "$SUPABASE_DB_URL" -c "
select id, capture_item_id, job_type, status, attempts, max_attempts, completed_at, left(coalesce(last_error, ''), 300) as last_error
from public.capture_processing_jobs
where documentation_session_id = '$SESSION_ID'
  and status = 'failed'
order by completed_at desc nulls last, updated_at desc;
"
```

## Confirm captures updated

```bash
psql "$SUPABASE_DB_URL" -c "
select id, type, ai_status, processing_status, ai_summary is not null as has_ai_summary, capture_ai_analysis is not null as has_ai_analysis, updated_at
from public.capture_items
where documentation_session_id = '$SESSION_ID'
  and deleted_at is null
order by captured_at desc;
"
```

Expected lifecycle for uploaded photos: `queued` → `analyzing` → `analyzed` or `needs_review`; if AI is unavailable after retries, the capture should move to `analysis_failed` with manual review available.

## Confirm report readiness updated

```bash
psql "$SUPABASE_DB_URL" -c "
select job_type, status, attempts, completed_at
from public.capture_processing_jobs
where documentation_session_id = '$SESSION_ID'
  and job_type in ('group_evidence', 'normalize_report_fields', 'generate_findings', 'update_report_readiness')
order by priority, created_at;
"
```

```bash
psql "$SUPABASE_DB_URL" -c "
select processing_status, count(*)
from public.capture_items
where documentation_session_id = '$SESSION_ID'
  and deleted_at is null
group by processing_status
order by processing_status;
"
```

After capture-level jobs finish, session-level jobs should be queued and processed. Open `/dashboard/sessions/<session-id>/report` and confirm evidence groups, duplicate warnings, editable extracted values, signature status, and readiness messages reflect the latest state.
