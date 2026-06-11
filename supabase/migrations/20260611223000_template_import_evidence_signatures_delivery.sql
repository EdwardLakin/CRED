insert into storage.buckets (id, name, public)
values
  ('documentation-templates', 'documentation-templates', false),
  ('documentation-signatures', 'documentation-signatures', false)
on conflict (id) do nothing;

create table if not exists public.template_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  filename text not null,
  source_file_path text not null,
  ai_status text not null default 'draft_ready',
  extracted_structure jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.documentation_workflow_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  template_type text not null default 'organization',
  source_import_id uuid references public.template_imports(id) on delete set null,
  required_evidence jsonb not null default '[]'::jsonb,
  recommended_evidence jsonb not null default '[]'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  fields jsonb not null default '[]'::jsonb,
  pdf_layout jsonb not null default '{}'::jsonb,
  signature_requirements jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documentation_sessions
  add column if not exists workflow_template_id uuid references public.documentation_workflow_templates(id) on delete set null;

create table if not exists public.template_required_evidence (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.documentation_workflow_templates(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  label text not null,
  evidence_key text not null,
  requirement_type text not null default 'required',
  match_terms text[] not null default array[]::text[],
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.signature_captures (
  id uuid primary key default gen_random_uuid(),
  documentation_session_id uuid not null references public.documentation_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  signature_type text not null,
  signer_name text not null,
  signature_image_path text not null,
  signed_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.report_share_tokens (
  id uuid primary key default gen_random_uuid(),
  documentation_session_id uuid not null references public.documentation_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz,
  disabled_at timestamptz,
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists template_imports_organization_id_idx on public.template_imports(organization_id);
create index if not exists documentation_workflow_templates_organization_id_idx on public.documentation_workflow_templates(organization_id);
create index if not exists template_required_evidence_template_id_idx on public.template_required_evidence(template_id);
create index if not exists signature_captures_session_id_idx on public.signature_captures(documentation_session_id);
create index if not exists report_share_tokens_session_id_idx on public.report_share_tokens(documentation_session_id);

comment on table public.template_imports is 'Uploaded PDF, DOCX, image, and paper-form photo imports analyzed into AI template drafts.';
comment on table public.documentation_workflow_templates is 'Reusable system and organization documentation workflows generated or edited in Settings > Templates.';
comment on table public.template_required_evidence is 'Normalized required and optional evidence rules for reusable workflow templates.';
comment on table public.signature_captures is 'Reusable technician, customer, inspector, and supervisor signature captures rendered into reports.';
comment on table public.report_share_tokens is 'Secure report sharing links with expiration, disable, and view tracking support.';
