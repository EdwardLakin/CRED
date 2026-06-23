# Evidence Workspace live integration and browser smoke testing

PR 12 converts the PR 11 scaffolding into explicitly invoked, executable suites for live Supabase RLS verification and Chromium browser smoke coverage. These suites are intentionally **not** part of `npm run test` because they require destructive test-project setup and deployed E2E credentials.

## Commands

```sh
npm install
npm run test
npm run test:integration
npx playwright install --with-deps chromium
npm run test:e2e
```

`npm run test` continues to run only non-secret-dependent Node tests. `npm run test:integration` and `npm run test:e2e` fail clearly when required environment variables are missing; they do not silently skip explicit runs.

## Dedicated Supabase test project setup

1. Create a Supabase project used only for automated RLS testing.
2. Apply the repository migrations in order.
3. Ensure email/password auth is enabled for the test project.
4. Use the project URL, anon key, and service-role key only in local shell variables or CI secrets.
5. Never include production Supabase URLs in the test URL, credentials, or seeded user accounts.

### Required live RLS variables

```sh
export SUPABASE_TEST_URL="https://your-test-project.supabase.co"
export SUPABASE_TEST_ANON_KEY="..."
export SUPABASE_TEST_SERVICE_ROLE_KEY="..."
export SUPABASE_TEST_ALLOW_DESTRUCTIVE="evidence-workspace-rls"
export SUPABASE_PRODUCTION_URLS="https://your-production-project.supabase.co,https://another-prod-project.supabase.co"
```

Safety behavior:

- The suite refuses to run unless `SUPABASE_TEST_ALLOW_DESTRUCTIVE` is exactly `evidence-workspace-rls`.
- The suite refuses to run when `SUPABASE_TEST_URL` matches any comma-separated entry in `SUPABASE_PRODUCTION_URLS`.
- Missing variables fail the command with a clear message.
- Secrets are never printed.

## Live fixture behavior

`tests/helpers/supabase-test-environment.mjs` creates a unique run identifier such as `cred-rls-<timestamp>-<random>`, then uses the service-role client for setup and teardown only. It creates:

- two auth users;
- two organizations;
- matching owner profiles and company profiles;
- Organization A sessions A1 and A2;
- Organization B session B1;
- seeded capture items, timeline events, entities, factual observations, relationships, AI suggestions, and deliverables;
- a soft-deleted endpoint and historical soft-deleted relationship for Organization A.

All tenancy assertions use authenticated anon clients for User A and User B. Cleanup deletes test records and auth users in `after`, including after assertion failures.

## Live assertions

`npm run test:integration` executes real PostgREST operations against Supabase and verifies:

- cross-organization reads are denied in both directions;
- cross-organization inserts, updates, soft deletes, suggestion reviews, and deliverable mutations are denied;
- direct guessed-ID reads and updates cannot bypass RLS;
- cross-session and deleted endpoint relationship inserts fail clearly;
- duplicate active relationships fail with PostgreSQL code `23505` and map to `This relationship already exists.`;
- soft-deleted relationship history remains preserved while recreating an active relationship succeeds;
- suggestions start as `suggested`, can be reviewed only in-scope, and do not change without human action;
- deliverables are visible in-scope and isolated across organizations.

Expected successful output includes:

```text
Live Supabase RLS integration tests
- cross-org reads: passed
- cross-org writes: passed
- guessed ID access: passed
- cross-session relationship rejection: passed
- deleted endpoint rejection: passed
- duplicate relationship enforcement: passed
- suggestion isolation: passed
- deliverable isolation: passed
- cleanup: passed
```

## Playwright E2E setup

Install browsers explicitly after dependencies are available:

```sh
npx playwright install --with-deps chromium
```

Use a deployed non-production environment with a dedicated E2E account and organization. The account should be safe to mutate and may contain deterministic seeded evidence/suggestions so the smoke tests can review existing suggestions without calling an AI provider.

### Required E2E variables

```sh
export E2E_BASE_URL="https://your-preview-or-staging-app.example"
export E2E_TEST_USER_EMAIL="e2e-user@example.invalid"
export E2E_TEST_USER_PASSWORD="..."
export E2E_ALLOW_TEST_RUN="cred-e2e"
export E2E_PRODUCTION_URLS="https://app.your-production-domain.example"
```

Safety behavior:

- The runner refuses to start unless `E2E_ALLOW_TEST_RUN=cred-e2e`.
- The runner refuses to start if `E2E_BASE_URL` matches `E2E_PRODUCTION_URLS`.
- Missing variables fail with a clear message.
- The password is never printed.

## Playwright configuration

`playwright.config.js` uses `E2E_BASE_URL`, Chromium only, one worker, conservative CI retries, screenshots on failure, first-retry traces, and artifacts under ignored `playwright-report/` and `test-results/` directories. It does not start a local web server unless future maintainers add that explicitly.

## CI readiness

Do not wire these commands into required PR checks until secrets and a safe test deployment exist. Optional workflow steps can run:

```sh
npm run test:integration
npm run test:e2e
```

Required CI secrets are the Supabase variables above for integration tests and the E2E variables above for browser tests.

## Troubleshooting

- **Missing env error:** export every required variable for the suite you explicitly invoked.
- **Production URL refusal:** remove production URLs from test variables or point the command at a dedicated staging/test project.
- **RLS assertion failure:** inspect the named assertion; do not weaken policies unless the failed live assertion proves a policy defect.
- **Playwright package missing:** run `npm install`; if your registry blocks Playwright, resolve registry access first.
- **Browser missing:** run `npx playwright install --with-deps chromium`.
- **No seeded suggestions:** seed deterministic suggestions in the E2E organization before running browser smoke tests.

## Known limitations

The suites are optional because they depend on external Supabase and deployed-app infrastructure. The browser tests intentionally avoid AI provider calls and require deterministic seeded state for suggestion-review branches.
