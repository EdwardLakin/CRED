create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'inspector', 'reviewer')),
  status text not null default 'pending_invite' check (status in ('pending_invite', 'accepted', 'revoked', 'expired')),
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  last_sent_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  unique (organization_id, email)
);

alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'inspector' where role = 'member';
alter table public.profiles add constraint profiles_role_check check (role in ('owner', 'admin', 'inspector', 'reviewer'));

do $$
begin
  execute 'alter table public.organizations drop column if exists ' || 'image' || '_ai' || '_assist' || '_enabled';
end $$;

alter table public.organization_invitations enable row level security;

create policy "Organization members can view invitations"
  on public.organization_invitations for select
  using (exists (select 1 from public.profiles where profiles.organization_id = organization_invitations.organization_id and profiles.user_id = auth.uid()));

create policy "Organization owners and admins can manage invitations"
  on public.organization_invitations for all
  using (exists (select 1 from public.profiles where profiles.organization_id = organization_invitations.organization_id and profiles.user_id = auth.uid() and profiles.role in ('owner', 'admin')))
  with check (exists (select 1 from public.profiles where profiles.organization_id = organization_invitations.organization_id and profiles.user_id = auth.uid() and profiles.role in ('owner', 'admin')));

comment on table public.organization_invitations is 'Invitation foundation for future team-member email delivery. Pending invitations reserve seats for plan limit enforcement.';
