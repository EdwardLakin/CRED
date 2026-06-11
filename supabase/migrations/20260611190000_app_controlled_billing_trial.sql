alter table public.organizations
  add column if not exists trial_ends_at timestamptz,
  add column if not exists billing_started_at timestamptz;

update public.organizations
set trial_ends_at = coalesce(current_period_end, created_at, now())
where subscription_status = 'trialing'
  and trial_ends_at is null;

create or replace function public.create_onboarding_workspace(
  p_full_name text,
  p_company_name text,
  p_industry text,
  p_plan text default 'individual'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_full_name text := nullif(trim(p_full_name), '');
  v_company_name text := nullif(trim(p_company_name), '');
  v_industry text := nullif(trim(p_industry), '');
  v_plan text := coalesce(nullif(trim(p_plan), ''), 'individual');
  v_existing_organization_id uuid;
  v_organization_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to create an onboarding workspace'
      using errcode = '28000';
  end if;

  if v_full_name is null then
    raise exception 'Full name is required'
      using errcode = '22023';
  end if;

  if v_company_name is null then
    raise exception 'Company name is required'
      using errcode = '22023';
  end if;

  if v_industry is null then
    raise exception 'Industry is required'
      using errcode = '22023';
  end if;

  if v_plan not in ('individual', 'team', 'shop') then
    v_plan := 'individual';
  end if;

  select profiles.organization_id
    into v_existing_organization_id
  from public.profiles
  where profiles.user_id = v_user_id
  limit 1;

  if v_existing_organization_id is not null then
    return v_existing_organization_id;
  end if;

  insert into public.organizations (
    name,
    industry,
    plan,
    subscription_status,
    trial_ends_at
  )
  values (
    v_company_name,
    v_industry,
    v_plan,
    'trialing',
    now() + interval '7 days'
  )
  returning id into v_organization_id;

  insert into public.profiles (user_id, organization_id, full_name, role)
  values (v_user_id, v_organization_id, v_full_name, 'owner');

  insert into public.company_profiles (organization_id, company_name)
  values (v_organization_id, v_company_name);

  return v_organization_id;
end;
$$;

revoke all on function public.create_onboarding_workspace(text, text, text) from public;
revoke all on function public.create_onboarding_workspace(text, text, text) from anon;
revoke all on function public.create_onboarding_workspace(text, text, text, text) from public;
revoke all on function public.create_onboarding_workspace(text, text, text, text) from anon;
grant execute on function public.create_onboarding_workspace(text, text, text, text) to authenticated;

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
      current_period_end = coalesce(p_current_period_end, current_period_end),
      billing_started_at = case
        when p_subscription_status in ('active', 'trialing') then coalesce(billing_started_at, now())
        else billing_started_at
      end
  where id = v_organization_id;
end;
$$;

grant execute on function public.sync_organization_subscription(uuid, text, text, text, text, timestamptz) to anon, authenticated;
