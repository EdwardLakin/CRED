create table if not exists public.workspace_report_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  brand_profile_id uuid references public.workspace_brand_profiles(id) on delete set null,
  identity jsonb not null default '{}'::jsonb,
  logo_asset_id uuid,
  logo_storage_path text,
  dark_logo_asset_id text,
  signature_asset_id text,
  colors jsonb not null default '{}'::jsonb,
  typography jsonb not null default '{}'::jsonb,
  header_layout text not null default 'classic_letterhead',
  footer_layout text not null default 'standard',
  report_style jsonb not null default '{}'::jsonb,
  footer_text text,
  signature_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint workspace_report_templates_header_layout_check check (header_layout in ('classic_letterhead','compact_service','bold_banner','split_identity','minimal','report_cover','left_rail','certification_block'))
);
create unique index if not exists workspace_report_templates_one_default_idx on public.workspace_report_templates(organization_id) where is_default;
create index if not exists workspace_report_templates_organization_idx on public.workspace_report_templates(organization_id, updated_at desc);
alter table public.workspace_report_templates enable row level security;
create policy "Workspace members can read report templates" on public.workspace_report_templates for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.organization_id = workspace_report_templates.organization_id));
create policy "Workspace admins can insert report templates" on public.workspace_report_templates for insert with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.organization_id = workspace_report_templates.organization_id and p.role in ('owner','admin')));
create policy "Workspace admins can update report templates" on public.workspace_report_templates for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.organization_id = workspace_report_templates.organization_id and p.role in ('owner','admin'))) with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.organization_id = workspace_report_templates.organization_id and p.role in ('owner','admin')));
create policy "Workspace admins can delete report templates" on public.workspace_report_templates for delete using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.organization_id = workspace_report_templates.organization_id and p.role in ('owner','admin')));
