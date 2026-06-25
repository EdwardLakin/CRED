alter table public.documentation_sessions
  add column if not exists offline_client_id text;

create unique index if not exists
  documentation_sessions_offline_client_id_unique
on public.documentation_sessions (
  organization_id,
  offline_client_id
)
where
  offline_client_id is not null
  and deleted_at is null;

comment on column public.documentation_sessions.offline_client_id is
  'Stable client-generated identifier used to create offline sessions idempotently after reconnect.';
