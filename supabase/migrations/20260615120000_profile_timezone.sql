alter table public.profiles
  add column if not exists timezone text not null default 'UTC';

comment on column public.profiles.timezone is 'IANA timezone used for user-facing report, export, share, approval, signature, and activity timestamps.';
