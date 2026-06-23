# Database bootstrap and migration-chain validation

## Root cause

The committed migration chain started after part of the production schema already existed. A brand-new Supabase project could apply the onboarding migrations, but `20260609190000_session_capture_intake.sql` referenced `public.documentation_sessions` before any repository migration created that table.

The repair is repository-level: `supabase/migrations/20260609180000_core_schema_foundation.sql` restores the minimal pre-existing core session foundation required by later migrations. It does not copy production rows, auth users, organization data, evidence, storage objects, or secrets.

## Missing foundational objects found

The dependency audit found these repository objects referenced before creation:

- `public.documentation_sessions` was referenced by the session capture intake migration and many later report/evidence migrations before being created.
- `public.is_org_member(uuid)` was used by evidence deliverable RLS policies before being created.
- Compatibility helper names `public.is_organization_member(uuid)` and `public.is_organization_admin(uuid)` were absent from the committed chain, even though the project documentation and later RLS conventions expect those helpers to exist.

No production schema metadata was available in this task environment, so the repair was reconstructed from committed migrations, generated database types, and application queries only. Do not treat this as a production schema parity certificate.

## Migration added

`20260609180000_core_schema_foundation.sql` runs after:

- `20260609032000_auth_onboarding_foundation.sql`
- `20260609165000_create_onboarding_bootstrap_rpc.sql`

and before:

- `20260609190000_session_capture_intake.sql`

That order is intentional because the restored `documentation_sessions` table has foreign keys to `public.organizations` and `public.profiles`, which are created by the onboarding foundation migration, and it must exist before capture/timeline migrations add foreign keys to it.

## Objects created by the foundation migration

- `public.documentation_sessions` with the baseline session columns required before later additive migrations run:
  - `id`
  - `organization_id`
  - `created_by`
  - `title`
  - `session_type`
  - `status`
  - `asset_label`
  - `vin`
  - `odometer`
  - `unit_number`
  - `customer_name`
  - `created_at`
  - `updated_at`
- RLS enabled on `public.documentation_sessions`.
- Organization-scoped indexes for session lookup.
- `public.is_org_member(uuid)`.
- `public.is_organization_member(uuid)`.
- `public.is_organization_admin(uuid)`.
- Organization-scoped session select/insert/update policies.

Columns that later migrations add, such as `suggested_details`, `field_service_details`, `workflow_template_id`, review fields, archive/delete/display fields, final notes, and report metadata, intentionally remain in their later migrations so replay order stays compatible.

## Clean database setup procedure

Use only disposable local or dedicated test databases for destructive reset commands.

Preferred local validation:

```bash
npx supabase start
npx supabase db reset
```

Dedicated empty CRED Test project validation:

```bash
npx supabase link --project-ref <test-project-ref>
npx supabase db push
```

Warnings:

- Never run `supabase db reset` against production.
- Never mark old migrations as applied just to bypass missing schema.
- Never manually create missing tables only in the test project; the repository migration chain must remain the source of truth.
- Schema-only metadata may be compared when production access is explicitly available, but rows, auth users, organizations, sessions, evidence, customer records, storage objects, and secrets must not be copied.

## Automated validation

The static dependency guard is part of the normal test suite:

```bash
npm run test
```

It verifies deterministic migration ordering and the known repaired dependencies, including that `documentation_sessions` exists before `20260609190000_session_capture_intake.sql`.

## Remaining drift risks

- This repair was not compared to live production schema metadata in the task environment.
- Local Supabase CLI execution may be unavailable in restricted environments; if so, run `npx supabase db reset` locally or `npx supabase db push` against the dedicated empty CRED Test project before claiming real clean-database success.
- Any future migration that references a table/function before creating it should add a dependency assertion to `tests/migration-chain-dependencies.test.mjs`.
