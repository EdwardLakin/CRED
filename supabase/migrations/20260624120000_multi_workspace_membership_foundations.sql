-- Phase 1: multi-workspace foundations while preserving organizations as the workspace table.

create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organizations
  add column if not exists billing_account_id uuid references public.billing_accounts(id) on delete restrict,
  add column if not exists workspace_type text not null default 'general',
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.organizations
  drop constraint if exists organizations_workspace_type_check;

alter table public.organizations
  add constraint organizations_workspace_type_check
  check (workspace_type in ('team', 'shop', 'office', 'location', 'matter', 'general'));

create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'member', 'viewer')),
  status text not null default 'active' check (status in ('invited', 'active', 'removed', 'archived')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists billing_accounts_owner_user_id_idx on public.billing_accounts(owner_user_id);
create index if not exists organizations_billing_account_id_idx on public.organizations(billing_account_id);
create index if not exists organizations_active_workspace_idx on public.organizations(id) where archived_at is null;
create index if not exists workspace_memberships_user_status_idx on public.workspace_memberships(user_id, status);
create index if not exists workspace_memberships_workspace_status_idx on public.workspace_memberships(workspace_id, status);

alter table public.billing_accounts enable row level security;
alter table public.workspace_memberships enable row level security;

do $$
declare
  workspace_record record;
  v_billing_account_id uuid;
begin
  for workspace_record in
    select distinct on (o.id)
      o.id as organization_id,
      o.name,
      coalesce(o.created_at, now()) as created_at,
      p.user_id as owner_user_id
    from public.organizations o
    join public.profiles p on p.organization_id = o.id
    where p.role = 'owner'
      and o.billing_account_id is null
    order by o.id, p.created_at nulls last
  loop
    insert into public.billing_accounts (owner_user_id, name, created_at, updated_at)
    values (workspace_record.owner_user_id, workspace_record.name, workspace_record.created_at, now())
    returning id into v_billing_account_id;

    update public.organizations
    set billing_account_id = v_billing_account_id
    where id = workspace_record.organization_id;
  end loop;
end $$;

insert into public.workspace_memberships (workspace_id, user_id, role, status, joined_at, created_at, updated_at)
select
  p.organization_id,
  p.user_id,
  case p.role
    when 'owner' then 'owner'
    when 'admin' then 'admin'
    when 'reviewer' then 'viewer'
    else 'member'
  end,
  'active',
  coalesce(p.created_at, now()),
  coalesce(p.created_at, now()),
  now()
from public.profiles p
on conflict (workspace_id, user_id) do update
set role = excluded.role,
    status = 'active',
    joined_at = coalesce(public.workspace_memberships.joined_at, excluded.joined_at),
    updated_at = now();

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    join public.organizations o on o.id = wm.workspace_id
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and o.archived_at is null
  ) or exists (
    select 1
    from public.profiles p
    join public.organizations o on o.id = p.organization_id
    where p.organization_id = target_workspace_id
      and p.user_id = auth.uid()
      and o.archived_at is null
  );
$$;

create or replace function public.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    join public.organizations o on o.id = wm.workspace_id
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.role in ('owner', 'admin')
      and o.archived_at is null
  ) or exists (
    select 1
    from public.profiles p
    join public.organizations o on o.id = p.organization_id
    where p.organization_id = target_workspace_id
      and p.user_id = auth.uid()
      and p.role in ('owner', 'admin')
      and o.archived_at is null
  );
$$;

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.is_workspace_member(target_organization_id); $$;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.is_workspace_member(target_organization_id); $$;

create or replace function public.is_organization_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.is_workspace_admin(target_organization_id); $$;

create policy "Billing account owners can read billing accounts"
  on public.billing_accounts for select
  to authenticated
  using (
    owner_user_id = auth.uid()
    or exists (
      select 1 from public.organizations o
      where o.billing_account_id = billing_accounts.id
        and public.is_workspace_admin(o.id)
    )
  );

create policy "Billing account owners can update billing accounts"
  on public.billing_accounts for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "Workspace members can read memberships"
  on public.workspace_memberships for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Workspace admins can manage memberships"
  on public.workspace_memberships for all
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

comment on table public.billing_accounts is 'Commercial owner for one or more independently billed CRED workspaces.';
comment on table public.workspace_memberships is 'Many-to-many workspace memberships. Organizations are the workspace table during migration.';
comment on column public.organizations.workspace_type is 'Workspace shape such as team, shop, office, location, matter, or general. It does not determine billing tier.';
