alter table public.documentation_sessions
  add column if not exists field_service_details jsonb not null default '{}'::jsonb;

comment on column public.documentation_sessions.field_service_details is
  'Structured documentation-only field service report details for Wajax-style field order/service report output. GPS stores only optional start/end points, not continuous tracking.';
