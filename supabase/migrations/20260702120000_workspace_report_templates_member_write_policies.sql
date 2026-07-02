-- Allow authenticated workspace members to manage report templates only inside their own organization.
-- The original policies compared profiles.id to auth.uid(); profiles.id is the app profile id,
-- while auth.uid() is auth.users.id and should be matched to profiles.user_id.
alter table public.workspace_report_templates enable row level security;

drop policy if exists "Workspace members can read report templates" on public.workspace_report_templates;
drop policy if exists "Workspace admins can insert report templates" on public.workspace_report_templates;
drop policy if exists "Workspace admins can update report templates" on public.workspace_report_templates;
drop policy if exists "Workspace admins can delete report templates" on public.workspace_report_templates;

create policy "Workspace members can read report templates"
  on public.workspace_report_templates
  for select
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.organization_id = workspace_report_templates.organization_id
  ));

create policy "Workspace members can insert report templates"
  on public.workspace_report_templates
  for insert
  with check (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.organization_id = workspace_report_templates.organization_id
  ));

create policy "Workspace members can update report templates"
  on public.workspace_report_templates
  for update
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.organization_id = workspace_report_templates.organization_id
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.organization_id = workspace_report_templates.organization_id
  ));

create policy "Workspace admins can delete report templates"
  on public.workspace_report_templates
  for delete
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.organization_id = workspace_report_templates.organization_id
      and p.role in ('owner','admin')
  ));
