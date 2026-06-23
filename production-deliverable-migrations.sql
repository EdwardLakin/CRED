begin;

-- ==================================================
-- supabase/migrations/20260623160000_deliverable_version_lifecycle.sql
-- ==================================================
-- Deliverable version lifecycle and provenance controls.

alter table public.evidence_deliverables
  add column if not exists version_number integer,
  add column if not exists finalized_at timestamptz,
  add column if not exists finalized_by uuid references public.profiles(id) on delete set null,
  add column if not exists supersedes_deliverable_id uuid references public.evidence_deliverables(id) on delete set null;

update public.evidence_deliverables d
set version_number = ranked.version_number,
    status = case when d.status = 'generated' then 'draft' else d.status end
from (
  select id, row_number() over (partition by organization_id, documentation_session_id, deliverable_type order by generated_at, created_at, id)::integer as version_number
  from public.evidence_deliverables
) ranked
where d.id = ranked.id;

alter table public.evidence_deliverables alter column version_number set not null;

alter table public.evidence_deliverables drop constraint if exists evidence_deliverables_status_check;
alter table public.evidence_deliverables add constraint evidence_deliverables_status_check check (status in ('draft', 'final', 'superseded', 'archived', 'failed'));
alter table public.evidence_deliverables add constraint evidence_deliverables_version_number_check check (version_number > 0);

create unique index if not exists evidence_deliverables_version_unique_idx on public.evidence_deliverables(organization_id, documentation_session_id, deliverable_type, version_number);
create unique index if not exists evidence_deliverables_one_final_idx on public.evidence_deliverables(organization_id, documentation_session_id, deliverable_type) where status = 'final' and deleted_at is null;
create index if not exists evidence_deliverables_lifecycle_idx on public.evidence_deliverables(organization_id, documentation_session_id, deliverable_type, status, version_number desc) where deleted_at is null;

create or replace function public.assign_evidence_deliverable_version()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_version integer;
begin
  if new.status = 'generated' then new.status := 'draft'; end if;
  if new.status is null then new.status := 'draft'; end if;
  if new.version_number is null then
    perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text || ':' || new.documentation_session_id::text || ':' || new.deliverable_type, 0));
    select coalesce(max(version_number), 0) + 1 into next_version
    from public.evidence_deliverables
    where organization_id = new.organization_id and documentation_session_id = new.documentation_session_id and deliverable_type = new.deliverable_type;
    new.version_number := next_version;
  end if;
  return new;
end;
$$;

drop trigger if exists evidence_deliverables_assign_version on public.evidence_deliverables;
create trigger evidence_deliverables_assign_version before insert on public.evidence_deliverables for each row execute function public.assign_evidence_deliverable_version();

create or replace function public.protect_evidence_deliverable_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status in ('final', 'superseded') and (new.content is distinct from old.content or new.provenance is distinct from old.provenance or new.source_ids is distinct from old.source_ids or new.generated_at is distinct from old.generated_at or new.generated_by is distinct from old.generated_by or new.version_number is distinct from old.version_number) then
    raise exception 'Finalized deliverable snapshots are immutable';
  end if;
  if old.status <> 'draft' and new.status = 'archived' then
    raise exception 'Only draft deliverables can be archived';
  end if;
  return new;
end;
$$;

drop trigger if exists evidence_deliverables_protect_snapshot on public.evidence_deliverables;
create trigger evidence_deliverables_protect_snapshot before update on public.evidence_deliverables for each row execute function public.protect_evidence_deliverable_snapshot();

create or replace function public.finalize_evidence_deliverable(p_deliverable_id uuid, p_actor_profile_id uuid)
returns public.evidence_deliverables
language plpgsql
security invoker
set search_path = public
as $$
declare
  selected public.evidence_deliverables;
  previous_final_id uuid;
