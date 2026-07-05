alter table public.capture_items
  add column if not exists customer_facing_observation text,
  add column if not exists original_technician_note text,
  add column if not exists last_ai_observation text;

update public.capture_items
set original_technician_note = technician_note
where original_technician_note is null
  and technician_note is not null;

comment on column public.capture_items.customer_facing_observation is 'Editable customer-facing observation text for this individual capture. Export falls back to technician_note when empty.';
comment on column public.capture_items.original_technician_note is 'Technician note snapshot used to restore an individual capture customer-facing observation.';
comment on column public.capture_items.last_ai_observation is 'Most recent AI-generated customer-facing observation for this individual capture.';
