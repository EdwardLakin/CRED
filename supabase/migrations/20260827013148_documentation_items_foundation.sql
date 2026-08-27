-- First-class session items. Capture rows remain the durable media records,
-- while documentation_items provide a stable parent that survives concurrent
-- uploads, offline reloads, and retries.

begin;

create unique index if not exists documentation_sessions_id_organization_idx
  on public.documentation_sessions (id, organization_id);

create table public.documentation_items (
  id uuid primary key default gen_random_uuid(),
  documentation_session_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_item_id text not null,
  item_kind text not null default 'observation',
  item_order integer not null default 1,
  title text,
  description text,
  include_in_report boolean not null default true,
  review_status text not null default 'unreviewed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint documentation_items_client_item_id_check
    check (length(btrim(client_item_id)) between 1 and 160),
  constraint documentation_items_kind_check
    check (item_kind in ('observation', 'document', 'note')),
  constraint documentation_items_order_check
    check (item_order > 0),
  constraint documentation_items_review_status_check
    check (review_status in ('unreviewed', 'reviewed', 'needs_followup', 'excluded')),
  constraint documentation_items_scope_unique
    unique (id, documentation_session_id, organization_id),
  constraint documentation_items_client_scope_unique
    unique (organization_id, documentation_session_id, client_item_id),
  constraint documentation_items_session_scope_fkey
    foreign key (documentation_session_id, organization_id)
    references public.documentation_sessions (id, organization_id)
    on delete cascade
);

comment on table public.documentation_items is
  'Stable, user-facing session items. Media and notes are ordered attachments in capture_items.';

comment on column public.documentation_items.client_item_id is
  'Client-generated idempotency key retained by the offline queue across reload and retry.';

comment on column public.documentation_items.item_kind is
  'User-facing source kind: observation, document, or note.';

create index documentation_items_session_order_idx
  on public.documentation_items (documentation_session_id, organization_id, item_order, created_at)
  where deleted_at is null;

alter table public.documentation_items enable row level security;

revoke all on table public.documentation_items from public, anon;
grant select, insert, update, delete on table public.documentation_items to authenticated;
grant all on table public.documentation_items to service_role;

create policy "Organization members can read documentation items"
  on public.documentation_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.organization_id = documentation_items.organization_id
        and profiles.user_id = (select auth.uid())
    )
  );

create policy "Organization members can create documentation items"
  on public.documentation_items for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.organization_id = documentation_items.organization_id
        and profiles.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.documentation_sessions
      where documentation_sessions.id = documentation_items.documentation_session_id
        and documentation_sessions.organization_id = documentation_items.organization_id
        and documentation_sessions.deleted_at is null
    )
  );

create policy "Organization members can update documentation items"
  on public.documentation_items for update
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
      from public.profiles
      where profiles.organization_id = documentation_items.organization_id
        and profiles.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.documentation_sessions
      where documentation_sessions.id = documentation_items.documentation_session_id
        and documentation_sessions.organization_id = documentation_items.organization_id
        and documentation_sessions.deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.organization_id = documentation_items.organization_id
        and profiles.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.documentation_sessions
      where documentation_sessions.id = documentation_items.documentation_session_id
        and documentation_sessions.organization_id = documentation_items.organization_id
        and documentation_sessions.deleted_at is null
    )
  );

create policy "Organization members can delete documentation items"
  on public.documentation_items for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.organization_id = documentation_items.organization_id
        and profiles.user_id = (select auth.uid())
    )
  );

create function public.prevent_documentation_item_scope_retarget()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.documentation_session_id is distinct from old.documentation_session_id
    or new.client_item_id is distinct from old.client_item_id then
    raise exception 'Documentation item ownership fields cannot be changed';
  end if;

  if old.deleted_at is not null then
    raise exception 'Deleted documentation items cannot be updated';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.prevent_documentation_item_scope_retarget() from public, anon, authenticated;
