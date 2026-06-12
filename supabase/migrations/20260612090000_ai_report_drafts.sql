create table if not exists public.ai_report_drafts (
  id uuid primary key default gen_random_uuid(),
  documentation_session_id uuid not null references public.documentation_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_template_id uuid references public.documentation_workflow_templates(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'needs_review', 'approved', 'superseded')),
  title text,
  summary text,
  header_fields jsonb not null default '{}'::jsonb,
  measurements jsonb not null default '[]'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  coverage jsonb not null default '{}'::jsonb,
  unmapped_evidence jsonb not null default '[]'::jsonb,
  confidence numeric,
  model text,
  prompt_version text,
  generated_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_report_draft_sections (
  id uuid primary key default gen_random_uuid(),
  ai_report_draft_id uuid not null references public.ai_report_drafts(id) on delete cascade,
  documentation_session_id uuid not null references public.documentation_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  section_key text not null,
  title text not null,
  body text,
  status text check (status is null or status in ('pass', 'fail', 'recommended', 'na', 'needs_review', 'informational')),
  confidence numeric,
  source_capture_ids uuid[] not null default '{}',
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_report_drafts_session_generated_at_idx
  on public.ai_report_drafts(documentation_session_id, generated_at desc);

create index if not exists ai_report_draft_sections_draft_sort_order_idx
  on public.ai_report_draft_sections(ai_report_draft_id, sort_order);

alter table public.ai_report_drafts enable row level security;
alter table public.ai_report_draft_sections enable row level security;

alter table public.organization_usage_events
  drop constraint if exists organization_usage_events_event_type_check;

alter table public.organization_usage_events
  add constraint organization_usage_events_event_type_check
  check (event_type in (
    'ai_classification',
    'ai_extraction',
    'ai_report_draft_generation',
    'capture_uploaded',
    'storage_bytes_added',
    'email_report_sent',
    'share_link_created',
    'printable_report_opened',
    'template_imported',
    'signature_captured'
  ));

comment on table public.ai_report_drafts is
  'Editable AI Drafts generated from Form Profile report context, source documents, captured evidence, notes, and extracted details. Final immutable snapshots are intentionally deferred.';

comment on table public.ai_report_draft_sections is
  'Human-reviewable AI Draft sections with source capture references back to supporting evidence.';

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_report_drafts_touch_updated_at on public.ai_report_drafts;
create trigger ai_report_drafts_touch_updated_at
  before update on public.ai_report_drafts
  for each row execute function public.touch_updated_at();

drop trigger if exists ai_report_draft_sections_touch_updated_at on public.ai_report_draft_sections;
create trigger ai_report_draft_sections_touch_updated_at
  before update on public.ai_report_draft_sections
  for each row execute function public.touch_updated_at();

drop policy if exists "Organization members can read AI report drafts" on public.ai_report_drafts;
create policy "Organization members can read AI report drafts"
  on public.ai_report_drafts for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.organization_id = ai_report_drafts.organization_id
        and profiles.user_id = auth.uid()
    )
  );

drop policy if exists "Organization members can create AI report drafts for org sessions" on public.ai_report_drafts;
create policy "Organization members can create AI report drafts for org sessions"
  on public.ai_report_drafts for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.organization_id = ai_report_drafts.organization_id
        and profiles.user_id = auth.uid()
    )
    and exists (
      select 1 from public.documentation_sessions
      where documentation_sessions.id = ai_report_drafts.documentation_session_id
        and documentation_sessions.organization_id = ai_report_drafts.organization_id
    )
  );

