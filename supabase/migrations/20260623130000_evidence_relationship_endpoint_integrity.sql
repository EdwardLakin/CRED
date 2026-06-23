-- Enforce polymorphic evidence relationship endpoint integrity independently of RLS.

create or replace function public.validate_evidence_relationship_endpoint(
  p_endpoint_role text,
  p_endpoint_type text,
  p_endpoint_id uuid,
  p_organization_id uuid,
  p_documentation_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_organization_id uuid;
  v_documentation_session_id uuid;
  v_deleted_at timestamptz;
begin
  case p_endpoint_type
    when 'capture_item' then
      select organization_id, documentation_session_id, deleted_at
      into v_organization_id, v_documentation_session_id, v_deleted_at
      from public.capture_items
      where id = p_endpoint_id;
    when 'timeline_event' then
      select organization_id, documentation_session_id, deleted_at
      into v_organization_id, v_documentation_session_id, v_deleted_at
      from public.timeline_events
      where id = p_endpoint_id;
    when 'entity' then
      select organization_id, documentation_session_id, deleted_at
      into v_organization_id, v_documentation_session_id, v_deleted_at
      from public.evidence_entities
      where id = p_endpoint_id;
    when 'assertion' then
      select organization_id, documentation_session_id, deleted_at
      into v_organization_id, v_documentation_session_id, v_deleted_at
      from public.evidence_assertions
      where id = p_endpoint_id;
    else
      raise exception 'unsupported evidence relationship % endpoint type: %', p_endpoint_role, p_endpoint_type
        using errcode = '22023';
  end case;

  if v_organization_id is null then
    raise exception 'missing evidence relationship % endpoint: % %', p_endpoint_role, p_endpoint_type, p_endpoint_id
      using errcode = '23503';
  end if;

  if v_organization_id <> p_organization_id then
    raise exception 'cross-organization evidence relationship % endpoint: % %', p_endpoint_role, p_endpoint_type, p_endpoint_id
      using errcode = '42501';
  end if;

  if v_documentation_session_id <> p_documentation_session_id then
    raise exception 'cross-session evidence relationship % endpoint: % %', p_endpoint_role, p_endpoint_type, p_endpoint_id
      using errcode = '42501';
  end if;

  if v_deleted_at is not null then
    raise exception 'soft-deleted evidence relationship % endpoint: % %', p_endpoint_role, p_endpoint_type, p_endpoint_id
      using errcode = '23514';
  end if;
end;
$$;

create or replace function public.validate_evidence_relationship_endpoints()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.validate_evidence_relationship_endpoint('source', new.source_type, new.source_id, new.organization_id, new.documentation_session_id);
  perform public.validate_evidence_relationship_endpoint('target', new.target_type, new.target_id, new.organization_id, new.documentation_session_id);
  return new;
end;
$$;

drop trigger if exists evidence_relationships_validate_endpoints on public.evidence_relationships;
create trigger evidence_relationships_validate_endpoints
before insert or update on public.evidence_relationships
for each row execute function public.validate_evidence_relationship_endpoints();

grant select on table public.profiles to authenticated;
grant select on table public.documentation_sessions to authenticated;
grant select, insert, update, delete on table public.evidence_relationships to authenticated;
grant select, insert, update, delete on table public.evidence_deliverables to authenticated;

comment on function public.validate_evidence_relationship_endpoint(text, text, uuid, uuid, uuid) is 'Validates evidence relationship endpoint existence, tenant/session match, and soft-delete state while bypassing caller RLS via a fixed search_path security definer function.';
comment on trigger evidence_relationships_validate_endpoints on public.evidence_relationships is 'Rejects missing, cross-organization, cross-session, soft-deleted, or unsupported polymorphic relationship endpoints before insert or update.';
