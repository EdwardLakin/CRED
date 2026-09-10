-- Restore public.set_updated_at() and the updated_at triggers that depend on it
-- into the committed chain.
--
-- Found while addressing review feedback on the migration that precedes this
-- one: production carries a public.set_updated_at() trigger function and eight
-- triggers bound to it, but *no migration in this repository creates either*.
-- They exist in production only through the hand-applied schema drift recorded
-- in docs/STATE.md. The practical consequence is worse than a failed REVOKE: a
-- database built purely from this chain silently stops maintaining updated_at
-- on organizations, profiles, company_profiles, documentation_sessions and
-- capture_items, because neither the function nor its triggers are ever created.
--
-- public.set_updated_at() is byte-identical in body to public.touch_updated_at()
-- (which the chain does create). It is the older of the two duplicates. This
-- migration reproduces it as production has it rather than rewriting call sites,
-- so that a fresh database and production converge; consolidating the two onto
-- one function is a separate change with its own trigger churn.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Sets updated_at on modification. Retained duplicate of public.touch_updated_at(); both are referenced by existing triggers.';

-- Trigger functions are invoked by the trigger machinery as the table owner and
-- need no direct EXECUTE grant, matching 20260910000000.
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- Attach the triggers production carries. Each is guarded on the table actually
-- existing: documentation_templates, findings and subscriptions are themselves
-- absent from this migration chain (also drift — see docs/STATE.md), so on a
-- fresh database those three are skipped rather than aborting the replay. On
-- production, where all eight tables exist, every trigger is (re)created.
do $$
declare
  target_table text;
  trigger_name text;
begin
  foreach target_table in array array[
    'organizations',
    'profiles',
    'company_profiles',
    'documentation_sessions',
    'documentation_templates',
    'capture_items',
    'findings',
    'subscriptions'
  ]
  loop
    if to_regclass('public.' || target_table) is null then
      continue;
    end if;

    trigger_name := 'set_' || target_table || '_updated_at';

    execute format(
      'drop trigger if exists %I on public.%I',
      trigger_name, target_table
    );

    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      trigger_name, target_table
    );
  end loop;
end $$;
