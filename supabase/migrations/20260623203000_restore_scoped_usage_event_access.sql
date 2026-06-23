-- Restore authenticated, organization-scoped append access for the usage ledger.
-- Usage events are written by authenticated application flows using the caller's
-- workspace Supabase client; service-role administrative access is preserved.

set search_path = public, pg_temp;

alter table public.organization_usage_events enable row level security;

revoke all on table public.organization_usage_events from anon;
revoke all on table public.organization_usage_events from authenticated;
grant select, insert on table public.organization_usage_events to authenticated;

alter table public.organization_usage_events
  drop constraint if exists organization_usage_events_quantity_nonnegative_check;

alter table public.organization_usage_events
  add constraint organization_usage_events_quantity_nonnegative_check
  check (quantity >= 0);

do $$
begin
  drop policy if exists "Organization members can read usage events" on public.organization_usage_events;
  create policy "Organization members can read usage events"
    on public.organization_usage_events for select
    to authenticated
    using (
      auth.uid() is not null
      and exists (
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
      auth.uid() is not null
      and quantity >= 0
      and event_type in (
        'ai_classification',
        'ai_extraction',
        'ai_report_draft_generation',
        'capture_uploaded',
        'storage_bytes_added',
        'email_report_sent',
        'share_link_created',
        'printable_report_opened',
        'pdf_report_downloaded',
        'template_imported',
        'signature_captured'
      )
      and exists (
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
end $$;
