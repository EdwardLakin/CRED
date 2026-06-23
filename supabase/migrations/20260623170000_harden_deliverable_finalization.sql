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
