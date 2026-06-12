# Background Capture Processing

CRED now treats capture save and AI analysis as separate steps. The technician-facing capture flow only uploads the file to Supabase Storage and creates a `capture_items` row. AI classification and extraction run afterward through an internal processing route.

## Trigger

After a capture record is created successfully, the capture UI calls:

```http
POST /api/dashboard/sessions/[id]/captures/process
```

The client uses a fire-and-forget `fetch(..., { method: 'POST', keepalive: true })` and immediately shows: `Saved. AI is processing in the background.` The upload success state does not wait for OpenAI/provider calls.

The same processing path is also available from recovery buttons labeled **Process Pending Evidence** on the session and report pages. Manual classify/extract buttons remain available for recovery and debugging.

## Status lifecycle

CRED reuses the existing `capture_items.ai_status` field and adds only minimal additive metadata inside `capture_items.extracted_data.processing`.

Primary statuses:

- `pending` - capture is saved and waiting for AI.
- `processing` - the route is classifying or extracting the capture.
- `classified` - classification completed and extraction may still be pending.
- `extracted` - extraction completed and the capture is ready for human review.
- `needs_review` - the evidence was unsupported, ambiguous, or completed with low confidence.
- `failed` - processing failed safely and can be retried.
- `blocked_by_limit` - AI allowance was exhausted before a provider call.

Processing metadata shape:

```json
{
  "processing": {
    "status": "processing",
    "stage": "classification",
    "started_at": "2026-06-12T00:00:00.000Z",
    "completed_at": "2026-06-12T00:00:02.000Z",
    "error_message": "Friendly safe message"
  }
}
```

## Idempotency behavior

The processor is safe to call multiple times:

- Deleted captures are skipped.
- Already extracted captures are skipped.
- Unsupported evidence is marked `needs_review` instead of crashing.
- Source documents skip generic classification and go directly to source-document-aware extraction.
- Usage events are written only after a provider call succeeds.
- Usage allowance is checked immediately before each classification or extraction call.

## Source document rules

Source document captures keep using the source-document metadata already stored in `extracted_data.source_document`. Extraction receives that context and is constrained to identity/header fields unless the technician note explicitly asks to promote a document line/comment into a finding.

## Evidence rules

For ordinary evidence, the classifier and extractor receive technician notes/transcripts as high-value context. Extraction remains cautious and focuses on supported finding, measurement, component, location, condition, recommendation, and severity details.

Video-only evidence is saved and left reviewable for MVP. Image-backed captures and image source documents are processed first.

## Usage limit behavior

Before each AI provider call, CRED checks the organization's allowance. If allowance is exhausted, the capture is not sent to the provider and is marked `blocked_by_limit` with a friendly message. This avoids double-counting and keeps saved evidence available for manual review or retry after limits reset.

## UI behavior

- Capture page: save succeeds quickly, clears successful uploads, and shows background-processing status on recent cards.
- Session page: shows a summary such as `Evidence processing: 3 ready, 1 processing, 1 needs review`.
- Report page: warns when evidence is still processing and allows refresh, processing retry, or draft generation with currently available evidence.

## Known MVP limitations

- The processor is HTTP-triggered, not a durable external queue.
- Vercel/serverless execution time still bounds each batch.
- Video-only files are not analyzed until thumbnail/frame extraction is added.
- Polling is intentionally light; users can refresh status manually.

## Future queue/worker upgrade path

A later production queue can keep the same idempotent processing function and replace the HTTP trigger with durable enqueue/dequeue semantics. Recommended upgrades:

1. Add a `capture_processing_jobs` table or Supabase queue/Edge Function.
2. Enqueue one job per capture after record creation.
3. Add lease/attempt columns for concurrency safety.
4. Run a scheduled worker for retries and timeout recovery.
5. Keep current route as an admin/user retry endpoint.
