insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentation-captures',
  'documentation-captures',
  false,
  104857600,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/aac', 'audio/x-m4a',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/mpeg'
  ]
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.capture_items
  add column if not exists capture_group_id uuid default gen_random_uuid(),
  add column if not exists evidence_event_id uuid,
  add column if not exists technician_note text,
  add column if not exists transcript text,
  add column if not exists transcript_status text not null default 'not_started',
  add column if not exists note_source text not null default 'manual',
  add column if not exists media_kind text not null default 'image',
  add column if not exists report_order integer,
  add column if not exists include_in_report boolean not null default true,
  add column if not exists deleted_at timestamptz;

update public.capture_items
set media_kind = case
  when type = 'voice_note' then 'audio'
  when type = 'document' then 'document'
  else 'image'
end
where media_kind is null or media_kind = '';

update public.capture_items
set report_order = ordered.row_number
from (
  select id, row_number() over (partition by documentation_session_id order by captured_at asc, created_at asc)::integer as row_number
  from public.capture_items
) as ordered
where public.capture_items.id = ordered.id
  and public.capture_items.report_order is null;

do $$
declare
  v_constraint_name text;
begin
  for v_constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'capture_items'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%type%'
  loop
    execute format('alter table public.capture_items drop constraint %I', v_constraint_name);
  end loop;

  alter table public.capture_items
    add constraint capture_items_type_check
    check (type in ('photo', 'document', 'vin_plate', 'info_plate', 'voice_note', 'video', 'evidence_video'));
end $$;

alter table public.capture_items
  drop constraint if exists capture_items_media_kind_check,
  add constraint capture_items_media_kind_check check (media_kind in ('image', 'video', 'audio', 'document'));

alter table public.capture_items
  drop constraint if exists capture_items_transcript_status_check,
  add constraint capture_items_transcript_status_check check (transcript_status in ('not_started', 'pending', 'completed', 'failed', 'unavailable'));

alter table public.capture_items
  drop constraint if exists capture_items_note_source_check,
  add constraint capture_items_note_source_check check (note_source in ('voice', 'manual', 'edited'));

create index if not exists capture_items_report_order_idx
  on public.capture_items (documentation_session_id, include_in_report, report_order, captured_at)
  where deleted_at is null;

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  documentation_session_id uuid not null references public.documentation_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  export_type text not null default 'pdf',
  status text not null default 'generated',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.exports
  add column if not exists status text not null default 'generated',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create index if not exists exports_session_created_at_idx
  on public.exports (documentation_session_id, created_at desc);

alter table public.exports enable row level security;

do $$
begin
  drop policy if exists "Organization members can update capture items" on public.capture_items;
  create policy "Organization members can update capture items"
    on public.capture_items for update
    to authenticated
    using (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = capture_items.organization_id
          and profiles.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = capture_items.organization_id
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can delete capture items" on public.capture_items;
  create policy "Organization members can delete capture items"
    on public.capture_items for delete
    to authenticated
    using (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = capture_items.organization_id
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can read exports" on public.exports;
  create policy "Organization members can read exports"
    on public.exports for select
    to authenticated
    using (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = exports.organization_id
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can create exports" on public.exports;
  create policy "Organization members can create exports"
    on public.exports for insert
    to authenticated
    with check (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = exports.organization_id
          and profiles.user_id = auth.uid()
      )
    );
end $$;
