# CRED MVP Launch Readiness Audit

Audit date: 2026-06-11

Scope: small controlled beta / first public ad test readiness for the current MVP only. This audit intentionally does **not** recommend dispatch, invoicing, inventory, scheduling, CRM, customer portals, or third-party integrations.

## 1. Executive Summary

### Is CRED ready for a small beta?

**Ready for controlled beta after external-service setup is verified and one complete manual E2E smoke test passes in production.**

The repo covers the requested MVP flow: auth, onboarding, app-controlled trial, Stripe Checkout/webhooks, session capture, template import/selection, required evidence review, mobile-oriented capture, notes/transcripts fields, AI classification/extraction, human review gate, signatures, printable HTML reports, secure share links, SendGrid report email, usage limits, billing gates, Supabase RLS/storage hardening, and PWA basics.

The codebase also passes local static checks and production build in this audit. The remaining launch risk is mostly **configuration and live-service verification**, not missing product scope.

### Is CRED ready for paid ads?

**Not yet.** Paid traffic should wait until the production environment has been verified end-to-end with real service credentials, storage policies, webhook delivery, report email delivery, share-link access, mobile upload retry behavior, trial expiry, and usage-limit failure states.

### Remaining launch blockers

P0 blockers before inviting beta users:

1. **Production external services must be verified live**: Supabase migrations/RLS/storage buckets, auth redirect URLs, Stripe products/prices/webhook, SendGrid sender/domain, OpenAI key, and Vercel production environment variables.
2. **Production E2E smoke test must pass** using a fresh user through signup, onboarding, trial access, capture, AI, review, signature, printable report, SendGrid email, share link, and Stripe Checkout.
3. **Confirm private storage buckets and bucket limits in the real Supabase project**, especially because capture storage is migration-limited to 100 MB but template/signature buckets are created as private without explicit bucket-level MIME/size limits.
4. **Confirm `SUPABASE_SERVICE_ROLE_KEY` is production-only server-side and present** for public share-link rendering. Public share pages and shared report HTML use the admin client.

### What should not be built yet

Do **not** build or expand into:

- Dispatch.
- Invoicing, accounting, payments collection beyond Stripe subscription checkout.
- Inventory or parts tracking.
- Scheduling/calendar workflows.
- CRM/customer portal.
- Native PDF generation beyond printable HTML.
- Live GPS tracking.
- Integrations with shop management systems, QuickBooks, payment processors, calendars, or CRMs.
- Overage billing automation.

These are outside MVP scope and would delay learning from the controlled beta.

## 2. Required Environment Variables

Notes:

- “Required in Production” means required for the production MVP feature set.
- “Required in Preview” means required if Preview is used as the staging/E2E validation environment. A bare build can pass without these values, but runtime MVP flows need them.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is documented in `README.md` but not currently used by app code; checkout is started server-side and redirects to Stripe's hosted Checkout URL.
- `.env.example` also includes `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, but this audit found no code usage. It is not part of the required MVP runtime list.

### Supabase

| Env var | Required in Production? | Required in Preview? | Used by files/routes/actions | What breaks if missing |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Yes | `src/lib/env.ts`; browser Supabase client in `src/lib/supabase/client.ts`; server Supabase client in `src/lib/supabase/server.ts`; admin Supabase client in `src/lib/supabase/admin.ts`; all auth, dashboard, session, capture, template, signature, report, share-link, and webhook flows that create a Supabase client. | Runtime errors: `Missing NEXT_PUBLIC_SUPABASE_URL`. Auth, onboarding, dashboard reads, uploads, share links, Stripe webhook DB sync, and all database-backed actions fail. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Yes | `src/lib/env.ts`; `src/lib/supabase/client.ts`; `src/lib/supabase/server.ts`; all user-session Supabase reads/writes. | Runtime errors: `Missing NEXT_PUBLIC_SUPABASE_ANON_KEY`. Sign up/sign in, onboarding, dashboard, capture, reports, billing-gated actions, and authenticated DB operations fail. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Yes for share-link QA | `src/lib/env.ts`; `src/lib/supabase/admin.ts`; public share page `app/reports/share/[token]/page.tsx`; shared printable report route `app/api/dashboard/sessions/[id]/report-pdf/route.ts`. | Runtime errors: `Missing SUPABASE_SERVICE_ROLE_KEY` on public share-link views and shared printable reports. Secure report links will 500/not render even when tokens exist. |

### OpenAI

| Env var | Required in Production? | Required in Preview? | Used by files/routes/actions | What breaks if missing |
| --- | --- | --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Yes for AI QA | `src/lib/openai/capture-classifier.ts`; `src/lib/openai/capture-extractor.ts`; invoked by `src/features/capture/actions.ts` for AI classification and extraction. | AI classification/extraction throws `OPENAI_API_KEY_MISSING`; capture can still exist, but AI-assisted classification/extraction cannot run. |

### Stripe

| Env var | Required in Production? | Required in Preview? | Used by files/routes/actions | What breaks if missing |
| --- | --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | Yes | Yes for checkout QA | `src/lib/stripe/index.ts`; required by `app/api/billing/checkout/route.ts`; used for Stripe customer and subscription Checkout Session creation. | Checkout route returns billing configuration error / cannot create customers or Checkout Sessions. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | No, not with current code | No, not with current code | Documented in `README.md`; no code usage found. | Nothing currently breaks because the app does not use Stripe.js/client-side confirmation. Keep only if planned for future Stripe.js UI. |
| `STRIPE_WEBHOOK_SECRET` | Yes | Yes for webhook QA | `src/lib/stripe/index.ts`; `app/api/stripe/webhook/route.ts` verifies Stripe signatures and syncs organization subscription state. | Webhook verification fails; subscription status, plan, customer ID, subscription ID, and payment-failure state will not sync reliably. |
| `STRIPE_PRICE_INDIVIDUAL` | Yes | Yes for checkout QA | `src/lib/stripe/index.ts`; `app/api/billing/checkout/route.ts`. | Individual Checkout cannot start; checkout validation returns incomplete billing configuration. |
| `STRIPE_PRICE_TEAM` | Yes | Yes for checkout QA | `src/lib/stripe/index.ts`; `app/api/billing/checkout/route.ts`. | Team Checkout cannot start; checkout validation returns incomplete billing configuration. |
| `STRIPE_PRICE_SHOP` | Yes | Yes for checkout QA | `src/lib/stripe/index.ts`; `app/api/billing/checkout/route.ts`. | Shop Checkout cannot start; checkout validation returns incomplete billing configuration. |

### SendGrid

| Env var | Required in Production? | Required in Preview? | Used by files/routes/actions | What breaks if missing |
| --- | --- | --- | --- | --- |
| `SENDGRID_API_KEY` | Yes | Yes for email QA | `src/lib/email/reports.ts`; invoked by `src/features/reports/actions.ts` `emailReport`. | Report email delivery fails with “Email delivery is not configured.” |
| `REPORT_EMAIL_FROM` | Yes | Yes for email QA | `src/lib/email/reports.ts`; invoked by `src/features/reports/actions.ts` `emailReport`. | Report email delivery fails with “Email delivery is not configured,” or SendGrid rejects mail if sender/domain is not approved. |

### App

| Env var | Required in Production? | Required in Preview? | Used by files/routes/actions | What breaks if missing |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Yes | Yes for checkout/email/share QA | `app/api/billing/checkout/route.ts` for Stripe success/cancel URLs; `src/features/reports/actions.ts` for SendGrid secure share-link URLs; `app/dashboard/sessions/[id]/report/page.tsx` for displayed share URLs. | Stripe Checkout cannot start if missing/invalid. Report email cannot generate absolute public share links. Share URLs may display as relative or use fallback host in report UI. |

## 3. External Service Setup Checklist

### Supabase

- [ ] Apply all migrations in order through `supabase/migrations/20260611233000_report_review_gate.sql`.
- [ ] Confirm RLS is enabled on app tables created by migrations, including organizations/profiles/company profiles, documentation sessions, capture items/events, templates/imports/required evidence, signatures, report share tokens, exports, and usage events.
- [ ] Confirm RPC helpers exist and are callable with intended permissions:
  - `create_onboarding_workspace`
  - `set_organization_stripe_customer`
  - `sync_organization_subscription`
- [ ] Confirm storage buckets exist:
  - `documentation-captures`
  - `documentation-templates`
  - `documentation-signatures`
- [ ] Confirm all three buckets are **private**.
- [ ] Confirm capture bucket limits match app limits:
  - Bucket max object size: 100 MB.
  - Allowed MIME types include PDF, image, audio, and video types used by the app.
- [ ] Confirm template bucket policy allows only organization-owned paths like `organizations/{organizationId}/templates/{file}`.
- [ ] Confirm signature bucket policy allows only organization-owned session paths like `organizations/{organizationId}/sessions/{sessionId}/signatures/{file}`.
- [ ] Confirm template/signature buckets have acceptable project-level or bucket-level size/MIME restrictions. Current migrations create them private, but do not set explicit `file_size_limit` / `allowed_mime_types` for those buckets.
- [ ] Confirm authenticated storage policies prevent cross-organization reads/writes/deletes.
- [ ] Confirm service-role key is set only in server-side runtime env and never exposed to the browser.
- [ ] Confirm Supabase Auth Site URL is `https://cred.profixiq.com`.
- [ ] Confirm Supabase Auth Redirect URLs include:
  - `https://cred.profixiq.com/auth/callback`
  - `https://cred.profixiq.com/onboarding`
  - Any Vercel Preview URL intentionally used for staging QA.