drop policy if exists "Organization members can update AI report drafts for org sessions" on public.ai_report_drafts;
create policy "Organization members can update AI report drafts for org sessions"
  on public.ai_report_drafts for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.organization_id = ai_report_drafts.organization_id
        and profiles.user_id = auth.uid()
    )
    and exists (
      select 1 from public.documentation_sessions
      where documentation_sessions.id = ai_report_drafts.documentation_session_id
        and documentation_sessions.organization_id = ai_report_drafts.organization_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.organization_id = ai_report_drafts.organization_id
        and profiles.user_id = auth.uid()
    )
    and exists (
      select 1 from public.documentation_sessions
      where documentation_sessions.id = ai_report_drafts.documentation_session_id
        and documentation_sessions.organization_id = ai_report_drafts.organization_id
    )
  );

drop policy if exists "Organization members can delete AI report drafts for org sessions" on public.ai_report_drafts;
create policy "Organization members can delete AI report drafts for org sessions"
  on public.ai_report_drafts for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.organization_id = ai_report_drafts.organization_id
        and profiles.user_id = auth.uid()
    )
    and exists (
      select 1 from public.documentation_sessions
      where documentation_sessions.id = ai_report_drafts.documentation_session_id
        and documentation_sessions.organization_id = ai_report_drafts.organization_id
    )
  );

drop policy if exists "Organization members can read AI report draft sections" on public.ai_report_draft_sections;
create policy "Organization members can read AI report draft sections"
  on public.ai_report_draft_sections for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.organization_id = ai_report_draft_sections.organization_id
        and profiles.user_id = auth.uid()
    )
  );

drop policy if exists "Organization members can create AI report draft sections for org sessions" on public.ai_report_draft_sections;
create policy "Organization members can create AI report draft sections for org sessions"
  on public.ai_report_draft_sections for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.organization_id = ai_report_draft_sections.organization_id
        and profiles.user_id = auth.uid()
    )
    and exists (
      select 1 from public.documentation_sessions
      where documentation_sessions.id = ai_report_draft_sections.documentation_session_id
        and documentation_sessions.organization_id = ai_report_draft_sections.organization_id
    )
    and exists (
      select 1 from public.ai_report_drafts
      where ai_report_drafts.id = ai_report_draft_sections.ai_report_draft_id
        and ai_report_drafts.documentation_session_id = ai_report_draft_sections.documentation_session_id
        and ai_report_drafts.organization_id = ai_report_draft_sections.organization_id
    )
  );

drop policy if exists "Organization members can update AI report draft sections for org sessions" on public.ai_report_draft_sections;
create policy "Organization members can update AI report draft sections for org sessions"
  on public.ai_report_draft_sections for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.organization_id = ai_report_draft_sections.organization_id
        and profiles.user_id = auth.uid()
    )
    and exists (
      select 1 from public.documentation_sessions
      where documentation_sessions.id = ai_report_draft_sections.documentation_session_id
        and documentation_sessions.organization_id = ai_report_draft_sections.organization_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.organization_id = ai_report_draft_sections.organization_id
        and profiles.user_id = auth.uid()
    )
    and exists (
      select 1 from public.documentation_sessions
      where documentation_sessions.id = ai_report_draft_sections.documentation_session_id
        and documentation_sessions.organization_id = ai_report_draft_sections.organization_id
    )
    and exists (
      select 1 from public.ai_report_drafts
      where ai_report_drafts.id = ai_report_draft_sections.ai_report_draft_id
        and ai_report_drafts.documentation_session_id = ai_report_draft_sections.documentation_session_id
        and ai_report_drafts.organization_id = ai_report_draft_sections.organization_id
    )
  );

drop policy if exists "Organization members can delete AI report draft sections for org sessions" on public.ai_report_draft_sections;
create policy "Organization members can delete AI report draft sections for org sessions"
  on public.ai_report_draft_sections for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.organization_id = ai_report_draft_sections.organization_id
        and profiles.user_id = auth.uid()
    )
    and exists (
      select 1 from public.documentation_sessions
      where documentation_sessions.id = ai_report_draft_sections.documentation_session_id
        and documentation_sessions.organization_id = ai_report_draft_sections.organization_id
    )
  );
