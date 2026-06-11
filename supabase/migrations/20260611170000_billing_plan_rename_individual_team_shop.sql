alter table public.organizations
  drop constraint if exists organizations_plan_check;

update public.organizations
set plan = case plan
  when 'starter' then 'individual'
  when 'pro' then 'team'
  when 'business' then 'shop'
  else plan
end
where plan in ('starter', 'pro', 'business');

alter table public.organizations
  add constraint organizations_plan_check check (plan in ('individual', 'team', 'shop', 'enterprise'));

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
  v_plan text;
begin
  if p_plan is not null then
    v_plan := case p_plan
      when 'starter' then 'individual'
      when 'pro' then 'team'
      when 'business' then 'shop'
      else p_plan
    end;

    if v_plan not in ('individual', 'team', 'shop', 'enterprise') then
      raise exception 'invalid plan';
    end if;
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
      plan = coalesce(v_plan, plan),
      subscription_status = coalesce(p_subscription_status, subscription_status),
      current_period_end = coalesce(p_current_period_end, current_period_end)
  where id = v_organization_id;
end;
$$;

grant execute on function public.sync_organization_subscription(uuid, text, text, text, text, timestamptz) to anon, authenticated;