begin
  select * into selected from public.evidence_deliverables where id = p_deliverable_id and deleted_at is null for update;
  if not found then raise exception 'Deliverable not found'; end if;
  if not public.is_org_member(selected.organization_id) then raise exception 'Deliverable not found'; end if;
  if selected.status <> 'draft' then raise exception 'Only draft deliverables can be finalized'; end if;
  if not exists (select 1 from public.documentation_sessions s where s.id = selected.documentation_session_id and s.organization_id = selected.organization_id and s.deleted_at is null) then raise exception 'Session not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(selected.organization_id::text || ':' || selected.documentation_session_id::text || ':' || selected.deliverable_type || ':final', 0));
  select id into previous_final_id from public.evidence_deliverables where organization_id = selected.organization_id and documentation_session_id = selected.documentation_session_id and deliverable_type = selected.deliverable_type and status = 'final' and deleted_at is null for update;
  if previous_final_id is not null then
    update public.evidence_deliverables set status = 'superseded', updated_at = now() where id = previous_final_id;
  end if;
  update public.evidence_deliverables set status = 'final', finalized_at = now(), finalized_by = p_actor_profile_id, supersedes_deliverable_id = previous_final_id, updated_at = now() where id = selected.id returning * into selected;
  return selected;
end;
$$;

grant execute on function public.finalize_evidence_deliverable(uuid, uuid) to authenticated;

comment on column public.evidence_deliverables.version_number is 'Monotonic deliverable version number within organization, session, and deliverable type.';
comment on column public.evidence_deliverables.finalized_at is 'Timestamp when a draft deliverable was marked final.';
comment on column public.evidence_deliverables.finalized_by is 'Profile that marked the deliverable final.';
comment on column public.evidence_deliverables.supersedes_deliverable_id is 'Previous final deliverable superseded by this final version.';

-- ==================================================
-- supabase/migrations/20260623170000_harden_deliverable_finalization.sql
-- ==================================================
-- Harden deliverable finalization so finalized_by is derived from the authenticated caller.

revoke all on function public.finalize_evidence_deliverable(uuid, uuid) from public;
revoke all on function public.finalize_evidence_deliverable(uuid, uuid) from anon;
revoke all on function public.finalize_evidence_deliverable(uuid, uuid) from authenticated;

create or replace function public.finalize_evidence_deliverable(p_deliverable_id uuid)
returns public.evidence_deliverables
language plpgsql
security definer
set search_path = public
as $$
declare
  selected public.evidence_deliverables;
  actor_profile_id uuid;
  previous_final_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
    into selected
  from public.evidence_deliverables
  where id = p_deliverable_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Deliverable not found';
  end if;

  select p.id
    into actor_profile_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.organization_id = selected.organization_id;

  if actor_profile_id is null then
    raise exception 'Deliverable not found';
  end if;

  if not public.is_org_member(selected.organization_id) then
    raise exception 'Deliverable not found';
  end if;

  if not exists (
    select 1
    from public.documentation_sessions s
    where s.id = selected.documentation_session_id
      and s.organization_id = selected.organization_id
      and s.deleted_at is null
  ) then
    raise exception 'Session not found';
  end if;

  if selected.status <> 'draft' then
    raise exception 'Only draft deliverables can be finalized';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(selected.organization_id::text || ':' || selected.documentation_session_id::text || ':' || selected.deliverable_type || ':final', 0));

  select id
    into previous_final_id
  from public.evidence_deliverables
  where organization_id = selected.organization_id
    and documentation_session_id = selected.documentation_session_id
    and deliverable_type = selected.deliverable_type
    and status = 'final'
    and deleted_at is null
  for update;

  if previous_final_id is not null then
    update public.evidence_deliverables
    set status = 'superseded', updated_at = now()
    where id = previous_final_id;
  end if;

  update public.evidence_deliverables
  set status = 'final',
      finalized_at = now(),
      finalized_by = actor_profile_id,
      supersedes_deliverable_id = previous_final_id,
      updated_at = now()
  where id = selected.id
  returning * into selected;

  return selected;
end;
$$;

