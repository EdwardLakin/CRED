-- Additive evidence engine foundation. This migration intentionally keeps the
-- existing capture/review/report/export workflow unchanged.

alter table public.capture_items
  add column if not exists import_batch_id uuid,
  add column if not exists original_filename text,
  add column if not exists file_size_bytes bigint,
  add column if not exists mime_type text,
  add column if not exists content_hash_sha256 text,
  add column if not exists source_kind text not null default 'upload',
  add column if not exists source_uri text,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb,
  add column if not exists source_created_at timestamptz,
  add column if not exists source_sent_at timestamptz,
  add column if not exists source_received_at timestamptz,
  add column if not exists event_date timestamptz,
  add column if not exists event_date_precision text,
  add column if not exists evidence_review_status text not null default 'unreviewed',
  add column if not exists evidence_excluded_reason text,
  add column if not exists duplicate_of_capture_item_id uuid references public.capture_items(id) on delete set null,
  add column if not exists duplicate_status text not null default 'not_checked';

alter table public.capture_items
  drop constraint if exists capture_items_source_kind_check,
  add constraint capture_items_source_kind_check
  check (source_kind in ('camera_capture', 'upload', 'bulk_upload', 'text_note', 'voice_note', 'email_import', 'system'));

alter table public.capture_items
  drop constraint if exists capture_items_event_date_precision_check,
  add constraint capture_items_event_date_precision_check
  check (event_date_precision is null or event_date_precision in ('exact', 'date', 'month', 'year', 'approximate', 'unknown'));

alter table public.capture_items
  drop constraint if exists capture_items_evidence_review_status_check,
  add constraint capture_items_evidence_review_status_check
  check (evidence_review_status in ('unreviewed', 'reviewed', 'needs_followup', 'excluded'));

alter table public.capture_items
  drop constraint if exists capture_items_duplicate_status_check,
  add constraint capture_items_duplicate_status_check
  check (duplicate_status in ('not_checked', 'unique', 'possible_duplicate', 'duplicate'));

