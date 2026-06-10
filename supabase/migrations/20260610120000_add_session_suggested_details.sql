alter table public.documentation_sessions
  add column if not exists suggested_details jsonb not null default '{}'::jsonb;
