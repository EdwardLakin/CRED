alter table public.organizations
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text unique,
  add column if not exists plan text check (plan in ('starter', 'pro', 'business')),
  add column if not exists subscription_status text,
  add column if not exists current_period_end timestamptz;

create or replace function public.set_organization_stripe_customer(
  p_organization_id uuid,
  p_stripe_customer_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where profiles.organization_id = p_organization_id
      and profiles.user_id = auth.uid()
      and profiles.role in ('owner', 'admin')
  ) then
    raise exception 'not authorized';
  end if;

  update public.organizations
  set stripe_customer_id = p_stripe_customer_id
  where id = p_organization_id;
end;
$$;

create or replace function public.sync_organization_subscription(
  p_organization_id uuid default null,
  p_stripe_customer_id text default null,
  p_stripe_subscription_id text default null,
  p_plan text default null,
  p_subscription_status text default null,
  p_current_period_end timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
begin
  if p_plan is not null and p_plan not in ('starter', 'pro', 'business') then
    raise exception 'invalid plan';
  end if;

  select organizations.id
    into v_organization_id
  from public.organizations
  where (p_organization_id is not null and organizations.id = p_organization_id)
     or (p_stripe_customer_id is not null and organizations.stripe_customer_id = p_stripe_customer_id)
     or (p_stripe_subscription_id is not null and organizations.stripe_subscription_id = p_stripe_subscription_id)
  order by case when organizations.id = p_organization_id then 0 else 1 end
  limit 1;

  if v_organization_id is null then
    raise exception 'organization not found for stripe sync';
  end if;

  update public.organizations
  set stripe_customer_id = coalesce(p_stripe_customer_id, stripe_customer_id),
      stripe_subscription_id = coalesce(p_stripe_subscription_id, stripe_subscription_id),
      plan = coalesce(p_plan, plan),
      subscription_status = coalesce(p_subscription_status, subscription_status),
      current_period_end = coalesce(p_current_period_end, current_period_end)
  where id = v_organization_id;
end;
$$;

grant execute on function public.set_organization_stripe_customer(uuid, text) to authenticated;
grant execute on function public.sync_organization_subscription(uuid, text, text, text, text, timestamptz) to anon, authenticated;
