create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now()
);

create table public.company_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  company_name text not null,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.company_profiles enable row level security;

create policy "Authenticated users can create organizations"
  on public.organizations for insert
  to authenticated
  with check (true);

create policy "Organization members can read organizations"
  on public.organizations for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.organization_id = organizations.id
        and profiles.user_id = auth.uid()
    )
  );

create policy "Users can create their owner profile"
  on public.profiles for insert
  to authenticated
  with check (user_id = auth.uid() and role = 'owner');

create policy "Users can read their profile"
  on public.profiles for select
  to authenticated
  using (user_id = auth.uid());

create policy "Organization owners can create company profiles"
  on public.company_profiles for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.organization_id = company_profiles.organization_id
        and profiles.user_id = auth.uid()
        and profiles.role = 'owner'
    )
  );

create policy "Organization members can read company profiles"
  on public.company_profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.organization_id = company_profiles.organization_id
        and profiles.user_id = auth.uid()
    )
  );