- [ ] Fresh-user signup email confirmation works with the production domain.

### Stripe

- [ ] Products/prices exist for:
  - Individual: $39/month.
  - Team: $99/month.
  - Shop: $199/month.
- [ ] `STRIPE_PRICE_INDIVIDUAL`, `STRIPE_PRICE_TEAM`, and `STRIPE_PRICE_SHOP` match the intended live-mode price IDs.
- [ ] Webhook endpoint points to `https://cred.profixiq.com/api/stripe/webhook`.
- [ ] Webhook endpoint uses live-mode signing secret stored in `STRIPE_WEBHOOK_SECRET`.
- [ ] Webhook events selected:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- [ ] Checkout success URL resolves to `/dashboard?billing=success`.
- [ ] Checkout cancel URL resolves to `/dashboard?billing=cancelled`.
- [ ] Test Checkout works for a trialing user upgrading to paid.
- [ ] Completed checkout updates organization subscription/customer fields through webhook.
- [ ] Failed payment updates status to `past_due` through webhook.

### SendGrid

- [ ] Sending domain is authenticated, or single sender is verified.
- [ ] `REPORT_EMAIL_FROM` is an approved verified sender.
- [ ] `SENDGRID_API_KEY` has Mail Send permission.
- [ ] API key is production-safe and not restricted to an unrelated sandbox/domain.
- [ ] Test printable report email sends to at least two recipient domains.
- [ ] Email includes a secure printable report link and “Print / Save as PDF” guidance.
- [ ] Recipient can open the link without login.
- [ ] Disabled/expired share links stop working.

### Vercel

- [ ] Production env vars are set for Supabase, OpenAI, Stripe, SendGrid, and app URL.
- [ ] Preview env vars are set if Preview is used for staging QA.
- [ ] Custom domain `cred.profixiq.com` is attached and serving HTTPS.
- [ ] Latest production deployment is green.
- [ ] `npm run build` passes in Vercel with the selected Node/runtime version.
- [ ] Confirm Next.js 16.2.7 / Turbopack build behavior is compatible with Vercel project settings.
- [ ] Confirm server actions and Node runtime routes work in production:
  - `/api/billing/checkout`
  - `/api/stripe/webhook`
  - `/api/dashboard/sessions/[id]/report-pdf`