revoke all on function public.finalize_evidence_deliverable(uuid) from public;
revoke all on function public.finalize_evidence_deliverable(uuid) from anon;
grant execute on function public.finalize_evidence_deliverable(uuid) to authenticated;

-- ==================================================
-- supabase/migrations/20260623190000_deliverable_share_links.sql
-- ==================================================
alter table public.report_share_tokens
  add column if not exists link_kind text not null default 'report',
  add column if not exists deliverable_id uuid references public.evidence_deliverables(id) on delete cascade;

alter table public.report_share_tokens drop constraint if exists report_share_tokens_link_kind_check;
alter table public.report_share_tokens add constraint report_share_tokens_link_kind_check check (link_kind in ('report', 'deliverable'));
alter table public.report_share_tokens drop constraint if exists report_share_tokens_target_check;
alter table public.report_share_tokens add constraint report_share_tokens_target_check check ((link_kind = 'report' and deliverable_id is null) or (link_kind = 'deliverable' and deliverable_id is not null));

create index if not exists report_share_tokens_deliverable_id_idx on public.report_share_tokens(deliverable_id) where deliverable_id is not null;
create index if not exists report_share_tokens_org_session_kind_idx on public.report_share_tokens(organization_id, documentation_session_id, link_kind);
create index if not exists report_share_tokens_active_deliverable_idx on public.report_share_tokens(organization_id, documentation_session_id, deliverable_id) where link_kind = 'deliverable' and disabled_at is null;

comment on column public.report_share_tokens.link_kind is 'Share-link target kind. Deliverable links resolve only through the server token path.';
comment on column public.report_share_tokens.deliverable_id is 'Exact finalized evidence_deliverables row shared by this secure token.';

-- ==================================================
-- supabase/migrations/20260623201000_harden_deliverable_share_links.sql
-- ==================================================
-- Harden deliverable share links for concurrent creation and view tracking.

set search_path = public, pg_temp;

with duplicate_open_deliverable_links as (
  select id, row_number() over (partition by deliverable_id order by created_at desc, id desc) as rn
  from public.report_share_tokens
  where link_kind = 'deliverable'
    and deliverable_id is not null
    and disabled_at is null
)
update public.report_share_tokens tokens
set disabled_at = now()
from duplicate_open_deliverable_links duplicates
where tokens.id = duplicates.id
  and duplicates.rn > 1;

create unique index if not exists report_share_tokens_one_open_deliverable_idx
  on public.report_share_tokens(deliverable_id)
  where link_kind = 'deliverable' and deliverable_id is not null and disabled_at is null;

create or replace function public.increment_deliverable_share_token_view(p_token_id uuid)
returns public.report_share_tokens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated public.report_share_tokens;
begin
  update public.report_share_tokens
  set view_count = coalesce(view_count, 0) + 1,
      last_viewed_at = now()
  where id = p_token_id
    and link_kind = 'deliverable'
  returning * into updated;

  if updated.id is null then
    raise exception 'Share link not found';
  end if;

  return updated;
end;
$$;

revoke all on function public.increment_deliverable_share_token_view(uuid) from public;
revoke all on function public.increment_deliverable_share_token_view(uuid) from anon;
revoke all on function public.increment_deliverable_share_token_view(uuid) from authenticated;

grant execute on function public.increment_deliverable_share_token_view(uuid) to service_role;

comment on function public.increment_deliverable_share_token_view(uuid) is
  'Server-only atomic view counter update for resolved deliverable share links.';

-- ==================================================
-- supabase/migrations/20260623202000_restore_scoped_report_share_token_access.sql
-- ==================================================
-- Restore authenticated, organization-scoped management access for report share tokens.
-- Public token resolution remains server-only: anon has no table access and the
-- deliverable view-count RPC remains service-role-only.

set search_path = public, pg_temp;

alter table public.report_share_tokens enable row level security;

