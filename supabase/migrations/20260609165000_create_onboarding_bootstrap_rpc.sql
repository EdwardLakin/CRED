create or replace function public.create_onboarding_workspace(
  p_full_name text,
  p_company_name text,
  p_industry text
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
  v_industry public.industry;
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

  if p_industry is null or trim(p_industry) = '' then
    raise exception 'Industry is required'
      using errcode = '22023';
  end if;

  begin
    v_industry := trim(p_industry)::public.industry;
  exception
    when invalid_text_representation then
      raise exception 'Industry is invalid'
        using errcode = '22023';
  end;

  select profiles.organization_id
    into v_existing_organization_id
  from public.profiles
  where profiles.id = v_user_id
  limit 1;

  if v_existing_organization_id is not null then
    return v_existing_organization_id;
  end if;

  insert into public.organizations (name, created_by)
  values (v_company_name, v_user_id)
  returning id into v_organization_id;

  insert into public.profiles (id, organization_id, full_name, role)
  values (v_user_id, v_organization_id, v_full_name, 'owner');

  insert into public.company_profiles (organization_id, industry)
  values (v_organization_id, v_industry);

  return v_organization_id;
end;
$$;

revoke all on function public.create_onboarding_workspace(text, text, text) from public;
revoke all on function public.create_onboarding_workspace(text, text, text) from anon;
grant execute on function public.create_onboarding_workspace(text, text, text) to authenticated;
