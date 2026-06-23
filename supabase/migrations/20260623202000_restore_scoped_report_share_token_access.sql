-- Restore authenticated, organization-scoped management access for report share tokens.
-- Public token resolution remains server-only: anon has no table access and the
-- deliverable view-count RPC remains service-role-only.

set search_path = public, pg_temp;

alter table public.report_share_tokens enable row level security;

revoke all on table public.report_share_tokens from anon;
revoke all on table public.report_share_tokens from authenticated;
grant select, insert, update on table public.report_share_tokens to authenticated;

create or replace function public.reject_report_share_token_retargeting()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.documentation_session_id is distinct from old.documentation_session_id
    or new.deliverable_id is distinct from old.deliverable_id
    or new.link_kind is distinct from old.link_kind
    or new.token is distinct from old.token
    or new.created_by is distinct from old.created_by then
    raise exception 'Share token target fields cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists report_share_tokens_reject_retargeting on public.report_share_tokens;
create trigger report_share_tokens_reject_retargeting
  before update on public.report_share_tokens
  for each row
  execute function public.reject_report_share_token_retargeting();

revoke all on function public.reject_report_share_token_retargeting() from public;
revoke all on function public.reject_report_share_token_retargeting() from anon;
revoke all on function public.reject_report_share_token_retargeting() from authenticated;

do $$
begin
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
      created_by is not null
      and exists (
        select 1 from public.profiles
        where profiles.id = report_share_tokens.created_by
          and profiles.organization_id = report_share_tokens.organization_id
          and profiles.user_id = auth.uid()
      )
      and exists (
        select 1 from public.documentation_sessions
        where documentation_sessions.id = report_share_tokens.documentation_session_id
          and documentation_sessions.organization_id = report_share_tokens.organization_id
          and documentation_sessions.deleted_at is null
      )
      and (
        (
          link_kind = 'report'
          and deliverable_id is null
        )
        or (
          link_kind = 'deliverable'
          and deliverable_id is not null
          and exists (
            select 1 from public.evidence_deliverables
            where evidence_deliverables.id = report_share_tokens.deliverable_id
              and evidence_deliverables.organization_id = report_share_tokens.organization_id
              and evidence_deliverables.documentation_session_id = report_share_tokens.documentation_session_id
              and evidence_deliverables.deleted_at is null
              and evidence_deliverables.status = 'final'
          )
        )
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
      and exists (
        select 1 from public.documentation_sessions
        where documentation_sessions.id = report_share_tokens.documentation_session_id
          and documentation_sessions.organization_id = report_share_tokens.organization_id
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
          and documentation_sessions.deleted_at is null
      )
      and (
        (
          link_kind = 'report'
          and deliverable_id is null
        )
        or (
          link_kind = 'deliverable'
          and deliverable_id is not null
          and exists (
            select 1 from public.evidence_deliverables
            where evidence_deliverables.id = report_share_tokens.deliverable_id
              and evidence_deliverables.organization_id = report_share_tokens.organization_id
              and evidence_deliverables.documentation_session_id = report_share_tokens.documentation_session_id
              and evidence_deliverables.deleted_at is null
              and evidence_deliverables.status = 'final'
          )
        )
      )
    );
end $$;

revoke all on function public.increment_deliverable_share_token_view(uuid) from public;
revoke all on function public.increment_deliverable_share_token_view(uuid) from anon;
revoke all on function public.increment_deliverable_share_token_view(uuid) from authenticated;
grant execute on function public.increment_deliverable_share_token_view(uuid) to service_role;
