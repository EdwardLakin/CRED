alter table public.organizations
  add column if not exists included_seats integer,
  add column if not exists additional_seats integer not null default 0,
  add column if not exists seat_packs integer not null default 0;

alter table public.organizations
  add constraint organizations_included_seats_nonnegative check (included_seats is null or included_seats >= 0) not valid,
  add constraint organizations_additional_seats_nonnegative check (additional_seats >= 0) not valid,
  add constraint organizations_seat_packs_nonnegative check (seat_packs >= 0) not valid;
