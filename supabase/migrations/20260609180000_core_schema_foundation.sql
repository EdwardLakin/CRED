-- Core schema objects that pre-dated the committed migration chain in production.
-- This migration is intentionally minimal and guarded so an empty database can
-- replay later migrations, while production-like databases keep existing data.

create table if not exists public.documentation_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete set null,
  title text not null,
  session_type text not null default 'General Evidence Report',
  status text not null default 'active',
  asset_label text,
  vin text,
  odometer text,
  unit_number text,
  customer_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.documentation_sessions
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists title text,
  add column if not exists session_type text not null default 'General Evidence Report',
  add column if not exists status text not null default 'active',
  add column if not exists asset_label text,
  add column if not exists vin text,
  add column if not exists odometer text,
  add column if not exists unit_number text,
  add column if not exists customer_name text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
declare
  v_invalid_columns text;
begin
  select string_agg(expected.column_name, ', ' order by expected.column_name)
    into v_invalid_columns
  from (
    values
      ('id', 'uuid'),
      ('organization_id', 'uuid'),
      ('created_by', 'uuid'),
      ('title', 'text'),
      ('session_type', 'text'),
      ('status', 'text'),
      ('created_at', 'timestamp with time zone'),
      ('updated_at', 'timestamp with time zone')
  ) as expected(column_name, data_type)
  left join information_schema.columns columns
    on columns.table_schema = 'public'
   and columns.table_name = 'documentation_sessions'
   and columns.column_name = expected.column_name
   and columns.data_type = expected.data_type
  where columns.column_name is null;

  if v_invalid_columns is not null then
    raise exception 'public.documentation_sessions has incompatible foundational column definitions: %', v_invalid_columns;
  end if;
end $$;

alter table public.documentation_sessions enable row level security;

create index if not exists documentation_sessions_organization_id_idx
  on public.documentation_sessions (organization_id);

create index if not exists documentation_sessions_org_updated_idx
  on public.documentation_sessions (organization_id, updated_at desc);

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.organization_id = target_organization_id
      and profiles.user_id = auth.uid()
  );
$$;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_org_member(target_organization_id);
$$;

create or replace function public.is_organization_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.organization_id = target_organization_id
      and profiles.user_id = auth.uid()
      and profiles.role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.is_organization_admin(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;
grant execute on function public.is_organization_member(uuid) to authenticated, service_role;
grant execute on function public.is_organization_admin(uuid) to authenticated, service_role;

do $$
begin
  drop policy if exists "Organization members can read documentation sessions" on public.documentation_sessions;
  create policy "Organization members can read documentation sessions"
    on public.documentation_sessions for select
    to authenticated
    using (public.is_org_member(organization_id));

  drop policy if exists "Organization members can create documentation sessions" on public.documentation_sessions;
  create policy "Organization members can create documentation sessions"
    on public.documentation_sessions for insert
    to authenticated
    with check (public.is_org_member(organization_id));

  drop policy if exists "Organization members can update documentation sessions" on public.documentation_sessions;
  create policy "Organization members can update documentation sessions"
    on public.documentation_sessions for update
    to authenticated
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));
end $$;

comment on table public.documentation_sessions is
  'Core documentation workspace/session table restored to repair clean database bootstrap from repository migrations.';