create table if not exists public.evidence_import_batches (
  id uuid primary key default gen_random_uuid(),
  documentation_session_id uuid not null references public.documentation_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_kind text not null default 'bulk_upload',
  status text not null default 'pending',
  file_count integer not null default 0,
  processed_count integer not null default 0,
  failed_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint evidence_import_batches_source_kind_check check (source_kind in ('bulk_upload', 'email_import', 'system')),
  constraint evidence_import_batches_status_check check (status in ('pending', 'uploading', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled'))
);

alter table public.capture_items
  drop constraint if exists capture_items_import_batch_id_fkey,
  add constraint capture_items_import_batch_id_fkey
  foreign key (import_batch_id) references public.evidence_import_batches(id) on delete set null;

create table if not exists public.evidence_entities (
  id uuid primary key default gen_random_uuid(),
  documentation_session_id uuid not null references public.documentation_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  display_name text not null,
  normalized_name text,
  description text,
  attributes jsonb not null default '{}'::jsonb,
  suggestion_source text not null default 'user',
  review_status text not null default 'accepted',
  confidence numeric,
  provenance jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint evidence_entities_entity_type_check check (entity_type in ('person', 'organization', 'location', 'asset', 'equipment', 'vehicle', 'document', 'other')),
  constraint evidence_entities_suggestion_source_check check (suggestion_source in ('user', 'ai', 'system', 'import')),
  constraint evidence_entities_review_status_check check (review_status in ('suggested', 'accepted', 'edited', 'rejected'))
);

create table if not exists public.evidence_assertions (
  id uuid primary key default gen_random_uuid(),
  documentation_session_id uuid not null references public.documentation_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assertion_type text not null default 'factual_observation',
  statement text not null,
  normalized_statement text,
  attributes jsonb not null default '{}'::jsonb,
  suggestion_source text not null default 'user',
  review_status text not null default 'accepted',
  confidence numeric,
  provenance jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint evidence_assertions_assertion_type_check check (assertion_type in ('factual_observation', 'measurement', 'condition', 'note_summary', 'documented_statement', 'open_question', 'other')),
  constraint evidence_assertions_suggestion_source_check check (suggestion_source in ('user', 'ai', 'system', 'import')),
  constraint evidence_assertions_review_status_check check (review_status in ('suggested', 'accepted', 'edited', 'rejected'))
);

create table if not exists public.evidence_relationships (
  id uuid primary key default gen_random_uuid(),
  documentation_session_id uuid not null references public.documentation_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  relationship_type text not null,
  relationship_label text,
  confidence numeric,
  suggestion_source text not null default 'user',
  review_status text not null default 'accepted',
  provenance jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint evidence_relationships_object_type_check check (source_type in ('capture_item', 'timeline_event', 'entity', 'assertion', 'report_draft', 'report_section', 'import_batch') and target_type in ('capture_item', 'timeline_event', 'entity', 'assertion', 'report_draft', 'report_section', 'import_batch')),
  constraint evidence_relationships_relationship_type_check check (relationship_type in ('supports', 'contradicts', 'documents', 'depicts', 'references', 'mentions', 'involves', 'located_at', 'occurred_at', 'derived_from', 'duplicate_of', 'included_in', 'excluded_from', 'supersedes', 'related_to')),
  constraint evidence_relationships_suggestion_source_check check (suggestion_source in ('user', 'ai', 'system', 'import')),
  constraint evidence_relationships_review_status_check check (review_status in ('suggested', 'accepted', 'edited', 'rejected'))
);

alter table public.timeline_events
  add column if not exists event_start_at timestamptz,
  add column if not exists event_end_at timestamptz,
  add column if not exists event_date_precision text not null default 'exact',
  add column if not exists timezone text,
  add column if not exists source_kind text not null default 'user',
  add column if not exists review_status text not null default 'accepted',
  add column if not exists confidence numeric,
  add column if not exists provenance jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

update public.timeline_events set event_start_at = event_time where event_start_at is null;

alter table public.timeline_events
  drop constraint if exists timeline_events_event_date_precision_check,
  add constraint timeline_events_event_date_precision_check
  check (event_date_precision in ('exact', 'date', 'month', 'year', 'approximate', 'unknown'));

alter table public.timeline_events
  drop constraint if exists timeline_events_source_kind_check,
  add constraint timeline_events_source_kind_check
  check (source_kind in ('user', 'ai', 'system', 'import'));

alter table public.timeline_events
  drop constraint if exists timeline_events_review_status_check,
  add constraint timeline_events_review_status_check
  check (review_status in ('suggested', 'accepted', 'edited', 'rejected'));

create index if not exists capture_items_import_batch_idx on public.capture_items(import_batch_id) where deleted_at is null;
create index if not exists capture_items_content_hash_idx on public.capture_items(organization_id, content_hash_sha256) where deleted_at is null and content_hash_sha256 is not null;
create index if not exists capture_items_evidence_review_status_idx on public.capture_items(documentation_session_id, evidence_review_status) where deleted_at is null;
create index if not exists capture_items_duplicate_status_idx on public.capture_items(documentation_session_id, duplicate_status) where deleted_at is null;

create index if not exists evidence_import_batches_session_created_idx on public.evidence_import_batches(documentation_session_id, created_at desc) where deleted_at is null;
create index if not exists evidence_import_batches_org_status_idx on public.evidence_import_batches(organization_id, status) where deleted_at is null;

create index if not exists evidence_entities_session_type_idx on public.evidence_entities(documentation_session_id, entity_type) where deleted_at is null;
create index if not exists evidence_entities_review_idx on public.evidence_entities(documentation_session_id, review_status) where deleted_at is null;

create index if not exists evidence_assertions_session_type_idx on public.evidence_assertions(documentation_session_id, assertion_type) where deleted_at is null;
create index if not exists evidence_assertions_review_idx on public.evidence_assertions(documentation_session_id, review_status) where deleted_at is null;

create index if not exists evidence_relationships_source_idx on public.evidence_relationships(documentation_session_id, source_type, source_id) where deleted_at is null;
create index if not exists evidence_relationships_target_idx on public.evidence_relationships(documentation_session_id, target_type, target_id) where deleted_at is null;
create index if not exists evidence_relationships_review_idx on public.evidence_relationships(documentation_session_id, review_status) where deleted_at is null;
create unique index if not exists evidence_relationships_unique_active_idx on public.evidence_relationships(documentation_session_id, source_type, source_id, target_type, target_id, relationship_type) where deleted_at is null;

create index if not exists timeline_events_review_idx on public.timeline_events(documentation_session_id, review_status) where deleted_at is null;
create index if not exists timeline_events_event_start_idx on public.timeline_events(documentation_session_id, event_start_at desc) where deleted_at is null;

alter table public.evidence_import_batches enable row level security;
alter table public.evidence_entities enable row level security;
alter table public.evidence_assertions enable row level security;
alter table public.evidence_relationships enable row level security;

create or replace function public.default_ai_evidence_review_status_to_suggested()
returns trigger
language plpgsql
as $$
begin
  if new.suggestion_source = 'ai' then
    new.review_status = 'suggested';
  end if;
  return new;
end;
$$;

create or replace function public.default_ai_timeline_review_status_to_suggested()
returns trigger
language plpgsql
as $$
begin
  if new.source_kind = 'ai' then
    new.review_status = 'suggested';
  end if;
  return new;
end;
$$;

drop trigger if exists evidence_entities_ai_insert_defaults on public.evidence_entities;
create trigger evidence_entities_ai_insert_defaults before insert on public.evidence_entities for each row execute function public.default_ai_evidence_review_status_to_suggested();
drop trigger if exists evidence_assertions_ai_insert_defaults on public.evidence_assertions;
create trigger evidence_assertions_ai_insert_defaults before insert on public.evidence_assertions for each row execute function public.default_ai_evidence_review_status_to_suggested();
drop trigger if exists evidence_relationships_ai_insert_defaults on public.evidence_relationships;
create trigger evidence_relationships_ai_insert_defaults before insert on public.evidence_relationships for each row execute function public.default_ai_evidence_review_status_to_suggested();
drop trigger if exists timeline_events_ai_insert_defaults on public.timeline_events;
create trigger timeline_events_ai_insert_defaults before insert on public.timeline_events for each row execute function public.default_ai_timeline_review_status_to_suggested();

drop trigger if exists evidence_import_batches_touch_updated_at on public.evidence_import_batches;
create trigger evidence_import_batches_touch_updated_at before update on public.evidence_import_batches for each row execute function public.touch_updated_at();
drop trigger if exists evidence_entities_touch_updated_at on public.evidence_entities;
create trigger evidence_entities_touch_updated_at before update on public.evidence_entities for each row execute function public.touch_updated_at();
drop trigger if exists evidence_assertions_touch_updated_at on public.evidence_assertions;
create trigger evidence_assertions_touch_updated_at before update on public.evidence_assertions for each row execute function public.touch_updated_at();
drop trigger if exists evidence_relationships_touch_updated_at on public.evidence_relationships;
create trigger evidence_relationships_touch_updated_at before update on public.evidence_relationships for each row execute function public.touch_updated_at();
drop trigger if exists timeline_events_touch_updated_at on public.timeline_events;
create trigger timeline_events_touch_updated_at before update on public.timeline_events for each row execute function public.touch_updated_at();

do $$
begin
  drop policy if exists "Organization members can read evidence import batches" on public.evidence_import_batches;
  create policy "Organization members can read evidence import batches" on public.evidence_import_batches for select to authenticated using (exists (select 1 from public.profiles where profiles.organization_id = evidence_import_batches.organization_id and profiles.user_id = auth.uid()));
  drop policy if exists "Organization members can create evidence import batches" on public.evidence_import_batches;
  create policy "Organization members can create evidence import batches" on public.evidence_import_batches for insert to authenticated with check (exists (select 1 from public.profiles where profiles.organization_id = evidence_import_batches.organization_id and profiles.user_id = auth.uid()) and exists (select 1 from public.documentation_sessions where documentation_sessions.id = evidence_import_batches.documentation_session_id and documentation_sessions.organization_id = evidence_import_batches.organization_id));
  drop policy if exists "Organization members can update evidence import batches" on public.evidence_import_batches;
  create policy "Organization members can update evidence import batches" on public.evidence_import_batches for update to authenticated using (exists (select 1 from public.profiles where profiles.organization_id = evidence_import_batches.organization_id and profiles.user_id = auth.uid())) with check (exists (select 1 from public.profiles where profiles.organization_id = evidence_import_batches.organization_id and profiles.user_id = auth.uid()) and exists (select 1 from public.documentation_sessions where documentation_sessions.id = evidence_import_batches.documentation_session_id and documentation_sessions.organization_id = evidence_import_batches.organization_id));
  drop policy if exists "Organization members can delete evidence import batches" on public.evidence_import_batches;
  create policy "Organization members can delete evidence import batches" on public.evidence_import_batches for delete to authenticated using (exists (select 1 from public.profiles where profiles.organization_id = evidence_import_batches.organization_id and profiles.user_id = auth.uid()));
end $$;

do $$
declare
  evidence_table text;
begin
  foreach evidence_table in array array['evidence_entities', 'evidence_assertions', 'evidence_relationships'] loop
    execute format('drop policy if exists "Organization members can read %1$s" on public.%1$I', evidence_table);
    execute format('create policy "Organization members can read %1$s" on public.%1$I for select to authenticated using (exists (select 1 from public.profiles where profiles.organization_id = %1$I.organization_id and profiles.user_id = auth.uid()))', evidence_table);
    execute format('drop policy if exists "Organization members can create %1$s" on public.%1$I', evidence_table);
    execute format('create policy "Organization members can create %1$s" on public.%1$I for insert to authenticated with check (exists (select 1 from public.profiles where profiles.organization_id = %1$I.organization_id and profiles.user_id = auth.uid()) and exists (select 1 from public.documentation_sessions where documentation_sessions.id = %1$I.documentation_session_id and documentation_sessions.organization_id = %1$I.organization_id))', evidence_table);
    execute format('drop policy if exists "Organization members can update %1$s" on public.%1$I', evidence_table);
    execute format('create policy "Organization members can update %1$s" on public.%1$I for update to authenticated using (exists (select 1 from public.profiles where profiles.organization_id = %1$I.organization_id and profiles.user_id = auth.uid())) with check (exists (select 1 from public.profiles where profiles.organization_id = %1$I.organization_id and profiles.user_id = auth.uid()) and exists (select 1 from public.documentation_sessions where documentation_sessions.id = %1$I.documentation_session_id and documentation_sessions.organization_id = %1$I.organization_id))', evidence_table);
    execute format('drop policy if exists "Organization members can delete %1$s" on public.%1$I', evidence_table);
    execute format('create policy "Organization members can delete %1$s" on public.%1$I for delete to authenticated using (exists (select 1 from public.profiles where profiles.organization_id = %1$I.organization_id and profiles.user_id = auth.uid()))', evidence_table);
  end loop;
end $$;

comment on table public.evidence_import_batches is 'Tracks bulk evidence intake batches for a documentation session without changing existing capture/report behavior.';
comment on table public.evidence_entities is 'Human-reviewable people, organizations, locations, assets, equipment, and other entities suggested by users, imports, systems, or future AI.';
comment on table public.evidence_assertions is 'Human-reviewable factual observations only; not legal, medical, financial, liability, or automated decision records.';
comment on table public.evidence_relationships is 'Polymorphic evidence graph relationships with provenance and human review state.';