grant execute on function public.prevent_documentation_item_scope_retarget() to service_role;

create trigger prevent_documentation_item_scope_retarget
  before update on public.documentation_items
  for each row
  execute function public.prevent_documentation_item_scope_retarget();

alter table public.capture_items
  add column documentation_item_id uuid,
  add column attachment_order integer,
  add column attachment_kind text;

-- Legacy observation_group_id uses the first capture id as its root. Coalescing
-- it with capture_items.id safely preserves both grouped and standalone rows.
with grouped_captures as (
  select
    capture_items.organization_id,
    capture_items.documentation_session_id,
    coalesce(capture_items.observation_group_id, capture_items.id)::text as client_item_id,
    min(coalesce(capture_items.report_order, 2147483647)) as first_report_order,
    min(capture_items.captured_at) as first_captured_at,
    min(capture_items.created_at) as first_created_at,
    max(capture_items.updated_at) as last_updated_at,
    case
      when bool_or(
        capture_items.type = 'document'
        or capture_items.media_kind = 'document'
        or capture_items.extracted_data ? 'source_document'
      ) then 'document'
      when bool_and(
        capture_items.type in ('voice_note', 'text_note')
        or capture_items.media_kind in ('audio', 'note')
      ) then 'note'
      else 'observation'
    end as item_kind,
    bool_or(capture_items.include_in_report) as include_in_report,
    case
      when bool_and(capture_items.evidence_review_status = 'excluded') then 'excluded'
      when bool_and(capture_items.evidence_review_status = 'reviewed') then 'reviewed'
      when bool_or(capture_items.evidence_review_status = 'needs_followup') then 'needs_followup'
      else 'unreviewed'
    end as review_status,
    case
      when bool_and(capture_items.deleted_at is not null) then max(capture_items.deleted_at)
      else null
    end as deleted_at
  from public.capture_items
  group by
    capture_items.organization_id,
    capture_items.documentation_session_id,
    coalesce(capture_items.observation_group_id, capture_items.id)::text
), ranked_items as (
  select
    grouped_captures.*,
    row_number() over (
      partition by grouped_captures.organization_id, grouped_captures.documentation_session_id
      order by
        grouped_captures.first_report_order,
        grouped_captures.first_captured_at,
        grouped_captures.first_created_at,
        grouped_captures.client_item_id
    )::integer as item_order
  from grouped_captures
)
insert into public.documentation_items (
  organization_id,
  documentation_session_id,
  client_item_id,
  item_kind,
  item_order,
  include_in_report,
  review_status,
  created_at,
  updated_at,
  deleted_at
)
select
  ranked_items.organization_id,
  ranked_items.documentation_session_id,
  ranked_items.client_item_id,
  ranked_items.item_kind,
  ranked_items.item_order,
  ranked_items.include_in_report,
  ranked_items.review_status,
  ranked_items.first_created_at,
  ranked_items.last_updated_at,
  ranked_items.deleted_at
from ranked_items;

with ranked_attachments as (
  select
    capture_items.id as capture_item_id,
    documentation_items.id as documentation_item_id,
    documentation_items.item_kind,
    row_number() over (
      partition by documentation_items.id
      order by
        coalesce(capture_items.group_order, 1),
        capture_items.captured_at,
        capture_items.created_at,
        capture_items.id
    )::integer as attachment_order
  from public.capture_items
  join public.documentation_items
    on documentation_items.organization_id = capture_items.organization_id
    and documentation_items.documentation_session_id = capture_items.documentation_session_id
    and documentation_items.client_item_id = coalesce(capture_items.observation_group_id, capture_items.id)::text
)
update public.capture_items
set
  documentation_item_id = ranked_attachments.documentation_item_id,
  attachment_order = ranked_attachments.attachment_order,
  attachment_kind = case
    when ranked_attachments.item_kind = 'document' then 'document'
    when ranked_attachments.item_kind = 'note' then 'note'
    when ranked_attachments.attachment_order = 1 then 'primary'
    else 'supporting'
  end
