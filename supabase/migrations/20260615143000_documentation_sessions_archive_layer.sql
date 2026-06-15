alter table public.documentation_sessions
  add column if not exists archived_at timestamptz;

comment on column public.documentation_sessions.archived_at is
  'Soft-archive timestamp for dashboard session history. Null sessions remain active or completed.';

create index if not exists documentation_sessions_org_archived_updated_idx
  on public.documentation_sessions (organization_id, archived_at, updated_at desc);

update public.documentation_sessions
set archived_at = coalesce(archived_at, updated_at, now())
where status = 'archived'
  and archived_at is null;
