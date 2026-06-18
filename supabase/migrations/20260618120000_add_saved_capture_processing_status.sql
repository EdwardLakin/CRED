-- Allow uploads to persist as saved without implicitly entering the AI queue.
alter table public.capture_items
  drop constraint if exists capture_items_processing_status_check;

alter table public.capture_items
  add constraint capture_items_processing_status_check
  check (processing_status in (
    'not_started',
    'uploaded',
    'saved',
    'queued',
    'needs_queue_retry',
    'analyzing',
    'analyzed',
    'grouped',
    'report_ready',
    'analysis_failed',
    'grouping_failed',
    'needs_review',
    'ignored'
  ));
