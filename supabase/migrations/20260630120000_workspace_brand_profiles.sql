create table if not exists public.workspace_brand_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text, tagline text, phone text, email text, website text, address text,
  prepared_by_name text, prepared_by_title text,
  logo_storage_path text, dark_logo_storage_path text, icon_storage_path text, signature_storage_path text,
  colors jsonb not null default '{}'::jsonb,
  typography jsonb not null default '{}'::jsonb,
  header_layout text not null default 'classic', footer_layout text not null default 'standard', report_style jsonb not null default '{}'::jsonb,
  footer_text text,
  show_report_id boolean not null default true, show_page_date boolean not null default true, show_contact_info boolean not null default true, show_confidentiality_note boolean not null default false, show_signature_block boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references public.profiles(id) on delete set null, updated_by uuid references public.profiles(id) on delete set null,
  unique (organization_id),
  constraint workspace_brand_profiles_header_layout_check check (header_layout in ('classic','compact','bold','split','minimal'))
);
alter table public.workspace_brand_profiles enable row level security;
create policy "Workspace members can read brand profiles" on public.workspace_brand_profiles for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.organization_id = workspace_brand_profiles.organization_id));
create policy "Workspace admins can insert brand profiles" on public.workspace_brand_profiles for insert with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.organization_id = workspace_brand_profiles.organization_id and p.role in ('owner','admin')));
create policy "Workspace admins can update brand profiles" on public.workspace_brand_profiles for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.organization_id = workspace_brand_profiles.organization_id and p.role in ('owner','admin'))) with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.organization_id = workspace_brand_profiles.organization_id and p.role in ('owner','admin')));
create policy "Workspace admins can delete brand profiles" on public.workspace_brand_profiles for delete using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.organization_id = workspace_brand_profiles.organization_id and p.role in ('owner','admin')));
create index if not exists workspace_brand_profiles_organization_idx on public.workspace_brand_profiles(organization_id);