from ranked_attachments
where capture_items.id = ranked_attachments.capture_item_id;

alter table public.capture_items
  alter column documentation_item_id set not null,
  alter column attachment_order set not null,
  alter column attachment_kind set not null,
  add constraint capture_items_attachment_order_check
    check (attachment_order > 0),
  add constraint capture_items_attachment_kind_check
    check (attachment_kind in ('primary', 'supporting', 'document', 'note')),
  add constraint capture_items_documentation_item_order_unique
    unique (documentation_item_id, attachment_order),
  add constraint capture_items_documentation_item_scope_fkey
    foreign key (documentation_item_id, documentation_session_id, organization_id)
    references public.documentation_items (id, documentation_session_id, organization_id)
    on delete cascade;

comment on column public.capture_items.documentation_item_id is
  'Stable parent item for this media or note attachment.';

comment on column public.capture_items.attachment_order is
  'One-based order within documentation_item_id.';

comment on column public.capture_items.attachment_kind is
  'Attachment role within its parent item.';

create index capture_items_documentation_item_order_idx
  on public.capture_items (documentation_item_id, attachment_order, captured_at)
  where deleted_at is null;

-- Compatibility for insert paths that have not yet adopted client_item_id.
-- New capture paths should create/find documentation_items by client_item_id
-- first and provide documentation_item_id plus explicit attachment ordering.
create function public.attach_capture_to_documentation_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_client_item_id text;
  v_documentation_item_id uuid;
  v_item_kind text;
  v_attachment_order_shifted boolean := false;
begin
  if new.documentation_item_id is null then
    v_client_item_id := coalesce(new.observation_group_id, new.id)::text;
    v_item_kind := case
      when new.type = 'document'
        or new.media_kind = 'document'
        or new.extracted_data ? 'source_document' then 'document'
      when new.type in ('voice_note', 'text_note')
        or new.media_kind in ('audio', 'note') then 'note'
      else 'observation'
    end;

    insert into public.documentation_items (
      organization_id,
      documentation_session_id,
      client_item_id,
      item_kind,
      item_order,
      include_in_report,
      review_status,
      created_at,
      updated_at
    )
    values (
      new.organization_id,
      new.documentation_session_id,
      v_client_item_id,
      v_item_kind,
      coalesce((
        select max(documentation_items.item_order) + 1
        from public.documentation_items
        where documentation_items.organization_id = new.organization_id
          and documentation_items.documentation_session_id = new.documentation_session_id
      ), 1),
      new.include_in_report,
      case
        when new.evidence_review_status in ('reviewed', 'needs_followup', 'excluded')
          then new.evidence_review_status
        else 'unreviewed'
      end,
      new.created_at,
      new.updated_at
    )
    on conflict (organization_id, documentation_session_id, client_item_id)
    do nothing;

    select documentation_items.id
    into v_documentation_item_id
    from public.documentation_items
    where documentation_items.organization_id = new.organization_id
      and documentation_items.documentation_session_id = new.documentation_session_id
      and documentation_items.client_item_id = v_client_item_id;

    if v_documentation_item_id is null then
      raise exception 'Unable to resolve documentation item for capture';
    end if;

    new.documentation_item_id := v_documentation_item_id;
  end if;

  if new.attachment_order is null or new.attachment_order < 1 then
    select coalesce(max(capture_items.attachment_order), 0) + 1
    into new.attachment_order
    from public.capture_items
    where capture_items.documentation_item_id = new.documentation_item_id;
    v_attachment_order_shifted := true;
  end if;

  -- Serialize order allocation per item. Explicit client order is retained
  -- when free; a genuine collision is moved to the next available position.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.documentation_item_id::text, 0)
  );

  if exists (
    select 1
    from public.capture_items
    where capture_items.documentation_item_id = new.documentation_item_id
      and capture_items.attachment_order = new.attachment_order
      and capture_items.storage_path is distinct from new.storage_path
  ) then
    select coalesce(max(capture_items.attachment_order), 0) + 1
    into new.attachment_order
    from public.capture_items
    where capture_items.documentation_item_id = new.documentation_item_id;
    v_attachment_order_shifted := true;
  end if;

  if new.attachment_kind is null then
    new.attachment_kind := case
      when new.type = 'document'
        or new.media_kind = 'document'
        or new.extracted_data ? 'source_document' then 'document'
      when new.type in ('voice_note', 'text_note')
        or new.media_kind in ('audio', 'note') then 'note'
      when new.attachment_order = 1 then 'primary'
      else 'supporting'
    end;
  elsif v_attachment_order_shifted
    and new.attachment_kind in ('primary', 'supporting') then
    new.attachment_kind := case
      when new.attachment_order = 1 then 'primary'
      else 'supporting'
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.attach_capture_to_documentation_item() from public, anon, authenticated;
grant execute on function public.attach_capture_to_documentation_item() to service_role;

