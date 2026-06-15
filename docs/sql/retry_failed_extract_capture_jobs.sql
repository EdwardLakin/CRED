-- Requeue failed capture extraction jobs after deploying the structured-output schema fix.
update capture_processing_jobs
set status = 'queued',
    attempts = 0,
    last_error = null,
    scheduled_for = now(),
    locked_at = null,
    locked_by = null
where job_type = 'extract_capture'
  and status = 'failed';
