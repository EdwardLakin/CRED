alter table public.organizations
  add column if not exists image_ai_assist_enabled boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'organizations'
      and policyname = 'Organization owners and admins can update workspace settings'
  ) then
    create policy "Organization owners and admins can update workspace settings"
      on public.organizations for update
      to authenticated
      using (
        exists (
          select 1 from public.profiles
          where profiles.organization_id = organizations.id
            and profiles.user_id = auth.uid()
            and profiles.role in ('owner', 'admin')
        )
      )
      with check (
        exists (
          select 1 from public.profiles
          where profiles.organization_id = organizations.id
            and profiles.user_id = auth.uid()
            and profiles.role in ('owner', 'admin')
        )
      );
  end if;
end $$;
