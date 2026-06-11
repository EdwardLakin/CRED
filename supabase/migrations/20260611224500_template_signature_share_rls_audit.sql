-- Security audit patch for template imports/workflow templates, signature captures,
-- report share tokens, and their private storage buckets.
-- Manual QA checklist after applying this migration:
-- 1. User in org A cannot select, update, archive, or delete org B templates/imports/evidence rows.
-- 2. User in org A cannot select, insert, update, or delete org B signatures.
-- 3. User in org A cannot select, create, disable, or delete org B report share tokens.
-- 4. Storage upload/update/delete fails outside organizations/{userOrgId}/... in documentation-templates, documentation-signatures, and documentation-captures.
-- 5. Storage read fails outside organizations/{userOrgId}/... in those private buckets.

update storage.buckets
set public = false
where id in ('documentation-captures', 'documentation-templates', 'documentation-signatures');

alter table public.template_imports enable row level security;
alter table public.documentation_workflow_templates enable row level security;
alter table public.template_required_evidence enable row level security;
alter table public.signature_captures enable row level security;
alter table public.report_share_tokens enable row level security;

comment on table public.report_share_tokens is
  'Secure report sharing links. No anon RLS policy is granted: public share pages must validate a single token through a server route/service-role path instead of exposing token rows directly.';