- [ ] PWA manifest and service worker are served with correct cache behavior.
- [ ] Generate Apple touch PNG icons from `public/icons/cred-icon.svg` before broad public launch.

### OpenAI

- [ ] `OPENAI_API_KEY` is set in production.
- [ ] AI classification action succeeds on a normal evidence photo.
- [ ] AI extraction action succeeds on VIN/plate/document/defect evidence.
- [ ] Failure state is tested by temporarily using an invalid key or local override and confirming the UI shows safe retryable messaging.
- [ ] Usage limits block AI work before provider calls when plan limits are exhausted.
- [ ] Confirm prompts/copy describe AI as assistance, not fully automated compliance.

## 4. Manual End-to-End QA Checklist

Run this in production before beta invites and again before paid ads.

### A. New user signup / onboarding / trial

- [ ] Visit `https://cred.profixiq.com` in a clean browser profile.
- [ ] Click a pricing CTA for Individual, Team, and Shop in separate test runs.
- [ ] Create a new user.
- [ ] If email confirmation is required, confirm via email and return through `/auth/callback`.
- [ ] Complete onboarding with full name, company name, industry, and selected plan.
- [ ] Confirm dashboard loads.
- [ ] Confirm organization is created with selected plan, `subscription_status = trialing`, and a future `trial_ends_at`.
- [ ] Confirm dashboard indicates trial/subscribe state without blocking MVP actions during the valid trial.

### B. Stripe checkout

- [ ] From dashboard, click Subscribe Now / Start Checkout.
- [ ] Confirm hosted Stripe Checkout opens for the selected plan and correct price.
- [ ] Complete checkout with a Stripe test card in test mode or a safe live-mode internal test if already live.
- [ ] Confirm redirect to `/dashboard?billing=success`.
- [ ] Confirm webhook updates organization fields:
  - `stripe_customer_id`
  - `stripe_subscription_id`
  - `plan`
  - `subscription_status`
  - `current_period_end`
- [ ] Repeat cancel flow and confirm redirect to `/dashboard?billing=cancelled` without corrupting billing state.

### C. Create inspection/documentation session

- [ ] Create a new documentation session.
- [ ] Choose a session type.
- [ ] Optionally choose a workflow template.
- [ ] Save asset/customer details.
- [ ] Confirm session appears in dashboard/session list.

### D. Capture photos and notes

- [ ] On a mobile device, open the capture page.
- [ ] Capture/upload a supported image.
- [ ] Add technician note text.
- [ ] Add another item with different evidence type.
- [ ] Confirm uploads show in the capture/session UI.
- [ ] Confirm storage object paths are organization/session scoped.

### E. Retry failed upload

- [ ] Start an upload and force a failure by going offline, using an unsupported MIME type, or selecting an oversized file.
- [ ] Confirm the UI surfaces a safe error.
- [ ] Return online / select an allowed file.
- [ ] Retry upload.
- [ ] Confirm a successful retry does not create duplicate broken rows or orphaned included evidence.

### F. Run AI classification / extraction

- [ ] Run classification on pending captures.
- [ ] Confirm recognized labels appear.
- [ ] Run extraction on supported image evidence.
- [ ] Confirm extracted details and confidence summary appear.
- [ ] Confirm an invalid/missing OpenAI key produces a controlled failure and does not mark evidence as successfully analyzed.

### G. Review/edit extracted details

- [ ] Review extracted fields.
- [ ] Apply at least one extracted value to session details.
- [ ] Edit a technician note manually after AI runs.
- [ ] Confirm report preview reflects the edited values, not only raw AI output.

### H. Required evidence checklist

