create table if not exists public.capture_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  documentation_session_id uuid not null references public.documentation_sessions(id) on delete cascade,
  capture_item_id uuid references public.capture_items(id) on delete cascade,
  job_type text not null check (job_type in ('classify_capture','extract_capture','generate_capture_note','group_evidence','normalize_report_fields','generate_findings','update_report_readiness')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','retrying','cancelled')),
  priority integer not null default 100,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  locked_at timestamptz,
  locked_by text,
  scheduled_for timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint capture_processing_jobs_session_capture_scope check (capture_item_id is not null or job_type in ('group_evidence','normalize_report_fields','generate_findings','update_report_readiness'))
);

create unique index if not exists capture_processing_jobs_capture_once_idx
  on public.capture_processing_jobs (organization_id, documentation_session_id, capture_item_id, job_type)
  where capture_item_id is not null and status <> 'cancelled';

create unique index if not exists capture_processing_jobs_session_once_idx
  on public.capture_processing_jobs (organization_id, documentation_session_id, job_type)
  where capture_item_id is null and status <> 'cancelled';

create index if not exists capture_processing_jobs_work_idx
  on public.capture_processing_jobs (status, scheduled_for, priority, created_at)
  where status in ('queued','retrying');

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  documentation_session_id uuid not null references public.documentation_sessions(id) on delete cascade,
  capture_item_id uuid references public.capture_items(id) on delete set null,
  job_id uuid references public.capture_processing_jobs(id) on delete set null,
  provider text not null,
  model text not null,
  operation text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  image_count integer not null default 0,
  estimated_cost_cents integer not null default 0,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint ai_usage_events_idempotency unique (organization_id, documentation_session_id, job_id, operation)
);

alter table public.capture_items
  add column if not exists processing_status text not null default 'uploaded'
    check (processing_status in ('uploaded','queued','analyzing','analyzed','grouped','report_ready','analysis_failed','grouping_failed','needs_review','ignored'));

alter table public.capture_processing_jobs enable row level security;
alter table public.ai_usage_events enable row level security;

create policy "capture_processing_jobs_org_select" on public.capture_processing_jobs
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.organization_id = capture_processing_jobs.organization_id
        and profiles.user_id = auth.uid()
    )
    and exists (
      select 1 from public.documentation_sessions
      where documentation_sessions.id = capture_processing_jobs.documentation_session_id
        and documentation_sessions.organization_id = capture_processing_jobs.organization_id
    )
  );
create policy "ai_usage_events_org_select" on public.ai_usage_events
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.organization_id = ai_usage_events.organization_id
        and profiles.user_id = auth.uid()
    )
    and exists (
      select 1 from public.documentation_sessions
      where documentation_sessions.id = ai_usage_events.documentation_session_id
        and documentation_sessions.organization_id = ai_usage_events.organization_id
    )
  );

create or replace function public.touch_capture_processing_jobs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_capture_processing_jobs_updated_at on public.capture_processing_jobs;
create trigger touch_capture_processing_jobs_updated_at
before update on public.capture_processing_jobs
for each row execute function public.touch_capture_processing_jobs_updated_at();
