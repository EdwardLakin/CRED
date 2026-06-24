-- Read-only Phase 1 multi-workspace foundation verification checks.

-- Workspaces without billing accounts
select o.id, o.name, o.created_at
from public.organizations o
where o.billing_account_id is null
order by o.created_at nulls last, o.id;

-- Workspaces without active memberships
select o.id, o.name
from public.organizations o
where not exists (
  select 1 from public.workspace_memberships wm
  where wm.workspace_id = o.id and wm.status = 'active'
)
order by o.created_at nulls last, o.id;

-- Owners with multiple workspaces
select p.user_id as owner_user_id, count(distinct p.organization_id) as workspace_count, array_agg(distinct p.organization_id order by p.organization_id) as workspace_ids
from public.profiles p
where p.role = 'owner'
group by p.user_id
having count(distinct p.organization_id) > 1
order by workspace_count desc, p.user_id;

-- Owners with multiple billing accounts
select ba.owner_user_id, count(*) as billing_account_count, array_agg(ba.id order by ba.created_at, ba.id) as billing_account_ids
from public.billing_accounts ba
group by ba.owner_user_id
having count(*) > 1
order by billing_account_count desc, ba.owner_user_id;

-- Profiles not represented in workspace_memberships
select p.id as profile_id, p.user_id, p.organization_id, p.role
from public.profiles p
where not exists (
  select 1 from public.workspace_memberships wm
  where wm.workspace_id = p.organization_id and wm.user_id = p.user_id
)
order by p.created_at nulls last, p.id;

-- Memberships pointing to archived/deleted users where detectable
select wm.id as membership_id, wm.workspace_id, wm.user_id, wm.status, u.deleted_at as user_deleted_at, o.archived_at as workspace_archived_at
from public.workspace_memberships wm
left join auth.users u on u.id = wm.user_id
left join public.organizations o on o.id = wm.workspace_id
where u.deleted_at is not null or o.archived_at is not null
order by wm.updated_at desc, wm.id;

-- Duplicate active memberships
select workspace_id, user_id, count(*) as active_membership_count
from public.workspace_memberships
where status = 'active'
group by workspace_id, user_id
having count(*) > 1
order by active_membership_count desc, workspace_id, user_id;