do $$
begin
  drop policy if exists "Organization members can read template imports" on public.template_imports;
  create policy "Organization members can read template imports"
    on public.template_imports for select
    to authenticated
    using (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = template_imports.organization_id
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can create template imports" on public.template_imports;
  create policy "Organization members can create template imports"
    on public.template_imports for insert
    to authenticated
    with check (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = template_imports.organization_id
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can update template imports" on public.template_imports;
  create policy "Organization members can update template imports"
    on public.template_imports for update
    to authenticated
    using (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = template_imports.organization_id
          and profiles.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = template_imports.organization_id
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can delete template imports" on public.template_imports;
  create policy "Organization members can delete template imports"
    on public.template_imports for delete
    to authenticated
    using (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = template_imports.organization_id
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can read workflow templates" on public.documentation_workflow_templates;
  create policy "Organization members can read workflow templates"
    on public.documentation_workflow_templates for select
    to authenticated
    using (
      organization_id is not null
      and exists (
        select 1 from public.profiles
        where profiles.organization_id = documentation_workflow_templates.organization_id
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can create workflow templates" on public.documentation_workflow_templates;
  create policy "Organization members can create workflow templates"
    on public.documentation_workflow_templates for insert
    to authenticated
    with check (
      organization_id is not null
      and exists (
        select 1 from public.profiles
        where profiles.organization_id = documentation_workflow_templates.organization_id
          and profiles.user_id = auth.uid()
      )
      and (
        source_import_id is null
        or exists (
          select 1 from public.template_imports
          where template_imports.id = documentation_workflow_templates.source_import_id
            and template_imports.organization_id = documentation_workflow_templates.organization_id
        )
      )
    );

  drop policy if exists "Organization members can update workflow templates" on public.documentation_workflow_templates;
  create policy "Organization members can update workflow templates"
    on public.documentation_workflow_templates for update
    to authenticated
    using (
      organization_id is not null
      and exists (
        select 1 from public.profiles
        where profiles.organization_id = documentation_workflow_templates.organization_id
          and profiles.user_id = auth.uid()
      )
    )
    with check (
      organization_id is not null
      and exists (
        select 1 from public.profiles
        where profiles.organization_id = documentation_workflow_templates.organization_id
          and profiles.user_id = auth.uid()
      )
      and (
        source_import_id is null
        or exists (
          select 1 from public.template_imports
          where template_imports.id = documentation_workflow_templates.source_import_id
            and template_imports.organization_id = documentation_workflow_templates.organization_id
        )
      )
    );

  drop policy if exists "Organization members can delete workflow templates" on public.documentation_workflow_templates;
  create policy "Organization members can delete workflow templates"
    on public.documentation_workflow_templates for delete
    to authenticated
    using (
      organization_id is not null
      and exists (
        select 1 from public.profiles
        where profiles.organization_id = documentation_workflow_templates.organization_id
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can read template evidence" on public.template_required_evidence;
  create policy "Organization members can read template evidence"
    on public.template_required_evidence for select
    to authenticated
    using (
      organization_id is not null
      and exists (
        select 1 from public.profiles
        where profiles.organization_id = template_required_evidence.organization_id
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_workflow_templates
        where documentation_workflow_templates.id = template_required_evidence.template_id
          and documentation_workflow_templates.organization_id = template_required_evidence.organization_id
      )
    );

  drop policy if exists "Organization members can create template evidence" on public.template_required_evidence;
  create policy "Organization members can create template evidence"
    on public.template_required_evidence for insert
    to authenticated
    with check (
      organization_id is not null
      and exists (
        select 1 from public.profiles
        where profiles.organization_id = template_required_evidence.organization_id
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_workflow_templates
        where documentation_workflow_templates.id = template_required_evidence.template_id
          and documentation_workflow_templates.organization_id = template_required_evidence.organization_id
      )
    );

  drop policy if exists "Organization members can update template evidence" on public.template_required_evidence;
  create policy "Organization members can update template evidence"
    on public.template_required_evidence for update
    to authenticated
    using (
      organization_id is not null
      and exists (
        select 1 from public.profiles
        where profiles.organization_id = template_required_evidence.organization_id
          and profiles.user_id = auth.uid()
      )
    )
    with check (
      organization_id is not null
      and exists (
        select 1 from public.profiles
        where profiles.organization_id = template_required_evidence.organization_id
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_workflow_templates
        where documentation_workflow_templates.id = template_required_evidence.template_id
          and documentation_workflow_templates.organization_id = template_required_evidence.organization_id
      )
    );

  drop policy if exists "Organization members can delete template evidence" on public.template_required_evidence;
  create policy "Organization members can delete template evidence"
    on public.template_required_evidence for delete
    to authenticated
    using (
      organization_id is not null
      and exists (
        select 1 from public.profiles
        where profiles.organization_id = template_required_evidence.organization_id
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can read signature captures" on public.signature_captures;
  create policy "Organization members can read signature captures"
    on public.signature_captures for select
    to authenticated
    using (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = signature_captures.organization_id
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can create signature captures" on public.signature_captures;
  create policy "Organization members can create signature captures"
    on public.signature_captures for insert
    to authenticated
    with check (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = signature_captures.organization_id
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_sessions
        where documentation_sessions.id = signature_captures.documentation_session_id
          and documentation_sessions.organization_id = signature_captures.organization_id
      )
    );

  drop policy if exists "Organization members can update signature captures" on public.signature_captures;
  create policy "Organization members can update signature captures"
    on public.signature_captures for update
    to authenticated
    using (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = signature_captures.organization_id
          and profiles.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = signature_captures.organization_id
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_sessions
        where documentation_sessions.id = signature_captures.documentation_session_id
          and documentation_sessions.organization_id = signature_captures.organization_id
      )
    );

  drop policy if exists "Organization members can delete signature captures" on public.signature_captures;
  create policy "Organization members can delete signature captures"
    on public.signature_captures for delete
    to authenticated
    using (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = signature_captures.organization_id
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can read report share tokens" on public.report_share_tokens;
  create policy "Organization members can read report share tokens"
    on public.report_share_tokens for select
    to authenticated
    using (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = report_share_tokens.organization_id
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can create report share tokens" on public.report_share_tokens;
  create policy "Organization members can create report share tokens"
    on public.report_share_tokens for insert
    to authenticated
    with check (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = report_share_tokens.organization_id
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_sessions
        where documentation_sessions.id = report_share_tokens.documentation_session_id
          and documentation_sessions.organization_id = report_share_tokens.organization_id
      )
    );

  drop policy if exists "Organization members can update report share tokens" on public.report_share_tokens;
  create policy "Organization members can update report share tokens"
    on public.report_share_tokens for update
    to authenticated
    using (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = report_share_tokens.organization_id
          and profiles.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = report_share_tokens.organization_id
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_sessions
        where documentation_sessions.id = report_share_tokens.documentation_session_id
          and documentation_sessions.organization_id = report_share_tokens.organization_id
      )
    );

  drop policy if exists "Organization members can delete report share tokens" on public.report_share_tokens;
  create policy "Organization members can delete report share tokens"
    on public.report_share_tokens for delete
    to authenticated
    using (
      exists (
        select 1 from public.profiles
        where profiles.organization_id = report_share_tokens.organization_id
          and profiles.user_id = auth.uid()
      )
    );
end $$;

-- Private storage policies: every object path must begin with organizations/{organizationId}/
-- and the authenticated user must belong to that organization. Share links deliberately
-- receive signed URLs from server-side token validation instead of public bucket access.
do $$
begin
  drop policy if exists "Organization members can upload documentation templates" on storage.objects;
  create policy "Organization members can upload documentation templates"
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'documentation-templates'
      and (storage.foldername(name))[1] = 'organizations'
      and (storage.foldername(name))[3] = 'templates'
      and array_length(storage.foldername(name), 1) = 3
      and storage.filename(name) <> ''
      and exists (
        select 1 from public.profiles
        where profiles.organization_id::text = (storage.foldername(name))[2]
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can read documentation templates" on storage.objects;
  create policy "Organization members can read documentation templates"
    on storage.objects for select
    to authenticated
    using (
      bucket_id = 'documentation-templates'
      and (storage.foldername(name))[1] = 'organizations'
      and (storage.foldername(name))[3] = 'templates'
      and array_length(storage.foldername(name), 1) = 3
      and storage.filename(name) <> ''
      and exists (
        select 1 from public.profiles
        where profiles.organization_id::text = (storage.foldername(name))[2]
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can update documentation templates" on storage.objects;
  create policy "Organization members can update documentation templates"
    on storage.objects for update
    to authenticated
    using (
      bucket_id = 'documentation-templates'
      and (storage.foldername(name))[1] = 'organizations'
      and (storage.foldername(name))[3] = 'templates'
      and array_length(storage.foldername(name), 1) = 3
      and storage.filename(name) <> ''
      and exists (
        select 1 from public.profiles
        where profiles.organization_id::text = (storage.foldername(name))[2]
          and profiles.user_id = auth.uid()
      )
    )
    with check (
      bucket_id = 'documentation-templates'
      and (storage.foldername(name))[1] = 'organizations'
      and (storage.foldername(name))[3] = 'templates'
      and array_length(storage.foldername(name), 1) = 3
      and storage.filename(name) <> ''
      and exists (
        select 1 from public.profiles
        where profiles.organization_id::text = (storage.foldername(name))[2]
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can delete documentation templates" on storage.objects;
  create policy "Organization members can delete documentation templates"
    on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'documentation-templates'
      and (storage.foldername(name))[1] = 'organizations'
      and (storage.foldername(name))[3] = 'templates'
      and array_length(storage.foldername(name), 1) = 3
      and storage.filename(name) <> ''
      and exists (
        select 1 from public.profiles
        where profiles.organization_id::text = (storage.foldername(name))[2]
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can upload documentation signatures" on storage.objects;
  create policy "Organization members can upload documentation signatures"
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'documentation-signatures'
      and (storage.foldername(name))[1] = 'organizations'
      and (storage.foldername(name))[3] = 'sessions'
      and (storage.foldername(name))[5] = 'signatures'
      and array_length(storage.foldername(name), 1) = 5
      and storage.filename(name) <> ''
      and exists (
        select 1 from public.profiles
        where profiles.organization_id::text = (storage.foldername(name))[2]
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_sessions
        where documentation_sessions.id::text = (storage.foldername(name))[4]
          and documentation_sessions.organization_id::text = (storage.foldername(name))[2]
      )
    );

  drop policy if exists "Organization members can read documentation signatures" on storage.objects;
  create policy "Organization members can read documentation signatures"
    on storage.objects for select
    to authenticated
    using (
      bucket_id = 'documentation-signatures'
      and (storage.foldername(name))[1] = 'organizations'
      and (storage.foldername(name))[3] = 'sessions'
      and (storage.foldername(name))[5] = 'signatures'
      and array_length(storage.foldername(name), 1) = 5
      and storage.filename(name) <> ''
      and exists (
        select 1 from public.profiles
        where profiles.organization_id::text = (storage.foldername(name))[2]
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_sessions
        where documentation_sessions.id::text = (storage.foldername(name))[4]
          and documentation_sessions.organization_id::text = (storage.foldername(name))[2]
      )
    );

  drop policy if exists "Organization members can update documentation signatures" on storage.objects;
  create policy "Organization members can update documentation signatures"
    on storage.objects for update
    to authenticated
    using (
      bucket_id = 'documentation-signatures'
      and (storage.foldername(name))[1] = 'organizations'
      and (storage.foldername(name))[3] = 'sessions'
      and (storage.foldername(name))[5] = 'signatures'
      and array_length(storage.foldername(name), 1) = 5
      and storage.filename(name) <> ''
      and exists (
        select 1 from public.profiles
        where profiles.organization_id::text = (storage.foldername(name))[2]
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_sessions
        where documentation_sessions.id::text = (storage.foldername(name))[4]
          and documentation_sessions.organization_id::text = (storage.foldername(name))[2]
      )
    )
    with check (
      bucket_id = 'documentation-signatures'
      and (storage.foldername(name))[1] = 'organizations'
      and (storage.foldername(name))[3] = 'sessions'
      and (storage.foldername(name))[5] = 'signatures'
      and array_length(storage.foldername(name), 1) = 5
      and storage.filename(name) <> ''
      and exists (
        select 1 from public.profiles
        where profiles.organization_id::text = (storage.foldername(name))[2]
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_sessions
        where documentation_sessions.id::text = (storage.foldername(name))[4]
          and documentation_sessions.organization_id::text = (storage.foldername(name))[2]
      )
    );

  drop policy if exists "Organization members can delete documentation signatures" on storage.objects;
  create policy "Organization members can delete documentation signatures"
    on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'documentation-signatures'
      and (storage.foldername(name))[1] = 'organizations'
      and (storage.foldername(name))[3] = 'sessions'
      and (storage.foldername(name))[5] = 'signatures'
      and array_length(storage.foldername(name), 1) = 5
      and storage.filename(name) <> ''
      and exists (
        select 1 from public.profiles
        where profiles.organization_id::text = (storage.foldername(name))[2]
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_sessions
        where documentation_sessions.id::text = (storage.foldername(name))[4]
          and documentation_sessions.organization_id::text = (storage.foldername(name))[2]
      )
    );

  drop policy if exists "Organization members can update documentation captures" on storage.objects;
  create policy "Organization members can update documentation captures"
    on storage.objects for update
    to authenticated
    using (
      bucket_id = 'documentation-captures'
      and (storage.foldername(name))[1] = 'organizations'
      and (storage.foldername(name))[3] = 'sessions'
      and (storage.foldername(name))[5] = 'captures'
      and array_length(storage.foldername(name), 1) = 5
      and storage.filename(name) <> ''
      and exists (
        select 1 from public.profiles
        where profiles.organization_id::text = (storage.foldername(name))[2]
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_sessions
        where documentation_sessions.id::text = (storage.foldername(name))[4]
          and documentation_sessions.organization_id::text = (storage.foldername(name))[2]
      )
    )
    with check (
      bucket_id = 'documentation-captures'
      and (storage.foldername(name))[1] = 'organizations'
      and (storage.foldername(name))[3] = 'sessions'
      and (storage.foldername(name))[5] = 'captures'
      and array_length(storage.foldername(name), 1) = 5
      and storage.filename(name) <> ''
      and exists (
        select 1 from public.profiles
        where profiles.organization_id::text = (storage.foldername(name))[2]
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_sessions
        where documentation_sessions.id::text = (storage.foldername(name))[4]
          and documentation_sessions.organization_id::text = (storage.foldername(name))[2]
      )
    );
end $$;