revoke all on table public.report_share_tokens from anon;
revoke all on table public.report_share_tokens from authenticated;
grant select, insert, update on table public.report_share_tokens to authenticated;

create or replace function public.reject_report_share_token_retargeting()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.documentation_session_id is distinct from old.documentation_session_id
    or new.deliverable_id is distinct from old.deliverable_id
    or new.link_kind is distinct from old.link_kind
    or new.token is distinct from old.token
    or new.created_by is distinct from old.created_by then
    raise exception 'Share token target fields cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists report_share_tokens_reject_retargeting on public.report_share_tokens;
create trigger report_share_tokens_reject_retargeting
  before update on public.report_share_tokens
  for each row
  execute function public.reject_report_share_token_retargeting();

revoke all on function public.reject_report_share_token_retargeting() from public;
revoke all on function public.reject_report_share_token_retargeting() from anon;
revoke all on function public.reject_report_share_token_retargeting() from authenticated;

do $$
begin
  drop policy if exists "Organization members can read report share tokens" on public.report_share_tokens;
  create policy "Organization members can read report share tokens"
    on public.report_share_tokens for select
    to authenticated
    using (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = report_share_tokens.organization_id
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can create report share tokens" on public.report_share_tokens;
  create policy "Organization members can create report share tokens"
    on public.report_share_tokens for insert
    to authenticated
    with check (
      created_by is not null
      and exists (
        select 1 from public.profiles
        where profiles.id = report_share_tokens.created_by
          and profiles.organization_id = report_share_tokens.organization_id
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_sessions
        where documentation_sessions.id = report_share_tokens.documentation_session_id
          and documentation_sessions.organization_id = report_share_tokens.organization_id
          and documentation_sessions.deleted_at is null
      )
      and (
        (
          link_kind = 'report'
          and deliverable_id is null
        )
        or (
          link_kind = 'deliverable'
          and deliverable_id is not null
          and exists (
            select 1 from public.evidence_deliverables
            where evidence_deliverables.id = report_share_tokens.deliverable_id
              and evidence_deliverables.organization_id = report_share_tokens.organization_id
              and evidence_deliverables.documentation_session_id = report_share_tokens.documentation_session_id
              and evidence_deliverables.deleted_at is null
              and evidence_deliverables.status = 'final'
          )
        )
      )
    );

  drop policy if exists "Organization members can update report share tokens" on public.report_share_tokens;
  create policy "Organization members can update report share tokens"
    on public.report_share_tokens for update
    to authenticated
    using (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = report_share_tokens.organization_id
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_sessions
        where documentation_sessions.id = report_share_tokens.documentation_session_id
          and documentation_sessions.organization_id = report_share_tokens.organization_id
      )
    )
    with check (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = report_share_tokens.organization_id
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_sessions
        where documentation_sessions.id = report_share_tokens.documentation_session_id
          and documentation_sessions.organization_id = report_share_tokens.organization_id
          and documentation_sessions.deleted_at is null
      )
      and (
        (
          link_kind = 'report'
          and deliverable_id is null
        )
        or (
          link_kind = 'deliverable'
          and deliverable_id is not null
          and exists (
            select 1 from public.evidence_deliverables
            where evidence_deliverables.id = report_share_tokens.deliverable_id
              and evidence_deliverables.organization_id = report_share_tokens.organization_id
              and evidence_deliverables.documentation_session_id = report_share_tokens.documentation_session_id
              and evidence_deliverables.deleted_at is null
              and evidence_deliverables.status = 'final'
          )
        )
      )
    );
end $$;

revoke all on function public.increment_deliverable_share_token_view(uuid) from public;
revoke all on function public.increment_deliverable_share_token_view(uuid) from anon;
revoke all on function public.increment_deliverable_share_token_view(uuid) from authenticated;
grant execute on function public.increment_deliverable_share_token_view(uuid) to service_role;

-- ==================================================
-- supabase/migrations/20260623203000_restore_scoped_usage_event_access.sql
-- ==================================================
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

commit;
