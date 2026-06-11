alter table public.documentation_sessions
  add column if not exists review_status text not null default 'draft',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.documentation_sessions
  drop constraint if exists documentation_sessions_review_status_check;

alter table public.documentation_sessions
  add constraint documentation_sessions_review_status_check
    check (review_status in ('draft', 'ready_for_delivery', 'delivered'));

create index if not exists documentation_sessions_review_status_idx
  on public.documentation_sessions(organization_id, review_status);

comment on column public.documentation_sessions.review_status is
  'Human review gate for final report delivery. draft can be edited, ready_for_delivery can be delivered, delivered records completed delivery.';
comment on column public.documentation_sessions.reviewed_at is
  'Timestamp when a workspace member marked the report reviewed and ready for delivery.';
comment on column public.documentation_sessions.reviewed_by is
  'Profile that marked the report reviewed and ready for delivery.';
