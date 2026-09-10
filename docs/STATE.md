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
| Hosting | **None yet.** No Vercel project exists for CRED. `cred.profixiq.com` is not served. |
| Domain | Not attached |
| Analytics / error monitoring | None installed |

## Migration state

Repository and production are **in sync** as of 2026-09-10: 66 migration files,
66 rows in `supabase_migrations.schema_migrations`, latest
`20260910000000_harden_internal_function_grants`.

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

`CRED test` has **not** been reconciled. Its history also stops at
`20260623131000` and its schema is a different partial state again (it has the
deliverable-lifecycle objects but no `billing_accounts`, `workspace_memberships`,
or branding tables). Easiest fix when you next need CI: reset that project and
apply the whole chain from scratch, rather than reconciling it by hand.

## Rules that keep this from drifting again

1. **Never apply DDL through the Supabase dashboard.** Every schema change goes
   in a migration file, committed, then applied. Hand-applied DDL is what caused
   the June–September drift and hid two migrations that could never have run.
2. **Deploying and migrating are one act.** Once the Vercel project exists, do
   not merge a migration without applying it.
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

- Vercel project, domain, production environment variables (12 of them — see
  `.env.example`).
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
