alter table public.documentation_sessions
  add column if not exists session_metadata jsonb not null default '{}'::jsonb;

update public.documentation_sessions
set session_type = 'General Evidence Report'
where session_type is null
   or session_type = ''
   or session_type in ('General Documentation', 'Inspection', 'field_service_report');

update public.documentation_sessions
set session_metadata = jsonb_strip_nulls(
  coalesce(session_metadata, '{}'::jsonb) || jsonb_build_object(
    'customer_client', customer_name,
    'asset_equipment', asset_label
  )
)
where session_metadata = '{}'::jsonb;

comment on column public.documentation_sessions.session_type is
  'User-selected report type. This is the authoritative source for report title, template, section order, and export structure; AI must not infer it from evidence.';
comment on column public.documentation_sessions.session_metadata is
  'Normalized user-editable session-level report metadata used by review and export. Evidence extraction may suggest details separately but must not overwrite this metadata.';
