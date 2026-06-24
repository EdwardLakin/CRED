-- Fix capture upload regression from capture_items trigger referencing a missing column.
--
-- The 20260623204000_harden_capture_item_evidence_updates migration created
-- public.prevent_capture_item_scope_retarget() for public.capture_items and copied
-- a generic immutable-owner check for NEW.created_by/OLD.created_by. The
-- capture_items table has never had a created_by column; it is scoped by
-- organization_id + documentation_session_id and authored operationally through
-- the authenticated profile/session context. Because Postgres validates record
-- fields when the trigger executes, every authenticated capture_items UPDATE
-- (classification, processing-state, review/status changes, and background
-- processing updates) failed with SQLSTATE 42703: record "new" has no field
-- "created_by".
--
-- This forward-only replacement keeps the tenant/security protections that are
-- valid for capture_items: service-role maintenance can proceed, deleted rows
-- remain immutable for authenticated users, and authenticated users still cannot
-- retarget organization/session/storage ownership fields. Tenant isolation stays
-- enforced by the existing capture_items UPDATE RLS policy, which requires the
-- authenticated user profile to belong to capture_items.organization_id and the
-- session to match the same organization.

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
    or new.thumbnail_path is distinct from old.thumbnail_path then
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

comment on function public.prevent_capture_item_scope_retarget() is
  'Prevents authenticated capture_items retargeting without referencing created_by, which is not a capture_items column; organization/session membership remains enforced by RLS.';

-- Post-migration validation snippets (read-only):
-- 1) Confirm no trigger function attached to a capture table still references
--    NEW.created_by/OLD.created_by when that table lacks a created_by column:
-- select event_object_schema, event_object_table, trigger_name, action_statement
-- from information_schema.triggers
-- where event_object_schema = 'public'
--   and event_object_table in ('capture_items', 'capture_processing_jobs', 'capture_ai_analysis', 'documentation_captures', 'session_capture_intake')
--   and action_statement ilike '%created_by%';
--
-- 2) Confirm capture_items still has no created_by column by design:
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'capture_items'
-- order by ordinal_position;
--
-- 3) Confirm capture update policies are tenant scoped and no anon write grants exist:
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and tablename = 'capture_items'
-- order by policyname;
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and table_name in ('capture_items', 'capture_processing_jobs')
--   and grantee = 'anon'
--   and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
