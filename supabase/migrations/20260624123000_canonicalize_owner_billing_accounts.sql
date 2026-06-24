-- Correct Phase 1 billing-account backfill to canonicalize one commercial account
-- for each legacy owner user across all workspaces they own. Organizations remain
-- the workspace table. Ownerless and multi-owner organizations are reported for
-- manual remediation and are not assigned arbitrarily.

create index if not exists billing_accounts_owner_created_id_idx
  on public.billing_accounts(owner_user_id, created_at, id);

comment on index public.billing_accounts_owner_created_id_idx is
  'Supports deterministic canonical billing-account selection per legacy owner. This is intentionally not unique so future transfers, co-ownership, and enterprise ownership models remain possible.';

do $$
begin
  create temporary table if not exists pg_temp.multi_workspace_billing_owner_groups (
    owner_user_id uuid primary key,
    canonical_billing_account_id uuid,
    canonical_name text,
    canonical_created_at timestamptz
  ) on commit drop;

  truncate table pg_temp.multi_workspace_billing_owner_groups;

  insert into pg_temp.multi_workspace_billing_owner_groups (
    owner_user_id,
    canonical_billing_account_id,
    canonical_name,
    canonical_created_at
  )
  with single_owner_workspaces as (
    select
      o.id as organization_id,
      o.name as organization_name,
      coalesce(o.created_at, now()) as organization_created_at,
      o.billing_account_id,
      min(p.user_id) as owner_user_id
    from public.organizations o
    join public.profiles p on p.organization_id = o.id and p.role = 'owner'
    group by o.id, o.name, o.created_at, o.billing_account_id
    having count(distinct p.user_id) = 1
  ), canonical_existing as (
    select distinct on (sow.owner_user_id)
      sow.owner_user_id,
      ba.id as billing_account_id,
      ba.name,
      ba.created_at
    from single_owner_workspaces sow
    join public.billing_accounts ba on ba.id = sow.billing_account_id
    where ba.owner_user_id = sow.owner_user_id
    order by sow.owner_user_id, ba.created_at asc, ba.id asc
  ), canonical_source as (
    select distinct on (sow.owner_user_id)
      sow.owner_user_id,
      sow.organization_name,
      sow.organization_created_at
    from single_owner_workspaces sow
    left join canonical_existing ce on ce.owner_user_id = sow.owner_user_id
    where ce.owner_user_id is null
    order by sow.owner_user_id, sow.organization_created_at asc, sow.organization_id asc
  ), inserted as (
    insert into public.billing_accounts (owner_user_id, name, created_at, updated_at)
    select owner_user_id, organization_name, organization_created_at, now()
    from canonical_source
    returning owner_user_id, id, name, created_at
  )
  select owner_user_id, billing_account_id, name, created_at from canonical_existing
  union all
  select owner_user_id, id, name, created_at from inserted;

  update public.organizations o
  set billing_account_id = owner_group.canonical_billing_account_id
  from (
    select
      o.id as organization_id,
      min(p.user_id) as owner_user_id
    from public.organizations o
    join public.profiles p on p.organization_id = o.id and p.role = 'owner'
    group by o.id
    having count(distinct p.user_id) = 1
  ) single_owner
  join pg_temp.multi_workspace_billing_owner_groups owner_group
    on owner_group.owner_user_id = single_owner.owner_user_id
  where o.id = single_owner.organization_id
    and o.billing_account_id is distinct from owner_group.canonical_billing_account_id;
end $$;

comment on table public.billing_accounts is
  'Commercial owner for one or more independently billed CRED workspaces. Legacy owner-user canonicalization may leave redundant unreferenced accounts for auditability; owner_user_id is intentionally not unique.';

-- Validation queries for migration logs / manual remediation. These are read-only.

select 'organizations_with_no_owner_profile' as validation_check, o.id as organization_id, o.name
from public.organizations o
where not exists (
  select 1 from public.profiles p where p.organization_id = o.id and p.role = 'owner'
)
order by o.created_at nulls last, o.id;

select 'organizations_with_more_than_one_owner_profile' as validation_check, o.id as organization_id, o.name, count(distinct p.user_id) as owner_count
from public.organizations o
join public.profiles p on p.organization_id = o.id and p.role = 'owner'
group by o.id, o.name
having count(distinct p.user_id) > 1
order by owner_count desc, o.id;

select 'organizations_with_null_billing_account_id' as validation_check, o.id as organization_id, o.name
from public.organizations o
where o.billing_account_id is null
order by o.created_at nulls last, o.id;

select 'owners_associated_with_multiple_organizations' as validation_check, p.user_id as owner_user_id, count(distinct p.organization_id) as workspace_count
from public.profiles p
where p.role = 'owner'
group by p.user_id
having count(distinct p.organization_id) > 1
order by workspace_count desc, p.user_id;

select 'organizations_with_no_membership_backfill' as validation_check, o.id as organization_id, o.name
from public.organizations o
where not exists (
  select 1 from public.workspace_memberships wm where wm.workspace_id = o.id
)
order by o.created_at nulls last, o.id;

select 'owners_with_multiple_billing_accounts_after_canonicalization' as validation_check, ba.owner_user_id, count(*) as billing_account_count,
       count(*) filter (where exists (select 1 from public.organizations o where o.billing_account_id = ba.id)) as referenced_billing_account_count
from public.billing_accounts ba
group by ba.owner_user_id
having count(*) > 1
order by billing_account_count desc, ba.owner_user_id;