create trigger attach_capture_to_documentation_item
  before insert on public.capture_items
  for each row
  execute function public.attach_capture_to_documentation_item();

create function public.sync_primary_capture_note_to_documentation_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.attachment_kind = 'primary' and tg_op = 'INSERT' then
    update public.documentation_items
    set description = nullif(btrim(new.technician_note), '')
    where documentation_items.id = new.documentation_item_id
      and documentation_items.documentation_session_id = new.documentation_session_id
      and documentation_items.organization_id = new.organization_id;
  elsif new.attachment_kind = 'primary'
    and (
      new.technician_note is distinct from old.technician_note
      or new.documentation_item_id is distinct from old.documentation_item_id
      or new.attachment_kind is distinct from old.attachment_kind
    ) then
    update public.documentation_items
    set description = nullif(btrim(new.technician_note), '')
    where documentation_items.id = new.documentation_item_id
      and documentation_items.documentation_session_id = new.documentation_session_id
      and documentation_items.organization_id = new.organization_id;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_primary_capture_note_to_documentation_item() from public, anon, authenticated;
grant execute on function public.sync_primary_capture_note_to_documentation_item() to service_role;

create trigger sync_primary_capture_note_to_documentation_item
  after insert or update on public.capture_items
  for each row
  execute function public.sync_primary_capture_note_to_documentation_item();

create function public.soft_delete_documentation_item(
  p_session_id uuid,
  p_documentation_item_id uuid
)
returns table (storage_path text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_deleted_at timestamptz := now();
begin
  select documentation_items.organization_id
  into v_organization_id
  from public.documentation_items
  where documentation_items.id = p_documentation_item_id
    and documentation_items.documentation_session_id = p_session_id
    and documentation_items.deleted_at is null;

  if v_organization_id is null then
    raise exception 'Documentation item not found';
  end if;

  return query
  update public.capture_items
  set
    deleted_at = v_deleted_at,
    updated_at = v_deleted_at
  where capture_items.documentation_item_id = p_documentation_item_id
    and capture_items.documentation_session_id = p_session_id
    and capture_items.organization_id = v_organization_id
    and capture_items.deleted_at is null
  returning capture_items.storage_path;

  update public.documentation_items
  set deleted_at = v_deleted_at
  where documentation_items.id = p_documentation_item_id
    and documentation_items.documentation_session_id = p_session_id
    and documentation_items.organization_id = v_organization_id
    and documentation_items.deleted_at is null;

  if not found then
    raise exception 'Documentation item could not be deleted';
  end if;
end;
$$;

revoke all on function public.soft_delete_documentation_item(uuid, uuid) from public, anon;
grant execute on function public.soft_delete_documentation_item(uuid, uuid) to authenticated, service_role;

commit;
