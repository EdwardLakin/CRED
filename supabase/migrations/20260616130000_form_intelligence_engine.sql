-- Form Intelligence Engine: normalized uploaded form blueprints and evidence mappings.
-- Capture -> Review -> Export remains unchanged; this storage supports automatic behind-the-scenes structure preservation.

create table if not exists public.form_blueprints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  documentation_session_id uuid not null references public.documentation_sessions(id) on delete cascade,
  source_capture_ids uuid[] not null default '{}',
  document_type text not null default 'custom_form',
  classification text not null default 'CUSTOM_FORM',
  classification_confidence numeric(4,3) not null default 0,
  blueprint jsonb not null default '{}'::jsonb,
  structured_form_data jsonb not null default '{}'::jsonb,
  evidence_field_mappings jsonb not null default '[]'::jsonb,
  export_package jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (documentation_session_id)
);

alter table public.form_blueprints enable row level security;

create index if not exists form_blueprints_org_session_idx on public.form_blueprints (organization_id, documentation_session_id);
create index if not exists form_blueprints_classification_idx on public.form_blueprints (organization_id, classification);

create policy "form_blueprints_select_org_members"
  on public.form_blueprints for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create policy "form_blueprints_insert_org_members"
  on public.form_blueprints for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create policy "form_blueprints_update_org_members"
  on public.form_blueprints for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()))
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create policy "form_blueprints_delete_org_members"
  on public.form_blueprints for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
