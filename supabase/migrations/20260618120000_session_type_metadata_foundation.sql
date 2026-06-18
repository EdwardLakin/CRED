alter table public.documentation_sessions
  add column if not exists session_metadata jsonb not null default '{}'::jsonb;

comment on column public.documentation_sessions.session_type is
  'User-selected report/session type. This value is the source of truth for report labeling and export behavior.';

comment on column public.documentation_sessions.session_metadata is
  'User-editable report metadata captured during session setup and report review for customer-facing exports.';
