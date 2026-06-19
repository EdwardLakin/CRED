# CRED

AI inspection and documentation workspace.

## Supabase Storage setup

Session capture intake uses a private Supabase Storage bucket named `documentation-captures`.
The migration `supabase/migrations/20260609190000_session_capture_intake.sql` creates the bucket, applies the initial 15MB upload limit, and adds organization-scoped storage policies.

If your Supabase project was provisioned manually or migrations were not applied, create a private bucket named `documentation-captures` before using capture uploads. The app will fail gracefully with an upload error that mentions the missing bucket when storage is not configured.

## PWA asset note

Apple touch PNG icons should be generated manually from public/icons/cred-icon.svg before production launch.


## Stripe subscription billing setup

CRED uses Stripe Checkout for hosted subscription checkout and Stripe webhooks to keep organization billing state in sync.

### Environment variables

Add these variables to your local `.env.local` and production environment. Keep secret values server-only and never expose them in client code.

```bash
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

STRIPE_PRICE_INDIVIDUAL=price_1ThAYwITYwJQigUIwTUUk4PL
STRIPE_PRICE_TEAM=price_1ThAZvITYwJQigUIbW1gxWW7
STRIPE_PRICE_SHOP=price_1ThAboITYwJQigUIKi1yfGRe

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The app reads `STRIPE_PRICE_INDIVIDUAL`, `STRIPE_PRICE_TEAM`, and `STRIPE_PRICE_SHOP` when creating subscription Checkout Sessions. These values should match the Individual ($39/month), Team ($129/month), and Shop ($249/month) prices in Stripe Dashboard.

### Coupons and promotion codes

Stripe coupons and promotion codes are supported through hosted Checkout. Create and manage coupons and promotion codes in Stripe Dashboard; CRED does not implement custom coupon logic. When eligible promotion codes exist in Stripe, Checkout shows the promotion code field automatically during subscription checkout.

### Database migration

Apply the Supabase billing migrations, including `supabase/migrations/20260611144500_stripe_subscription_billing.sql`, `supabase/migrations/20260611170000_billing_plan_rename_individual_team_shop.sql`, and `supabase/migrations/20260611190000_app_controlled_billing_trial.sql`. They add these organization billing columns:

- `stripe_customer_id`
- `stripe_subscription_id`
- `plan`
- `subscription_status`
- `current_period_end`
- `trial_ends_at`
- `billing_started_at`

CRED uses a 7-day app-controlled free trial for new organizations. Stripe trial configuration is not required. Onboarding creates the organization with the selected Individual, Team, or Shop plan, sets `subscription_status` to `trialing`, and sets `trial_ends_at` to seven days after workspace creation. Users can access the dashboard and paid app actions during that app-controlled trial without completing Stripe Checkout. Stripe Checkout starts paid billing only after the user clicks Subscribe Now or starts checkout from a selected plan.

The migrations also create RPC helpers used by the authenticated checkout route and verified webhook route while preserving organization-scoped RLS for normal app access.

### Webhook endpoint

Configure a Stripe webhook endpoint that points to:

```text
https://YOUR_DOMAIN.com/api/stripe/webhook
```

Subscribe the endpoint to these events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET`.

### Local testing

Use the Stripe CLI to forward events to your local app:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Then copy the `whsec_...` value printed by the CLI into `.env.local`, start the app, sign in, and choose a plan from the landing page pricing section.

```bash
npm run dev
```

Logged-out pricing buttons route to `/sign-up?plan=individual`, `/sign-up?plan=team`, or `/sign-up?plan=shop`. After signup and onboarding, CRED preserves the selected plan on the organization and redirects to the dashboard for the 7-day app-controlled trial. Users can click Subscribe Now, or visit `/dashboard?checkout=individual`, `/dashboard?checkout=team`, or `/dashboard?checkout=shop`, to start hosted Stripe Checkout for the preserved plan.

## PDF report downloads

CRED exposes printable HTML report previews at `/api/dashboard/sessions/[id]/report-pdf` and true PDF downloads at `/api/dashboard/sessions/[id]/report-pdf/download`. The PDF download route runs in the Node.js runtime, reuses the approved printable report HTML as the report source, fetches report media during generation, and returns durable `application/pdf` bytes with a safe attachment filename.

Deployment notes:
- The current implementation avoids adding a bundled browser dependency because package installation for Playwright/serverless Chromium may be restricted in some deployment environments. It uses an internal server-side PDF renderer that embeds fetched JPEG/PNG evidence and signature images directly into the downloaded PDF.
- The route sets `maxDuration = 60`; Vercel deployments should allow enough function time and memory for large reports. A 20-photo report should be tested after deployment.
- HEIC/HEIF and other non-web-safe evidence continue to use the existing clean fallback behavior unless a preview-converted JPEG/PNG is available in the printable HTML.
