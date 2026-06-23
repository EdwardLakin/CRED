-- Harden capture item evidence mutations while preserving tenant-scoped authenticated updates.

create or replace function public.prevent_capture_item_scope_retarget()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if old.deleted_at is not null then
    raise exception 'Deleted capture items cannot be updated';
  end if;

  if new.organization_id is distinct from old.organization_id
    or new.documentation_session_id is distinct from old.documentation_session_id
    or new.storage_path is distinct from old.storage_path
    or new.thumbnail_path is distinct from old.thumbnail_path
    or new.created_by is distinct from old.created_by then
    raise exception 'Capture item ownership fields cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_capture_item_scope_retarget on public.capture_items;
create trigger prevent_capture_item_scope_retarget
  before update on public.capture_items
  for each row
  execute function public.prevent_capture_item_scope_retarget();

drop policy if exists "Organization members can update capture items" on public.capture_items;
create policy "Organization members can update capture items"
  on public.capture_items for update
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
      from public.profiles
      where profiles.organization_id = capture_items.organization_id
        and profiles.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.documentation_sessions
      where documentation_sessions.id = capture_items.documentation_session_id
        and documentation_sessions.organization_id = capture_items.organization_id
        and documentation_sessions.deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.organization_id = capture_items.organization_id
        and profiles.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.documentation_sessions
      where documentation_sessions.id = capture_items.documentation_session_id
        and documentation_sessions.organization_id = capture_items.organization_id
        and documentation_sessions.deleted_at is null
    )
  );

grant update on table public.capture_items to authenticated;
