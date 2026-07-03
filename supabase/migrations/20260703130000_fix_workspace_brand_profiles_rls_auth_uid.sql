-- Fix workspace_brand_profiles RLS to compare auth.uid() with profiles.user_id
-- and allow authenticated active workspace members to save Report Studio branding.
-- The server action still derives organization_id from the authenticated profile;
-- these policies keep RLS as the final tenant boundary and do not use service role.

drop policy if exists "Workspace admins can insert brand profiles" on public.workspace_brand_profiles;
drop policy if exists "Workspace admins can update brand profiles" on public.workspace_brand_profiles;
drop policy if exists "Workspace members can insert brand profiles" on public.workspace_brand_profiles;
drop policy if exists "Workspace members can update brand profiles" on public.workspace_brand_profiles;

create policy "Workspace members can insert brand profiles"
  on public.workspace_brand_profiles for insert
  with check (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.organization_id = workspace_brand_profiles.organization_id
    )
    or exists (
      select 1
      from public.workspace_memberships wm
      where wm.user_id = auth.uid()
        and wm.workspace_id = workspace_brand_profiles.organization_id
        and wm.status = 'active'
        and wm.role in ('owner','admin','manager','member')
    )
  );

create policy "Workspace members can update brand profiles"
  on public.workspace_brand_profiles for update
  using (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.organization_id = workspace_brand_profiles.organization_id
    )
    or exists (
      select 1
      from public.workspace_memberships wm
      where wm.user_id = auth.uid()
        and wm.workspace_id = workspace_brand_profiles.organization_id
        and wm.status = 'active'
        and wm.role in ('owner','admin','manager','member')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.organization_id = workspace_brand_profiles.organization_id
    )
    or exists (
      select 1
      from public.workspace_memberships wm
      where wm.user_id = auth.uid()
        and wm.workspace_id = workspace_brand_profiles.organization_id
        and wm.status = 'active'
        and wm.role in ('owner','admin','manager','member')
    )
  );
