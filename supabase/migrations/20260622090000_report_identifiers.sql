create table if not exists public.report_identifier_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_date date not null,
  last_sequence integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id, report_date)
);

alter table public.report_identifier_counters enable row level security;

drop policy if exists "Report identifier counters are organization scoped" on public.report_identifier_counters;
create policy "Report identifier counters are organization scoped"
  on public.report_identifier_counters
  for all
  using (exists (select 1 from public.profiles where profiles.organization_id = report_identifier_counters.organization_id and profiles.user_id = auth.uid()))
  with check (exists (select 1 from public.profiles where profiles.organization_id = report_identifier_counters.organization_id and profiles.user_id = auth.uid()));

create or replace function public.next_report_identifier(target_organization_id uuid, target_created_at timestamptz default now())
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  report_day date := (coalesce(target_created_at, now()) at time zone 'UTC')::date;
  next_sequence integer;
begin
  insert into public.report_identifier_counters (organization_id, report_date, last_sequence)
  values (target_organization_id, report_day, 1)
  on conflict (organization_id, report_date)
  do update set last_sequence = public.report_identifier_counters.last_sequence + 1,
                updated_at = now()
  returning last_sequence into next_sequence;

  return 'CRED-' || to_char(report_day, 'YYYYMMDD') || '-' || lpad(next_sequence::text, 6, '0');
end;
$$;

create or replace function public.assign_documentation_session_report_identifier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.display_id is null or new.display_id = '' then
    new.display_id := public.next_report_identifier(new.organization_id, new.created_at);
  end if;
  return new;
end;
$$;

drop trigger if exists documentation_sessions_report_identifier_before_insert on public.documentation_sessions;
create trigger documentation_sessions_report_identifier_before_insert
  before insert on public.documentation_sessions
  for each row
  execute function public.assign_documentation_session_report_identifier();

comment on column public.documentation_sessions.display_id is
  'Stable human-friendly report identifier generated as CRED-YYYYMMDD-######. User-entered reference text remains in session_metadata.reference_number.';

create index if not exists documentation_sessions_org_display_created_idx
  on public.documentation_sessions (organization_id, display_id, created_at desc)
  where display_id is not null;

create index if not exists documentation_sessions_org_created_date_idx
  on public.documentation_sessions (organization_id, ((created_at at time zone 'UTC')::date), created_at desc);

with ranked_sessions as (
  select
    id,
    organization_id,
    (coalesce(created_at, now()) at time zone 'UTC')::date as report_date,
    row_number() over (
      partition by organization_id, (coalesce(created_at, now()) at time zone 'UTC')::date
      order by coalesce(created_at, now()), id
    ) as sequence_number
  from public.documentation_sessions
  where display_id is null or display_id !~ '^CRED-[0-9]{8}-[0-9]{6}$'
)
update public.documentation_sessions sessions
set display_id = 'CRED-' || to_char(ranked_sessions.report_date, 'YYYYMMDD') || '-' || lpad(ranked_sessions.sequence_number::text, 6, '0')
from ranked_sessions
where sessions.id = ranked_sessions.id;

insert into public.report_identifier_counters (organization_id, report_date, last_sequence)
select
  organization_id,
  (coalesce(created_at, now()) at time zone 'UTC')::date as report_date,
  max(substring(display_id from 15 for 6)::integer) as last_sequence
from public.documentation_sessions
where display_id ~ '^CRED-[0-9]{8}-[0-9]{6}$'
group by organization_id, (coalesce(created_at, now()) at time zone 'UTC')::date
on conflict (organization_id, report_date)
do update set last_sequence = greatest(public.report_identifier_counters.last_sequence, excluded.last_sequence),
              updated_at = now();
