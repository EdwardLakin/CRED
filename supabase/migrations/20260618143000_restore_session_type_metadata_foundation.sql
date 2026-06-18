alter table public.documentation_sessions
  add column if not exists session_metadata jsonb not null default '{}'::jsonb;

update public.documentation_sessions
set
  session_type = case
    when session_type in ('General Evidence Report', 'Vehicle Inspection', 'Property Inspection', 'Insurance Claim', 'Incident Report', 'Safety Inspection', 'Custom Report') then session_type
    when session_type in ('Inspection Report') then 'Property Inspection'
    when session_type in ('Service Report', 'field_service_report') then 'Vehicle Inspection'
    else 'General Evidence Report'
  end,
  session_metadata = jsonb_strip_nulls(
    coalesce(session_metadata, '{}'::jsonb)
    || case when nullif(customer_name, '') is not null and not (coalesce(session_metadata, '{}'::jsonb) ? 'customer_client') then jsonb_build_object('customer_client', customer_name) else '{}'::jsonb end
    || case when nullif(asset_label, '') is not null and not (coalesce(session_metadata, '{}'::jsonb) ? 'asset_equipment') then jsonb_build_object('asset_equipment', asset_label) else '{}'::jsonb end
    || case when coalesce(session_metadata, '{}'::jsonb) ? 'location_address' and not (coalesce(session_metadata, '{}'::jsonb) ? 'location') then jsonb_build_object('location', session_metadata->>'location_address') else '{}'::jsonb end
  ),
  updated_at = updated_at
where session_type is null
  or session_type not in ('General Evidence Report', 'Vehicle Inspection', 'Property Inspection', 'Insurance Claim', 'Incident Report', 'Safety Inspection', 'Custom Report')
  or session_metadata is null
  or (nullif(customer_name, '') is not null and not (coalesce(session_metadata, '{}'::jsonb) ? 'customer_client'))
  or (nullif(asset_label, '') is not null and not (coalesce(session_metadata, '{}'::jsonb) ? 'asset_equipment'))
  or (coalesce(session_metadata, '{}'::jsonb) ? 'location_address' and not (coalesce(session_metadata, '{}'::jsonb) ? 'location'));

comment on column public.documentation_sessions.session_type is
  'Authoritative user-selected report type. AI/draft generation must not infer or override report type.';

comment on column public.documentation_sessions.session_metadata is
  'User-editable report metadata for customer-facing exports. Legacy location_address is normalized to location.';
