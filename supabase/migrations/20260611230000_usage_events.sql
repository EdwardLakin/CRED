create table if not exists public.organization_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (event_type in (
    'ai_classification',
    'ai_extraction',
    'capture_uploaded',
    'storage_bytes_added',
    'email_report_sent',
    'share_link_created',
    'printable_report_opened',
    'template_imported',
    'signature_captured'
  )),
  quantity numeric not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists organization_usage_events_org_created_idx
  on public.organization_usage_events(organization_id, created_at desc);

create index if not exists organization_usage_events_org_type_created_idx
  on public.organization_usage_events(organization_id, event_type, created_at desc);

alter table public.organization_usage_events enable row level security;

comment on table public.organization_usage_events is
  'Append-only MVP usage ledger for approximate storage, monthly AI, email, share, report, template, and signature accounting. Storage deletion reconciliation is intentionally deferred.';

comment on column public.organization_usage_events.quantity is
  'Unit count for the event. storage_bytes_added stores bytes; most other events store action counts.';

comment on column public.organization_usage_events.metadata is
  'Non-sensitive details needed to audit MVP usage counters, such as session_id, capture_id, filename, or recipient count.';

drop policy if exists "Organization members can read usage events" on public.organization_usage_events;
create policy "Organization members can read usage events"
  on public.organization_usage_events for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.organization_id = organization_usage_events.organization_id
        and profiles.user_id = auth.uid()
    )
  );

drop policy if exists "Organization members can create org usage events" on public.organization_usage_events;
create policy "Organization members can create org usage events"
  on public.organization_usage_events for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.organization_id = organization_usage_events.organization_id
        and profiles.user_id = auth.uid()
    )
    and (
      created_by is null
      or exists (
        select 1 from public.profiles
        where profiles.id = organization_usage_events.created_by
          and profiles.organization_id = organization_usage_events.organization_id
          and profiles.user_id = auth.uid()
      )
    )
  );