- [ ] Select/import a template with required evidence.
- [ ] Confirm missing required evidence is visible before capture completion.
- [ ] Add evidence matching at least one required item.
- [ ] Confirm checklist updates.
- [ ] Attempt to mark report reviewed with missing required evidence.
- [ ] Confirm explicit missing-evidence acknowledgement is required before generating anyway.

### I. Capture signature

- [ ] Add a technician or customer signature.
- [ ] Confirm signature image uploads to `documentation-signatures`.
- [ ] Confirm signature appears on session and printable report.
- [ ] Confirm storage usage event is recorded.

### J. Mark report reviewed

- [ ] Open report page.
- [ ] Confirm delivery buttons are disabled before review.
- [ ] Mark report reviewed after checklist review.
- [ ] Confirm `review_status = ready_for_delivery`, `reviewed_at`, and `reviewed_by` are set.
- [ ] Confirm delivery buttons enable only after review.

### K. Open printable report

- [ ] Click Open Printable Report.
- [ ] Confirm a new printable HTML report opens.
- [ ] Confirm Content-Type is HTML, not binary PDF.
- [ ] Confirm report includes captures, notes, extracted fields, signatures, and organization/session details.
- [ ] Use browser Print / Save as PDF and confirm output is acceptable.

### L. Email printable report through SendGrid

- [ ] Enter one recipient.
- [ ] Send printable report email.
- [ ] Confirm UI success state.
- [ ] Confirm SendGrid accepts the message and records a provider message ID in export metadata.
- [ ] Confirm recipient receives email and link.
- [ ] Repeat with multiple recipients up to the allowed count.

### M. Create secure share link

- [ ] Create share link with an expiration date.
- [ ] Confirm link appears with view count, expiration, and active status.
- [ ] Open link in an incognito browser.
- [ ] Disable link and confirm it stops working.
- [ ] Create another link and confirm active share-link usage limits are respected.

### N. Public recipient opens share link without login

- [ ] Open the share link from a browser with no CRED session.
- [ ] Confirm public share page loads.
- [ ] Confirm iframe printable report loads.
- [ ] Confirm signed evidence/signature media appears.
- [ ] Confirm view count and last viewed timestamp update.
- [ ] Confirm expired and disabled links return not found.

### O. Trial expired user is blocked from paid actions but can subscribe

- [ ] Set test organization trial end to a past timestamp.
- [ ] Confirm read-only/account/dashboard access still allows user to reach billing/checkout entry point.
- [ ] Confirm creating/editing product data, uploads, AI actions, email, share link, signatures, and final printable exports are blocked with “Your trial has ended. Subscribe to continue.”
- [ ] Confirm Stripe Checkout is not blocked.
- [ ] Complete subscription and confirm actions unblock after webhook sync.

### P. Usage limits block oversized files / excessive AI/email/share

- [ ] Upload over plan capture-size limit and confirm block message.
- [ ] Upload over video-size limit and confirm block message.
- [ ] Exhaust or simulate AI monthly limit and confirm classification/extraction blocks before provider call.
- [ ] Exhaust or simulate email monthly limit and confirm email blocks.
- [ ] Exhaust or simulate active share-link limit and confirm link creation blocks.
- [ ] Confirm storage limit blocks once cumulative `storage_bytes_added` exceeds plan allowance.

### Q. Organization isolation test if possible

- [ ] Create Organization A and Organization B with separate users.
- [ ] Create sessions/captures/templates/signatures/share links in both.
- [ ] As User A, attempt to access User B dashboard/session/report URLs directly.
- [ ] Confirm authenticated routes do not reveal Organization B data.
- [ ] As User A, attempt to use a forged storage path under Organization B.
- [ ] Confirm RLS/storage policy blocks access.
- [ ] Confirm public share links only expose the token-scoped report they were created for.

## 5. Remaining P0/P1/P2 Items

### P0 — must fix/verify before even small beta

