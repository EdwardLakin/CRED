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
