alter table public.capture_items
  alter column storage_path drop not null;

do $$
declare
  v_constraint_name text;
begin
  for v_constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'capture_items'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%type%'
  loop
    execute format('alter table public.capture_items drop constraint %I', v_constraint_name);
  end loop;

  alter table public.capture_items
    add constraint capture_items_type_check
    check (type in ('photo', 'document', 'vin_plate', 'info_plate', 'voice_note', 'text_note', 'video', 'evidence_video'));
end $$;

alter table public.capture_items
  drop constraint if exists capture_items_media_kind_check,
  add constraint capture_items_media_kind_check check (media_kind in ('image', 'video', 'audio', 'document', 'note'));

comment on column public.capture_items.storage_path is
  'Nullable for text-only evidence records that do not upload a media object.';
