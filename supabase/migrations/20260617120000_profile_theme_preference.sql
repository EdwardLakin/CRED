alter table public.profiles
  add column if not exists theme_preference text null check (theme_preference in ('light', 'dark', 'system'));

comment on column public.profiles.theme_preference is 'Nullable user theme preference. Null defaults to dark mode in the application.';
