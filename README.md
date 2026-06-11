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

The app reads `STRIPE_PRICE_INDIVIDUAL`, `STRIPE_PRICE_TEAM`, and `STRIPE_PRICE_SHOP` when creating subscription Checkout Sessions. These values should match the Individual ($39/month), Team ($99/month), and Shop ($199/month) prices in Stripe Dashboard.

### Database migration

Apply the Supabase billing migrations, including `supabase/migrations/20260611144500_stripe_subscription_billing.sql` and `supabase/migrations/20260611170000_billing_plan_rename_individual_team_shop.sql`. They add these organization billing columns:

- `stripe_customer_id`
- `stripe_subscription_id`
- `plan`
- `subscription_status`
- `current_period_end`

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

Logged-out pricing buttons route to `/sign-up?plan=individual`, `/sign-up?plan=team`, or `/sign-up?plan=shop`. After signup and onboarding, CRED redirects to `/dashboard?checkout=<plan>` and starts Checkout for the preserved Individual, Team, or Shop plan.