- [ ] Verify all production environment variables listed above are present and correct.
- [ ] Verify Supabase migrations are fully applied in production.
- [ ] Verify Supabase Auth Site URL and Redirect URLs are set to `https://cred.profixiq.com` and intended preview domains only.
- [ ] Verify storage buckets exist, are private, and enforce organization-scoped access.
- [ ] Verify Stripe live/test mode is intentional, price IDs match the displayed plan prices, and webhook delivery updates organization billing state.
- [ ] Verify SendGrid sender/domain and report email delivery.
- [ ] Verify OpenAI classification/extraction success and safe failure states.
- [ ] Run the complete manual E2E checklist in production with a fresh user.

### P1 — should fix/verify before paid ads

- [ ] Add explicit bucket-level size/MIME limits for `documentation-templates` and `documentation-signatures`, or document the compensating controls. The app validates these uploads, but bucket-level limits are stronger.
- [ ] Update `.env.example` to include the full production-required variable list and remove or label unused variables. Do not block beta solely on this if Vercel env vars are correct.
- [ ] Generate Apple touch PNG icons from `public/icons/cred-icon.svg`.
- [ ] Run a real mobile-network QA pass for camera upload reliability and retry behavior.
- [ ] Confirm report email deliverability across Gmail/Outlook/custom domains.
- [ ] Add an operational runbook for failed Stripe webhook replay, SendGrid rejection, and Supabase storage policy errors.
- [ ] Confirm analytics/observability basics in Vercel/Supabase/Stripe/SendGrid for launch triage.

### P2 — polish after initial validation

- [ ] Improve report visual polish after reviewing real customer samples.
- [ ] Add clearer in-app diagnostics for missing env/provider configuration in admin-only contexts.
- [ ] Add richer retry UX for intermittent mobile uploads.
- [ ] Add optional true binary PDF generation later if customer validation proves it is necessary.
- [ ] Improve usage dashboards and self-service upgrade prompts.
- [ ] Add deletion/storage reconciliation if customers ask for accurate storage recovery after deletes.

## 6. Known Product Truths / Copy Guardrails

Use these copy constraints everywhere before launch:

- Say **Printable reports**, not binary PDF downloads.
- Say **Secure report links**, not customer portal.
- Say **AI-assisted extraction/classification**, not fully automated compliance.
- Say **Documentation-only charges/subscription**, not invoicing/accounting.
- Say **Optional GPS start/end points**, not live tracking.
- Say **Use your browser Print / Share menu to save as PDF** when explaining report output.
- Do not imply CRED dispatches technicians, schedules jobs, creates invoices, collects customer payment, manages parts inventory, or syncs with external systems.

## 7. Launch Decision

**Ready for beta but not paid ads.**

Why:

- The repository implements the controlled-beta MVP surface without adding non-MVP product scope.
- Local typecheck, lint, production build, and diff whitespace checks pass.
- The architecture has the necessary gates for trial/billing, usage limits, human review, private storage, secure share links, and report delivery.
- Remaining P0 work is operational verification in the real production environment. Until live Supabase, Stripe, SendGrid, OpenAI, and Vercel configuration is proven with a fresh-user E2E test, CRED should not accept uncontrolled public traffic.
- Paid ads should wait until beta feedback confirms the onboarding-to-report path is understandable, mobile uploads are reliable, email/share deliverability is acceptable, and support/incident workflows are ready.

## 8. Testing

Commands run for this audit:

- `npm run typecheck` — Pass. TypeScript completed without errors. NPM printed a warning: `Unknown env config "http-proxy"`; this did not fail the command.
- `npm run lint` — Pass. ESLint completed without errors. NPM printed the same `http-proxy` warning; this did not fail the command.
- `npm run build` — Pass. Next.js 16.2.7 / Turbopack production build completed successfully and generated all app routes.
- `git diff --check` — Pass. No whitespace errors after creating this audit document.
