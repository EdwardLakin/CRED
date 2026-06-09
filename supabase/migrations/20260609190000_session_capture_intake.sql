insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentation-captures',
  'documentation-captures',
  false,
  15728640,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/webm',
    'audio/ogg',
    'audio/aac',
    'audio/x-m4a'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.capture_items (
  id uuid primary key default gen_random_uuid(),
  documentation_session_id uuid not null references public.documentation_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type text not null check (type in ('photo', 'document', 'vin_plate', 'info_plate', 'voice_note')),
  storage_path text not null,
  thumbnail_path text,
  ai_status text default 'pending',
  ai_summary text,
  ocr_text text,
  extracted_data jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);


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
    check (type in ('photo', 'document', 'vin_plate', 'info_plate', 'voice_note'));
end $$;

create index if not exists capture_items_session_captured_at_idx
  on public.capture_items (documentation_session_id, captured_at desc);

create index if not exists capture_items_organization_id_idx
  on public.capture_items (organization_id);

create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  documentation_session_id uuid not null references public.documentation_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capture_item_id uuid references public.capture_items(id) on delete set null,
  title text not null,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists timeline_events_session_occurred_at_idx
  on public.timeline_events (documentation_session_id, occurred_at desc);

create index if not exists timeline_events_capture_item_id_idx
  on public.timeline_events (capture_item_id);

alter table public.capture_items enable row level security;
alter table public.timeline_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'capture_items' and policyname = 'Organization members can read capture items'
  ) then
    create policy "Organization members can read capture items"
      on public.capture_items for select
      to authenticated
      using (
        exists (
          select 1
          from public.profiles
          where profiles.organization_id = capture_items.organization_id
            and profiles.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'capture_items' and policyname = 'Organization members can create capture items'
  ) then
    create policy "Organization members can create capture items"
      on public.capture_items for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.profiles
          where profiles.organization_id = capture_items.organization_id
            and profiles.user_id = auth.uid()
        )
        and exists (
          select 1
          from public.documentation_sessions
          where documentation_sessions.id = capture_items.documentation_session_id
            and documentation_sessions.organization_id = capture_items.organization_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'timeline_events' and policyname = 'Organization members can read timeline events'
  ) then
    create policy "Organization members can read timeline events"
      on public.timeline_events for select
      to authenticated
      using (
        exists (
          select 1
          from public.profiles
          where profiles.organization_id = timeline_events.organization_id
            and profiles.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'timeline_events' and policyname = 'Organization members can create timeline events'
  ) then
    create policy "Organization members can create timeline events"
      on public.timeline_events for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.profiles
          where profiles.organization_id = timeline_events.organization_id
            and profiles.user_id = auth.uid()
        )
        and exists (
          select 1
          from public.documentation_sessions
          where documentation_sessions.id = timeline_events.documentation_session_id
            and documentation_sessions.organization_id = timeline_events.organization_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Organization members can upload documentation captures'
  ) then
    create policy "Organization members can upload documentation captures"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'documentation-captures'
        and (storage.foldername(name))[1] = 'organizations'
        and exists (
          select 1
          from public.profiles
          where profiles.organization_id::text = (storage.foldername(name))[2]
            and profiles.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Organization members can read documentation captures'
  ) then
    create policy "Organization members can read documentation captures"
      on storage.objects for select
      to authenticated
      using (
        bucket_id = 'documentation-captures'
        and (storage.foldername(name))[1] = 'organizations'
        and exists (
          select 1
          from public.profiles
          where profiles.organization_id::text = (storage.foldername(name))[2]
            and profiles.user_id = auth.uid()
        )
      );
  end if;
end $$;
