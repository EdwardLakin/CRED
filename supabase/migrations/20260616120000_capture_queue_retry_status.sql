-- Keep saved media durable when background AI/report queueing fails. These
-- statuses let the UI distinguish true upload failures from best-effort
-- processing failures, and let repair jobs backfill missing queue rows later.
alter table public.capture_items
  drop constraint if exists capture_items_processing_status_check;

alter table public.capture_items
  add constraint capture_items_processing_status_check
  check (processing_status in (
    'not_started',
    'uploaded',
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

create or replace function public.queue_missing_capture_processing_jobs()
returns table (
  capture_item_id uuid,
  inserted_jobs integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with eligible_captures as (
    select ci.id, ci.organization_id, ci.documentation_session_id
    from public.capture_items ci
    where ci.storage_path is not null
      and ci.deleted_at is null
      and ci.media_kind in ('image', 'video', 'document')
      and ci.processing_status in ('uploaded', 'queued', 'analyzing', 'needs_queue_retry')
      and not exists (
        select 1
        from public.capture_processing_jobs cpj
        where cpj.capture_item_id = ci.id
          and cpj.status <> 'cancelled'
      )
  ), job_rows as (
    select
      ec.organization_id,
      ec.documentation_session_id,
      ec.id as queued_capture_item_id,
      jobs.job_type,
      50 + jobs.ordinal::integer as priority,
      jsonb_build_object('repair', true, 'queued_by', 'queue_missing_capture_processing_jobs') as metadata
    from eligible_captures ec
    cross join unnest(array['classify_capture', 'extract_capture', 'generate_capture_note']::text[]) with ordinality as jobs(job_type, ordinal)
  ), inserted as (
    insert into public.capture_processing_jobs (
      organization_id,
      documentation_session_id,
      capture_item_id,
      job_type,
      priority,
      status,
      metadata
    )
    select
      jr.organization_id,
      jr.documentation_session_id,
      jr.queued_capture_item_id,
      jr.job_type,
      jr.priority,
      'queued',
      jr.metadata
    from job_rows jr
    on conflict do nothing
    returning public.capture_processing_jobs.capture_item_id as queued_capture_item_id
  ), updated as (
    update public.capture_items ci
    set processing_status = 'queued',
        ai_status = coalesce(nullif(ci.ai_status, 'extracted'), 'queued'),
        ai_summary = case
          when ci.ai_summary = 'Saved. AI processing needs retry.' then null
          else ci.ai_summary
        end
    where ci.id in (select distinct inserted.queued_capture_item_id from inserted)
    returning ci.id
  )
  select inserted.queued_capture_item_id as capture_item_id, count(*)::integer as inserted_jobs
  from inserted
  group by inserted.queued_capture_item_id;
end;
$$;

comment on function public.queue_missing_capture_processing_jobs() is
  'Idempotently queues classify, extract, and note generation jobs for media capture_items, including captures marked needs_queue_retry after best-effort queue failures.';
