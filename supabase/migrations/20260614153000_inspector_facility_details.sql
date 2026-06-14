alter table public.profiles
  add column if not exists inspector_role_or_title text,
  add column if not exists technician_license_number text,
  add column if not exists inspector_phone text,
  add column if not exists inspector_email text,
  add column if not exists default_signature_path text,
  add column if not exists use_default_signature boolean not null default false;

alter table public.company_profiles
  add column if not exists facility_name text,
  add column if not exists facility_number text,
  add column if not exists facility_address_line_1 text,
  add column if not exists facility_address_line_2 text,
  add column if not exists facility_city text,
  add column if not exists facility_region text,
  add column if not exists facility_postal_code text,
  add column if not exists facility_country text,
  add column if not exists facility_phone text,
  add column if not exists facility_email text,
  add column if not exists permit_number text,
  add column if not exists certification_number text;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can update their profile settings') then
    create policy "Users can update their profile settings"
      on public.profiles for update
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'company_profiles' and policyname = 'Organization admins can update company profiles') then
    create policy "Organization admins can update company profiles"
      on public.company_profiles for update
      to authenticated
      using (
        exists (
          select 1 from public.profiles
          where profiles.organization_id = company_profiles.organization_id
            and profiles.user_id = auth.uid()
            and profiles.role in ('owner', 'admin')
        )
      )
      with check (
        exists (
          select 1 from public.profiles
          where profiles.organization_id = company_profiles.organization_id
            and profiles.user_id = auth.uid()
            and profiles.role in ('owner', 'admin')
        )
      );
  end if;
end $$;
