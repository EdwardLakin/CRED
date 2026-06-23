alter table public.report_share_tokens
  add column if not exists link_kind text not null default 'report',
  add column if not exists deliverable_id uuid references public.evidence_deliverables(id) on delete cascade;

alter table public.report_share_tokens drop constraint if exists report_share_tokens_link_kind_check;
alter table public.report_share_tokens add constraint report_share_tokens_link_kind_check check (link_kind in ('report', 'deliverable'));
alter table public.report_share_tokens drop constraint if exists report_share_tokens_target_check;
alter table public.report_share_tokens add constraint report_share_tokens_target_check check ((link_kind = 'report' and deliverable_id is null) or (link_kind = 'deliverable' and deliverable_id is not null));

create index if not exists report_share_tokens_deliverable_id_idx on public.report_share_tokens(deliverable_id) where deliverable_id is not null;
create index if not exists report_share_tokens_org_session_kind_idx on public.report_share_tokens(organization_id, documentation_session_id, link_kind);
create index if not exists report_share_tokens_active_deliverable_idx on public.report_share_tokens(organization_id, documentation_session_id, deliverable_id) where link_kind = 'deliverable' and disabled_at is null;

comment on column public.report_share_tokens.link_kind is 'Share-link target kind. Deliverable links resolve only through the server token path.';
comment on column public.report_share_tokens.deliverable_id is 'Exact finalized evidence_deliverables row shared by this secure token.';
