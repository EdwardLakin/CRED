-- Parallel evidence deliverables foundation. This intentionally does not alter
-- the existing report generation or export rendering workflow.

create table if not exists public.evidence_deliverables (
  id uuid primary key default gen_random_uuid(),
  documentation_session_id uuid not null references public.documentation_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  deliverable_type text not null,
  title text not null,
  status text not null default 'generated',
  summary text,
  content jsonb not null default '{}'::jsonb,
  source_ids jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint evidence_deliverables_type_check check (deliverable_type in ('chronology', 'evidence_index', 'observation_summary')),
  constraint evidence_deliverables_status_check check (status in ('generated', 'failed'))
);

create index if not exists evidence_deliverables_session_type_idx on public.evidence_deliverables(documentation_session_id, deliverable_type, generated_at desc) where deleted_at is null;
create index if not exists evidence_deliverables_org_idx on public.evidence_deliverables(organization_id, generated_at desc) where deleted_at is null;

alter table public.evidence_deliverables enable row level security;

drop policy if exists evidence_deliverables_org_select on public.evidence_deliverables;
create policy evidence_deliverables_org_select on public.evidence_deliverables for select using (public.is_org_member(organization_id));

drop policy if exists evidence_deliverables_org_insert on public.evidence_deliverables;
create policy evidence_deliverables_org_insert on public.evidence_deliverables for insert with check (public.is_org_member(organization_id));

drop policy if exists evidence_deliverables_org_update on public.evidence_deliverables;
create policy evidence_deliverables_org_update on public.evidence_deliverables for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

drop trigger if exists evidence_deliverables_touch_updated_at on public.evidence_deliverables;
create trigger evidence_deliverables_touch_updated_at before update on public.evidence_deliverables for each row execute function public.touch_updated_at();

comment on table public.evidence_deliverables is 'Deterministic preview deliverables generated from verified evidence workspace relationships, separate from report exports.';
