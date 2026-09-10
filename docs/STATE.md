# CRED — current state

Read this first when picking CRED back up. CRED is a side project worked in
bursts, so the expensive part of restarting is remembering where things stood.
Update this file whenever you change what is deployed or applied.

Last updated: 2026-09-10

## Where things run

| Piece | Status |
| --- | --- |
| Production database | Supabase project `CREDP` (`eanryhodbotrsrgtsyxl`, us-east-2, Postgres 17) |
| Shared test database | Supabase project `CRED test` (`qcupjulmgbmyxtqwlxlm`, us-west-2) — used by `.github/workflows/integration-e2e.yml` |
| Hosting | **Live at `cred.profixiq.com`.** Not under the Vercel team `edward-lakins-projects`, which contains only `pro-fix-iq` — the host for CRED is a different account or provider and is not recorded here yet. Fill this in. |
| Domain | `cred.profixiq.com`, serving |
| Analytics / error monitoring | None installed |

## Migration state

Repository and production are **in sync** as of 2026-09-10: 68 migration files,
68 rows in `supabase_migrations.schema_migrations`, latest
`20260910120000_clear_legacy_diagnostic_placeholder_bodies`.

How that sync was reached matters, because it was not a clean `supabase db push`:

- Production had drifted badly from its recorded history. Migration history
  stopped at `20260623131000` (23 June) while the schema itself had most later
  objects applied by hand through the dashboard, out of order.
- A marker-object audit found only five migrations genuinely unapplied:
  `20260624123000`, `20260630200000`, `20260827012954`, `20260827013148`, and
  `20260902120000`. Those were applied; the rest were verified present and their
  version rows backfilled so future pushes are a no-op.
- That reconciliation was **marker-based, not byte-for-byte**. Each migration was
  confirmed by checking for a distinctive object it creates (a table, column,
  constraint, policy, or function), not by diffing full schema definitions. If
  something behaves oddly in an area touched between June and September, suspect
  a hand-applied variant before suspecting the application code.

### Known repo/production parity gap

Code review on PR #373 surfaced that the drift runs deeper than the migration
history. These objects exist in production but are created by **no migration in
this chain**, so a database built purely from the repository does not reproduce
production:

| Object | Status |
| --- | --- |
| `public.set_updated_at()` and its 8 `updated_at` triggers | **Fixed** by `20260910000100_restore_updated_at_function_and_triggers.sql` |
| `public.documentation_templates` table | Still missing from the chain |
| `public.findings` table | Still missing from the chain |
| `public.subscriptions` table | Still missing from the chain |

The three tables were left for a separate change: reconstructing their columns,
indexes, constraints and RLS policies from production is exactly the kind of
work that produced `20260609180000_core_schema_foundation.sql`, and it deserves
its own review rather than being folded into a hardening PR. Until that lands,
**treat a from-scratch database build as incomplete** — this is the reason
`CRED test` cannot simply be replayed and trusted.

Assume this list is not exhaustive. It was found by pulling one thread; a full
schema diff between production and a scratch replay is the only way to know.

`CRED test` has **not** been reconciled. Its history also stops at
`20260623131000` and its schema is a different partial state again (it has the
deliverable-lifecycle objects but no `billing_accounts`, `workspace_memberships`,
or branding tables). Easiest fix when you next need CI: reset that project and
apply the whole chain from scratch, rather than reconciling it by hand.

## Rules that keep this from drifting again

1. **Never apply DDL through the Supabase dashboard.** Every schema change goes
   in a migration file, committed, then applied. Hand-applied DDL is what caused
   the June–September drift and hid two migrations that could never have run.
2. **Deploying and migrating are one act.** Production is live, so a merged
   migration that has not been applied is a broken deploy waiting to happen.
3. **Update this file** when either changes.

## Known-good verification

Run before any push (all passing as of 2026-09-10 on `main` + this branch):

```bash
npm run typecheck   # exit 0
npm run lint        # exit 0
npm test            # 500 pass / 0 fail
npm run build       # exit 0, incl. offline shell verification
```

## What is deliberately not done yet

These are real gaps, consciously deferred until someone outside the team can
sign up. Do not spend a scarce CRED evening on them before that:

- Recording where production is actually hosted, and confirming all 12
  production environment variables are set there (see `.env.example`).
- Product screenshots. `public/marketing/cred/` is empty, so every screenshot
  slot on the landing page renders a placeholder.
- Terms, privacy, and a contact route. The landing page says "contact us" twice
  with nowhere to go. Stripe and any ad platform will require these.
- Analytics and error monitoring.
- CI secrets for `integration-e2e.yml`. The workflow exists and is carefully
  written, but has never run: it skips silently when its secrets are absent.
- SendGrid sending-domain authentication and warm-up.
- Leaked-password protection is still disabled in Supabase Auth (dashboard
  toggle, not a migration).

## Open security notes

The Supabase security advisors are clean apart from one accepted item: the
membership predicates (`is_org_member`, `is_organization_member`,
`is_organization_admin`, `is_workspace_member`, `is_workspace_admin`) remain
executable by `anon` and `authenticated`. They are referenced inside RLS policy
expressions, which Postgres evaluates as the calling role, so revoking EXECUTE
would break every policy that calls one. They leak only a boolean about the
caller's own membership and require knowing an organization UUID. See
`supabase/migrations/20260910000000_harden_internal_function_grants.sql`.

## Planning documents

- `docs/LAUNCH_READINESS_AUDIT.md` — June 2026. Still useful as a manual QA
  checklist (section 4), but stale on scope and pricing; it predates the
  Essentials/Professional/Investigation tiers and quotes superseded prices.
