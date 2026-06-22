alter table public.capture_items
  add column if not exists observation_group_id uuid,
  add column if not exists group_order integer;

comment on column public.capture_items.observation_group_id is
  'Optional user-directed observation group id. Captures sharing this id render as one documented observation with supporting media.';

comment on column public.capture_items.group_order is
  'Optional display order for captures within an observation group.';

create index if not exists capture_items_observation_group_idx
  on public.capture_items (documentation_session_id, organization_id, observation_group_id, group_order, captured_at)
  where observation_group_id is not null and deleted_at is null;
