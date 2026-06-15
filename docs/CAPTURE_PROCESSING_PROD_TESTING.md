# Capture AI Processing: Production-Style Test Flow

Required environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; used by the worker to bypass RLS safely)
- `INTERNAL_CAPTURE_WORKER_SECRET` (shared secret for `/api/internal/capture-processing/tick`)

## Upload and queue

1. Sign in to the deployed app and open a documentation session.
2. Upload several photo captures from `/dashboard/sessions/<session-id>/capture`.
3. In Supabase, inspect `capture_items` for that session and confirm new image captures have `processing_status = queued`.
4. Inspect `capture_processing_jobs` and confirm each image capture has one queued job for each of:
   - `classify_capture`
   - `extract_capture`
   - `generate_capture_note`

## Trigger the worker

Vercel Cron may call the GET endpoint. Manual testing can use either GET or POST:

```bash
curl -sS \
  -H "Authorization: Bearer $INTERNAL_CAPTURE_WORKER_SECRET" \
  "https://<deployment-host>/api/internal/capture-processing/tick?batch_size=10"
```

The endpoint returns `ok: true` with `processed: 0` when no eligible jobs exist, so repeated ticks are safe.

## Inspect results

1. Re-check `capture_processing_jobs`; processed jobs should move to `succeeded`, while transient failures become `retrying` with `scheduled_for` set.
2. Re-check `capture_items`; processed captures should update `capture_ai_analysis`, `ai_summary`, and `processing_status` (`analyzed`, `needs_review`, or `analysis_failed`).
3. Once capture-level jobs are complete, session-level jobs should appear for grouping/report readiness:
   - `group_evidence`
   - `normalize_report_fields`
   - `generate_findings`
   - `update_report_readiness`
4. Open `/dashboard/sessions/<session-id>/report` and confirm evidence groups, duplicate warnings, editable extracted values, signature status, and readiness messages reflect the latest state.
