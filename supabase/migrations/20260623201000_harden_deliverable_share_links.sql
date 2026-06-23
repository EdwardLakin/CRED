-- Harden deliverable share links for concurrent creation and view tracking.

set search_path = public, pg_temp;

with duplicate_open_deliverable_links as (
  select id, row_number() over (partition by deliverable_id order by created_at desc, id desc) as rn
  from public.report_share_tokens
  where link_kind = 'deliverable'
    and deliverable_id is not null
    and disabled_at is null
)
update public.report_share_tokens tokens
set disabled_at = now()
from duplicate_open_deliverable_links duplicates
where tokens.id = duplicates.id
  and duplicates.rn > 1;

create unique index if not exists report_share_tokens_one_open_deliverable_idx
  on public.report_share_tokens(deliverable_id)
  where link_kind = 'deliverable' and deliverable_id is not null and disabled_at is null;

create or replace function public.increment_deliverable_share_token_view(p_token_id uuid)
returns public.report_share_tokens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated public.report_share_tokens;
begin
  update public.report_share_tokens
  set view_count = coalesce(view_count, 0) + 1,
      last_viewed_at = now()
  where id = p_token_id
    and link_kind = 'deliverable'
  returning * into updated;

  if updated.id is null then
    raise exception 'Share link not found';
  end if;

  return updated;
end;
$$;

revoke all on function public.increment_deliverable_share_token_view(uuid) from public;
revoke all on function public.increment_deliverable_share_token_view(uuid) from anon;
revoke all on function public.increment_deliverable_share_token_view(uuid) from authenticated;

grant execute on function public.increment_deliverable_share_token_view(uuid) to service_role;

comment on function public.increment_deliverable_share_token_view(uuid) is
  'Server-only atomic view counter update for resolved deliverable share links.';
