# Evidence Workspace integration and smoke testing

PR 11 adds security/reliability coverage around Evidence Workspace tenancy, relationship integrity, and critical browser flows.

## Architecture

- `npm run test` runs non-secret-dependent Node tests and static regression checks.
- `npm run test:integration` is reserved for live Supabase RLS tests against a dedicated test project.
- `npm run test:e2e` runs Playwright browser smoke tests against an explicitly configured E2E environment.
- Service-role credentials are only for controlled setup/teardown. User assertions must use separate authenticated clients for each seeded user.

## Required live Supabase variables

Never use production credentials.

```sh
SUPABASE_TEST_URL=
SUPABASE_TEST_ANON_KEY=
SUPABASE_TEST_SERVICE_ROLE_KEY=
SUPABASE_TEST_ALLOW_DESTRUCTIVE=evidence-workspace-rls
SUPABASE_PRODUCTION_URLS=https://your-production-project.supabase.co
```

The destructive guard refuses setup unless `SUPABASE_TEST_ALLOW_DESTRUCTIVE` is exactly `evidence-workspace-rls` and the test URL is not listed in `SUPABASE_PRODUCTION_URLS`.

## Seed model

Create two isolated organizations with one authenticated user each. For each organization seed one documentation session, capture item, timeline event, entity, factual observation, relationship, AI suggestion, and deliverable. Organization A also has a second session for cross-session relationship rejection checks.

## Setup

1. Create a dedicated Supabase project for testing.
2. Apply all migrations with the Supabase CLI or dashboard SQL editor.
3. Export the variables above in a local `.env.test` or CI secret store.
4. Seed with the service-role client, then run assertions with authenticated user clients.

## Commands

```sh
npm run test
npm run test:integration
npm run test:e2e
```

## Required assertions

The live RLS suite should verify cross-organization read/write denial, suggestion review isolation, deliverable isolation and mutation denial, guessed UUID access denial, cross-session relationship rejection, deleted endpoint rejection, duplicate active relationship enforcement, and soft-deleted relationship recreation.

## Browser smoke tests

The Playwright smoke tests cover Evidence Workspace create/open session, add evidence, Evidence Library, timeline, entity, factual observation, relationship, seeded AI suggestion accept/edit-and-accept/reject, deliverable generation/detail/printable views, plus the legacy Capture → Review → Generate report → Edit → Approve → Export workflow.

## Limitations

The checked-in live integration file skips cleanly without credentials and currently documents the guard/coverage contract. It must be connected to the dedicated seeded Supabase project before claiming live RLS verification in CI.
